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
// UI SDK's dialog, for the password prompt: focus moved in and back, Tab kept inside, Esc and outside presses close it.
import "@ui-sdk/web/dialog"
// UI SDK's select (a bottom sheet on a small touch screen) and collapsible (creation's "options").
import "@ui-sdk/web/select"
import "@ui-sdk/web/collapsible"
import type { GameAudio } from "./contracts.ts"
import { esc } from "./hud.ts"
import { onLangChange, setLang, t, type Lang } from "./i18n.ts"
import { MenuModel, SCREENS, type CreateOptions, type Outcome, type PasswordRefusal, type PromptProblem, type Refusal, type Screen } from "./menu-model.ts"
import { oneTapRoom, type Settings } from "./settings.ts"

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

type RadioGroup = HTMLElementTagNameMap["ui-radio-group"]
type Select = HTMLElementTagNameMap["ui-select"]

/**
 * Fills a UI SDK radio group with one card per value: one Tab stop, the arrow keys inside, the radio
 * role. `choose` hears the player's choice; the group never lets the choice go back to none.
 */
function cardGroup(group: RadioGroup, values: readonly string[], choose: (value: string) => void) {
  group.innerHTML = values.map((v) => `<ui-radio class="card" value="${v}"><b></b><small></small></ui-radio>`).join("")
  group.addEventListener("valuechange", (e) => {
    if (e.detail.value === null) return e.preventDefault()
    choose(e.detail.value as string)
  })
}

/** Writes each card's name (HTML) and line (text) in the active language. */
function cardTexts(group: RadioGroup, text: (value: string) => readonly [string, string]) {
  for (const card of group.querySelectorAll<HTMLElement>("ui-radio")) {
    const [name, line] = text(card.getAttribute("value")!)
    card.querySelector("b")!.innerHTML = name
    card.querySelector("small")!.textContent = line
  }
}

/** A UI SDK select over numbers: its items rewritten in the active language, keeping the chosen one. */
function selectItems(select: Select, values: readonly number[], label: (n: number) => string, chosen: number) {
  select.querySelector("ui-select-content")!.innerHTML = values.map((n) => `<ui-select-item value="${n}">${label(n)}</ui-select-item>`).join("")
  select.value = String(chosen)
}

/** The element each screen shows: the password prompt opens over the home screen. */
const SCREEN_ELEMENT = {
  home: "menu-home",
  password: "menu-home",
  create: "menu-create",
  armarie: "menu-armarie",
  settings: "menu-settings",
  vocabolari: "menu-vocabolari"
} as const satisfies Record<Screen, string>

