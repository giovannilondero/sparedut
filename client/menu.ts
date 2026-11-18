/**
 * The main menu: name, language, matches, armoury, settings, glossary. It draws the menu model
 * and forwards the player's events to it; what a choice means is the model's to decide.
 */
import type { BotLevel, ModeId } from "../shared/folklore.ts"
import type { MapId } from "../shared/map.ts"
import type { Access, Reach, RoomSummary } from "../shared/protocol.ts"
import { PRIMARIES, WEAPON_IDS, WEAPONS, type PrimaryId } from "../shared/weapons.ts"
// UI SDK's radio group: one tab stop, arrow keys, the radio role. Markup and styling stay the game's.
import "@ui-sdk/web/radio"
import type { GameAudio } from "./contracts.ts"
import { esc } from "./hud.ts"
import { onLangChange, setLang, t, type Lang, type StaticKey } from "./i18n.ts"
import { MenuModel, SCREENS, type CreateOptions, type Outcome, type Refusal } from "./menu-model.ts"
import type { Settings } from "./settings.ts"

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

export interface MenuHandlers {
  /** `oneTap`: the home screen's button, whose match starts at once, without warm-up. */
  readonly create: (o: CreateOptions, oneTap?: boolean) => void
  /** `password` only once the player typed one (from the prompt or an invite link). */
  readonly join: (code: string, password?: string) => void
  /** The map chosen in the menu: it becomes the background. */
  readonly mapChanged: (id: MapId) => void
  readonly settingsChanged: () => void
}

/** The label of each reach and access among creation's choices: every member needs one. */
const REACH_LABEL = { lan: "reachLan", online: "reachOnline", offline: "reachOffline" } as const satisfies Record<Reach, StaticKey>
const ACCESS_LABEL = { open: "accessOpen", password: "accessPassword" } as const satisfies Record<Access, StaticKey>

export class Menu {
  private readonly model: MenuModel
  private tipIndex = Math.floor(Math.random() * 100)