/** A room in the list: reach chip, lock, host, mode and map, players out of seats. A button when it can be chosen. */
function roomRow(r: RoomSummary, selectable: boolean, asButton: boolean): string {
  const s = t()
  const lock = r.reach !== "offline" && r.access === "password" ? `<i class="lock" role="img" aria-label="${s.menu.passwordRoom}" title="${s.menu.passwordRoom}">🔒</i>` : ""
  const inner = `<span class="room-tags"><i class="chip ${r.reach}">${s.menu.reach[r.reach]}</i>${lock}</span>
    <span class="room-what"><b>${esc(r.host)}</b><small>${s.modes[r.mode].name} · ${s.maps[r.map].name}</small></span>
    <span class="room-seats"><b>${r.players}/${r.max}</b><small>${selectable ? r.code : s.menu.full}</small></span>`
  if (!asButton) return `<li><div class="room">${inner}</div></li>`
  return `<li><button class="room${selectable ? "" : " full"}" data-code="${r.code}"${selectable ? "" : " disabled"}>${inner}</button></li>`
}

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
        else this.go(go as Screen)
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
    // Esc: from submenus, go back to the main screen. Captured before UI SDK's own listener, which
    // closes the password prompt: while it is open, Esc is the prompt's.
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || $("menu").classList.contains("hidden") || this.model.screen === "password") return
      // An open list of creation's options closes on its own Esc, and the screen stays.
      if ([...document.querySelectorAll<Select>("#menu-create ui-select")].some((select) => select.open)) return
      if (this.model.back()) {
        e.preventDefault()
        audio.play("ui_click")
        this.render()
      } else if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
    }, { capture: true })
    const name = $<HTMLInputElement>("name")
    name.value = settings.name
    name.addEventListener("input", () => {
      this.model.typeName(name.value)
      name.removeAttribute("aria-invalid")
    })
    this.bindCreate()
    this.bindSettings()
    this.bindHome()
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
    this.renderOneTap()
    this.renderPrompt()
    this.buildArmarie()
    $("vocabolari").innerHTML = t().menu.vocab.map(([w, d]) => `<p><b>${w}</b> — ${d}</p>`).join("")
    this.renderRooms(true)
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

  go(screen: Screen) {
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
      input.setAttribute("aria-invalid", "true")
    } else if (reason === "passwordBad" && this.model.screen === "create") {
      // The password is folded under "options": they open to show the field the message is about.
      $("c-msg").textContent = t().menu.passwordBad
      $("c-password").setAttribute("aria-invalid", "true")
      $<HTMLElementTagNameMap["ui-collapsible"]>("c-options").open = true
      requestAnimationFrame(() => $("c-password").focus())
    } else if (reason === "passwordBad") $<HTMLInputElement>("pw-input").select()
    else if (reason === "codeBad") {
      $("j-msg").textContent = t().menu.codeBad
      $("j-code").setAttribute("aria-invalid", "true")
      $("j-code").focus()
    }
    // A full room, or one gone from the list, sends nothing: the list already shows why.
  }

  /** The screen last shown, to know where focus goes when it changes. */
  private shown: Screen = "home"

  /** Shows the model's screen. */
  private render() {
    const screen = this.model.screen
    const from = this.shown
    this.shown = screen
    const shown = SCREEN_ELEMENT[screen]
    for (const s of SCREENS) $(SCREEN_ELEMENT[s]).classList.toggle("hidden", SCREEN_ELEMENT[s] !== shown)
    if (screen === "home") this.renderOneTap()
    const prompt = $<HTMLElementTagNameMap["ui-dialog"]>("pw-dialog")
    if (screen === "password") this.renderPrompt()
    // Opened from code: UI SDK moves focus to the field and, on closing, back to what had it before.
    prompt.open = screen === "password"
    // Creation opens on its first choice, and going back lands on the button that opened it.
    if (from !== screen && screen === "create") $<RadioGroup>("c-mode").api.focus()
    else if (from === "create" && screen === "home") document.querySelector<HTMLElement>('#menu-home [data-go="create"]')?.focus()
  }

  // ---------------------------------------------------------------- home

  /** Listeners only once: the room list is redrawn on every refresh and language change. */
  private bindHome() {
    const code = $<HTMLInputElement>("j-code")
    code.addEventListener("input", () => {
      this.model.typeCode(code.value)
      $("j-msg").textContent = ""
      code.removeAttribute("aria-invalid")
    })
    $("j-form").addEventListener("submit", (e) => {
      e.preventDefault()
      this.apply(this.model.joinByCode())
    })
    $("room-list").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button")
      if (!b || b.disabled) return
      this.audio.play("ui_click")
      if (b.dataset.code) this.apply(this.model.joinFromList(b.dataset.code))
      else this.go("create")
    })
    const password = $<HTMLInputElement>("pw-input")
    password.addEventListener("input", () => this.model.typePassword(password.value))
    $("pw-form").addEventListener("submit", (e) => {
      e.preventDefault()
      this.apply(this.model.joinWithPassword())
      this.renderPrompt()
    })
    // Closed by Esc, the cancel button or a press outside: back to the home screen, the list where it was.
    $<HTMLElementTagNameMap["ui-dialog"]>("pw-dialog").addEventListener("openchange", (e) => {
      if (!e.detail.value && this.model.screen === "password") {
        this.model.back()
        this.render()
      }
    })
  }

  /** The one-tap button says what it will start: the remembered mode, map and duration. */
  private renderOneTap() {
    const room = oneTapRoom(this.settings)
    const s = t()
    $("one-tap-last").textContent = `${s.modes[room.mode].name} · ${s.maps[room.map].name} · ${s.menu.minutes(room.minutes)}`
  }

  /** The prompt's room, its typed password and what the last attempt got wrong. */
  private renderPrompt() {
    const s = t()
    const room = this.model.promptRoom
    $("pw-for").textContent = s.menu.passwordFor(this.model.passwordFor)
    $("pw-room").innerHTML = room ? roomRow(room, true, false) : ""
    const input = $<HTMLInputElement>("pw-input")
    if (input.value !== this.model.typedPassword) input.value = this.model.typedPassword
    const problem: PromptProblem | null = this.model.promptProblem
    $("pw-msg").textContent = problem === null ? "" : problem === "passwordBad" ? s.menu.passwordBad : s.errors[problem]
    input.toggleAttribute("aria-invalid", problem !== null)
  }

  /** The host asked for a room's password, or refused the one sent: the prompt opens again, saying why. */
  hostRefused(code: string, why: PasswordRefusal) {
    $("menu").classList.remove("hidden")
    this.apply(this.model.hostRefused(code, why))
    if (why !== "passwordRequired") $<HTMLInputElement>("pw-input").select()
  }

  rooms(list: readonly RoomSummary[]) {
    this.model.rooms(list)
    this.renderRooms()
  }

  /** What the list last drew: a refresh with the same rooms leaves the DOM, and the focus in it, alone. */
  private drawnRooms = ""

  private renderRooms(force = false) {
    const list = this.model.roomList
    const drawn = JSON.stringify(list)
    if (!force && drawn === this.drawnRooms) return
    this.drawnRooms = drawn
    const box = $("room-list")
    // Focus inside the list stays inside it: on the same room if it can still be chosen, else on the first that can.
    const had = box.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null
    const s = t()
    box.innerHTML = list.length
      ? `<ul class="rooms">${list.map(({ room, selectable }) => roomRow(room, selectable, true)).join("")}</ul>`
      : `<div class="rooms-empty"><p>${s.menu.roomsEmpty}</p><button class="primary">${s.static.create}</button></div>`
    if (!had) return
    const same = had.dataset.code ? box.querySelector<HTMLButtonElement>(`button[data-code="${had.dataset.code}"]:not(:disabled)`) : null
    ;(same ?? box.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus()
  }

  // ---------------------------------------------------------------- create match

  /** Listeners only once: the cards are built here and only their texts change with the language. */
  private bindCreate() {
    const { options, choices } = this.model
    const chosen = () => {
      this.audio.play("ui_click")
      this.renderChoices()
    }
    cardGroup($("c-mode"), options.modes, (v) => {
      this.model.chooseMode(v as ModeId)
      chosen()
    })
    cardGroup($("c-map"), options.maps, (v) => {
      this.model.chooseMap(v as MapId)
      this.handlers.mapChanged(v as MapId)
      chosen()
    })
    cardGroup($("c-level"), options.levels, (v) => {
      this.model.chooseLevel(v as BotLevel)
      chosen()
    })
    // An Offline room lives in this browser: what only the server offers (access, password) hides.
    cardGroup($("c-reach"), options.reaches, (v) => {
      this.model.chooseReach(v as Reach)
      chosen()
    })
    cardGroup($("c-access"), options.accesses, (v) => {
      this.model.chooseAccess(v as Access)
      chosen()
    })
    const number = (id: string, choose: (n: number) => void) =>
      $<Select>(id).addEventListener("valuechange", (e) => {
        if (e.detail.value === null) return e.preventDefault()
        choose(Number(e.detail.value))
        this.renderChoices()
      })
    number("c-minutes", (n) => this.model.chooseMinutes(n))
    number("c-bots", (n) => this.model.chooseBots(n))
    const ff = $<HTMLInputElement>("c-ff")
    ff.addEventListener("change", () => {
      this.model.chooseFriendlyFire(ff.checked)
      this.renderChoices()
    })
    // Opened, the options come into view: on a phone they open below the cards, under the create button.
    $<HTMLElementTagNameMap["ui-collapsible"]>("c-options").addEventListener("openchange", (e) => {
      if (!e.detail.value) return
      const smooth = matchMedia("(prefers-reduced-motion: no-preference)").matches
      requestAnimationFrame(() => $("c-options").scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" }))
    })
    const password = $<HTMLInputElement>("c-password")
    password.addEventListener("input", () => {
      this.model.typeRoomPassword(password.value)
      $("c-msg").textContent = ""
      password.removeAttribute("aria-invalid")
    })
    $("c-go").addEventListener("click", () => {
      const o = this.model.create()
      if (o.kind === "send") $("c-msg").textContent = ""
      this.apply(o)
    })
    for (const [id, value] of [["c-mode", choices.mode], ["c-map", choices.map], ["c-level", choices.level], ["c-reach", choices.reach], ["c-access", choices.access]] as const) {
      $<RadioGroup>(id).value = value
    }
    ff.checked = choices.ff
  }

  /** Creation's texts in the active language: the cards, the lists, then what depends on the choices. */
  private renderCreate() {
    const s = t()
    const { options, choices } = this.model
    cardTexts($("c-mode"), (v) => [s.modes[v as ModeId].name, s.modes[v as ModeId].sub])
    cardTexts($("c-map"), (v) => [s.maps[v as MapId].name, s.maps[v as MapId].sub])
    cardTexts($("c-level"), (v) => [s.levels[v as BotLevel].name, s.levels[v as BotLevel].sub])
    cardTexts($("c-reach"), (v) => [`<i class="chip ${v}">${s.menu.reach[v as Reach]}</i>`, s.menu.reachSub[v as Reach]])
    cardTexts($("c-access"), (v) => [v === "password" ? `🔒 ${s.static.accessPassword}` : s.static.accessOpen, ""])
    selectItems($("c-minutes"), options.minutes, s.menu.minutes, choices.minutes)
    selectItems($("c-bots"), options.bots, (n) => (n === 0 ? s.menu.botsNone : String(n)), choices.bots)
    this.renderChoices()
  }

  /** What follows from the choices: the chosen mode's rules, the options' one-line summary, the fields that apply. */
  private renderChoices() {
    const s = t()
    const { choices, fields } = this.model
    $("c-rules").textContent = s.modes[choices.mode].rules
    const access = choices.access === "password" ? `🔒 ${s.static.accessPassword}` : s.static.accessOpen
    $("c-summary").textContent = [
      s.menu.minutes(choices.minutes),
      s.menu.bots(choices.bots),
      s.levels[choices.level].name,
      s.menu.reach[choices.reach],
      ...(fields.access ? [access] : []),
      ...(choices.ff ? [s.menu.ffOn] : [])
    ].join(" · ")
    $("c-access-field").hidden = !fields.access
    $("c-password-field").hidden = !fields.password
    if (!fields.password) $("c-msg").textContent = ""
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