  constructor(private readonly settings: Settings, private readonly audio: GameAudio, private readonly handlers: MenuHandlers) {
    this.model = new MenuModel(settings, handlers.settingsChanged)
    for (const el of document.querySelectorAll<HTMLElement>("[data-go]")) {
      el.addEventListener("click", () => {
        audio.unlock()
        audio.play("ui_click")
        const go = el.dataset.go!
        if (go === "one-tap") this.apply(this.model.oneTap())
        else this.go(go as (typeof SCREENS)[number])
      })
    }
    for (const el of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
      el.addEventListener("click", () => {
        audio.play("ui_click")
        settings.lang = el.dataset.lang as Lang
        setLang(settings.lang)
        handlers.settingsChanged()
      })
    }
    document.addEventListener("mouseover", (e) => {
      if ((e.target as HTMLElement).closest?.("#menu button")) audio.play("ui_hover", { volume: 0.4 })
    })
    // Esc: from submenus, go back to the main screen.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || $("menu").classList.contains("hidden")) return
      if (this.model.back()) {
        e.preventDefault()
        audio.play("ui_click")
        this.render()
      } else if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
    })
    const name = $<HTMLInputElement>("name")
    name.value = settings.name
    name.addEventListener("input", () => this.model.typeName(name.value))
    this.bindCreate()
    this.bindSettings()
    const code = $<HTMLInputElement>("j-code")
    code.addEventListener("input", () => this.model.typeCode(code.value))
    $("j-go").addEventListener("click", () => this.apply(this.model.joinByCode()))
    code.addEventListener("keydown", (e) => e.key === "Enter" && this.apply(this.model.joinByCode()))
    const password = $<HTMLInputElement>("pw-input")
    password.addEventListener("input", () => this.model.typePassword(password.value))
    $("pw-go").addEventListener("click", () => this.apply(this.model.joinWithPassword()))
    password.addEventListener("keydown", (e) => e.key === "Enter" && this.apply(this.model.joinWithPassword()))
    onLangChange(() => this.renderTexts())
    setLang(settings.lang)
    setInterval(() => this.showTip(), 9000)
  }

  /** Everything the menu writes from JS, in the active language. */
  private renderTexts() {
    for (const el of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
      el.classList.toggle("selected", el.dataset.lang === this.settings.lang)
      el.setAttribute("aria-pressed", String(el.dataset.lang === this.settings.lang))
    }
    this.renderCreate()
    this.buildArmarie()
    $("vocabolari").innerHTML = t().menu.vocab.map(([w, d]) => `<p><b>${w}</b> — ${d}</p>`).join("")
    this.renderRooms()
    $("tip").textContent = t().tips[this.tipIndex % t().tips.length]
  }

  private showTip() {
    const tip = $("tip")
    tip.style.opacity = "0"
    setTimeout(() => {
      const tips = t().tips
      tip.textContent = tips[++this.tipIndex % tips.length]
      tip.style.opacity = "1"
    }, 400)
  }

  /** Syncs the checkboxes with settings changed from outside (F3). */
  syncSettings() {
    $<HTMLInputElement>("s-info").checked = this.settings.showInfo
  }

  show(on: boolean) {
    $("menu").classList.toggle("hidden", !on)
    if (on) this.go("home")
  }

  status(text: string) {
    $("status").textContent = text
  }

  go(screen: (typeof SCREENS)[number]) {
    this.apply(this.model.go(screen))
  }

  /** Acts on the model's answer: sends the request, shows why it was refused, or draws the new screen. */
  private apply(o: Outcome) {
    if (o.kind === "send") {
      const r = o.request
      if (r.t === "create") this.handlers.create(r.room, r.oneTap)
      else this.handlers.join(r.code, r.password)
      return
    }
    this.render()
    if (o.kind === "refused") this.refused(o.reason)
  }

  private refused(reason: Refusal) {
    if (reason === "needName") {
      const input = $<HTMLInputElement>("name")
      input.focus()
      input.placeholder = t().menu.needName
    } else if (reason === "passwordBad" && this.model.screen === "create") {
      $("c-msg").textContent = t().menu.passwordBad
      $("c-password").focus()
    } else if (reason === "passwordBad") $("pw-msg").textContent = t().menu.passwordBad
    // A code that is not four letters, or a full room, sends nothing: the screen already shows why.
  }

  /** Shows the model's screen. */
  private render() {
    const screen = this.model.screen
    for (const s of SCREENS) $(`menu-${s}`).classList.toggle("hidden", s !== screen)
    if (screen === "join") setTimeout(() => $("j-code").focus(), 50)
    if (screen === "password") {
      $<HTMLInputElement>("pw-input").value = this.model.typedPassword
      $("pw-for").textContent = t().menu.passwordFor(this.model.passwordFor)
      setTimeout(() => $("pw-input").focus(), 50)
    }
  }

  /** Asks for a password room's password; `message` says why the last one did not work. */
  askPassword(code: string, message = "") {
    $("menu").classList.remove("hidden")
    this.apply(this.model.askPassword(code))
    $("pw-msg").textContent = message
    $<HTMLInputElement>("pw-input").select()
  }

  rooms(list: readonly RoomSummary[]) {
    this.model.rooms(list)
    this.renderRooms()
  }

  private renderRooms() {
    const list = this.model.roomList
    const ul = $("room-list")
    const s = t()
    if (!list.length) {
      ul.innerHTML = `<li class="muted">${s.menu.roomsEmpty}</li>`
      return
    }
    ul.innerHTML = list
      .map(({ room: r, selectable }) => {
        const access = r.reach === "offline" ? null : r.access
        const passwordMark = access === "password" ? ` <i class="password-mark" role="img" aria-label="${s.menu.passwordRoom}" title="${s.menu.passwordRoom}">🔒</i>` : ""
        return `<li><button data-code="${r.code}"${selectable ? "" : " disabled"}><span><i class="chip ${r.reach}">${s.menu.reach[r.reach]}</i>${passwordMark} <b>${esc(r.host)}</b> · ${s.modes[r.mode].name} · ${s.maps[r.map].name}</span><span>${selectable ? "" : `${s.menu.full} · `}${r.players}/${r.max}👤 ${r.bots}🤖 · ${r.code}</span></button></li>`
      })
      .join("")
    for (const b of ul.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")) {
      b.addEventListener("click", () => this.apply(this.model.joinFromList(b.dataset.code!)))
    }
  }

  // ---------------------------------------------------------------- create match

  /** Listeners only once: the cards are redrawn on every choice and every language change. */
  private bindCreate() {
    const options = this.model.options
    const reach = $<HTMLElementTagNameMap["ui-radio-group"]>("c-reach")
    reach.innerHTML = options.reaches.map((r) => `<ui-radio class="card" value="${r}"><b data-t="${REACH_LABEL[r]}"></b></ui-radio>`).join("")
    $("c-access").innerHTML = options.accesses.map((a) => `<option value="${a}" data-t="${ACCESS_LABEL[a]}"></option>`).join("")
    $("mode-cards").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-mode]")
      if (!b) return
      this.model.chooseMode(b.dataset.mode as ModeId)
      this.audio.play("ui_click")
      this.renderCreate()
    })
    $("map-cards").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-map]")
      if (!b) return
      const map = b.dataset.map as MapId
      this.model.chooseMap(map)
      this.audio.play("ui_click")
      this.handlers.mapChanged(map)
      this.renderCreate()
    })
    $("c-level").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-level]")
      if (!b) return
      this.model.chooseLevel(b.dataset.level as BotLevel)
      this.audio.play("ui_click")
      this.renderCreate()
    })
    const minutes = $<HTMLSelectElement>("c-minutes")
    minutes.addEventListener("change", () => this.model.chooseMinutes(Number(minutes.value)))
    const bots = $<HTMLSelectElement>("c-bots")
    bots.addEventListener("change", () => this.model.chooseBots(Number(bots.value)))
    const ff = $<HTMLInputElement>("c-ff")
    ff.addEventListener("change", () => this.model.chooseFriendlyFire(ff.checked))
    // An Offline room lives in this browser: what only the server offers (access, password) hides.
    reach.addEventListener("valuechange", (e) => {
      // The group allows no value; the model always holds one, so a change to none is refused.
      if (e.detail.value === null) return e.preventDefault()
      this.model.chooseReach(e.detail.value as Reach)
      this.audio.play("ui_click")
      this.renderFields()
    })
    const access = $<HTMLSelectElement>("c-access")
    access.addEventListener("change", () => {
      this.model.chooseAccess(access.value as Access)
      this.renderFields()
      $("c-msg").textContent = ""
      if (this.model.fields.password) $("c-password").focus()
    })
    const password = $<HTMLInputElement>("c-password")
    password.addEventListener("input", () => this.model.typeRoomPassword(password.value))
    $("c-go").addEventListener("click", () => {
      const o = this.model.create()
      if (o.kind === "send") $("c-msg").textContent = ""
      this.apply(o)
    })
    const choices = this.model.choices
    reach.value = choices.reach
    access.value = choices.access
    ff.checked = choices.ff
    this.renderFields()
  }

  /** Shows only the fields that apply to the choices. */
  private renderFields() {
    const fields = this.model.fields
    $("menu-create").toggleAttribute("data-access-applies", fields.access)
    $("c-password-field").hidden = !fields.password
  }

  private renderCreate() {
    const s = t()
    const { options, choices } = this.model
    $("mode-cards").innerHTML = options.modes.map(
      (id) =>
        `<button class="card${id === choices.mode ? " selected" : ""}" data-mode="${id}" aria-pressed="${id === choices.mode}"><b>${s.modes[id].name}</b><small>${s.modes[id].sub}</small><small>${s.modes[id].rules}</small></button>`
    ).join("")
    $("map-cards").innerHTML = options.maps.map(
      (id) =>
        `<button class="card${id === choices.map ? " selected" : ""}" data-map="${id}" aria-pressed="${id === choices.map}"><b>${s.maps[id].name}</b><small>${s.maps[id].sub}</small></button>`
    ).join("")
    $("c-level").innerHTML = options.levels.map(
      (l) =>
        `<button class="card${l === choices.level ? " selected" : ""}" data-level="${l}" role="radio" aria-checked="${l === choices.level}"><b>${s.levels[l].name}</b><small>${s.levels[l].sub}</small></button>`
    ).join("")
    // The selects are rewritten in the active language, keeping the chosen value.
    const minutes = $<HTMLSelectElement>("c-minutes")
    minutes.innerHTML = options.minutes.map((m) => `<option value="${m}">${s.menu.minutes(m)}</option>`).join("")
    minutes.value = String(choices.minutes)
    const bots = $<HTMLSelectElement>("c-bots")
    bots.innerHTML = options.bots.map((i) => `<option value="${i}">${i === 0 ? s.menu.botsNone : i}</option>`).join("")
    bots.value = String(choices.bots)
  }

  // ---------------------------------------------------------------- armoury

  buildArmarie(target: HTMLElement = $("armarie"), onPick?: (p: PrimaryId) => void) {
    const max = { damage: 110, rate: 10, range: 400, mag: 30 }
    const render = () => {
      const s = t()
      // The mitraie can't be carried: it stays on the turrets.
      target.innerHTML = WEAPON_IDS.filter((id) => id !== "mitraie").map((id) => {
        const w = WEAPONS[id]
        const text = s.weapons[id]
        const primary = (PRIMARIES as readonly string[]).includes(id)
        const rate = 60 / w.cooldownTicks
        const bar = (label: string, v: number) => `<div class="stat">${label}<i style="width:${Math.min(100, v * 100)}%"></i></div>`
        const tag = primary ? s.menu.tag.primary : id === "lanciafrico" ? s.menu.tag.power : id === "mescul" ? s.menu.tag.melee : s.menu.tag.pistol
        return `<button class="weapon${id === this.settings.primary ? " selected" : ""}${primary ? "" : " locked"}" data-w="${id}">
          <span class="tag">${w.slot} · ${tag}</span><b>${text.name}</b><span class="blurb">${text.blurb}</span>
          ${bar(s.menu.stat.damage, (w.damage * w.pellets) / max.damage)}${bar(s.menu.stat.rate, rate / max.rate)}${bar(s.menu.stat.range, (w.range || 120) / max.range)}${bar(s.menu.stat.mag, Math.max(w.magazine, 1) / max.mag)}
        </button>`
      }).join("")
      for (const b of target.querySelectorAll<HTMLButtonElement>("button.weapon:not(.locked)")) {
        b.addEventListener("click", () => {
          this.settings.primary = b.dataset.w as PrimaryId
          this.handlers.settingsChanged()
          this.audio.play("switch")
          onPick?.(this.settings.primary)
          render()
        })
      }
    }
    render()
  }

  // ---------------------------------------------------------------- settings

  private bindSettings() {
    const s = this.settings
    const bind = (id: string, key: "sensitivity" | "fov" | "master" | "music", fmt: (v: number) => string) => {
      const input = $<HTMLInputElement>(id)
      const label = $(`${id}-v`)
      input.value = String(s[key])
      label.textContent = fmt(s[key])
      input.addEventListener("input", () => {
        s[key] = Number(input.value)
        label.textContent = fmt(s[key])
        this.handlers.settingsChanged()
      })
    }
    bind("s-sens", "sensitivity", (v) => v.toFixed(2))
    bind("s-fov", "fov", (v) => `${v}°`)
    bind("s-master", "master", (v) => `${Math.round(v * 100)}%`)
    bind("s-music", "music", (v) => `${Math.round(v * 100)}%`)
    const q = $<HTMLSelectElement>("s-quality")
    q.value = s.quality
    q.addEventListener("change", () => {
      s.quality = q.value as Settings["quality"]
      this.handlers.settingsChanged()
    })
    const crouch = $<HTMLSelectElement>("s-crouch")
    crouch.value = s.crouch
    crouch.addEventListener("change", () => {
      s.crouch = crouch.value as Settings["crouch"]
      this.handlers.settingsChanged()
    })
    for (const [id, key] of [["s-autores", "autoRes"], ["s-info", "showInfo"], ["s-invert", "invertY"]] as const) {
      const box = $<HTMLInputElement>(id)
      box.checked = s[key]
      box.addEventListener("change", () => {
        s[key] = box.checked
        this.handlers.settingsChanged()
      })
    }
  }
}
