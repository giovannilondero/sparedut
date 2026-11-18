/**
 * The main menu: name, language, matches, armoury, settings, glossary. It draws the menu model
 * and forwards the player's events to it; what a choice means is the model's to decide.
 */
import type { BotLevel, ModeId } from "../shared/folklore.ts"
import type { MapId } from "../shared/map.ts"
import type { Access, Reach, RoomSummary } from "../shared/protocol.ts"
import { PRIMARIES, WEAPON_IDS, WEAPONS, type PrimaryId, type WeaponId } from "../shared/weapons.ts"
// UI SDK's radio group: one tab stop, arrow keys, the radio role. Markup and styling stay the game's.
import "@ui-sdk/web/radio"
// UI SDK's dialog, for the password prompt: focus moved in and back, Tab kept inside, Esc and outside presses close it.
import "@ui-sdk/web/dialog"
// The settings: UI SDK's switch for the on-off ones, its slider for the numbers, its field to name the slider's thumb.
import "@ui-sdk/web/switch"
import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"
import type { GameAudio } from "./contracts.ts"
import { esc } from "./hud.ts"
import { onLangChange, setLang, t, type Lang, type StaticKey } from "./i18n.ts"
import { chooseLook, LOOK_IDS, LOOKS, type LookId } from "./looks.ts"
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

/** The label of each reach and access among creation's choices: every member needs one. */
const REACH_LABEL = { lan: "reachLan", online: "reachOnline", offline: "reachOffline" } as const satisfies Record<Reach, StaticKey>
const ACCESS_LABEL = { open: "accessOpen", password: "accessPassword" } as const satisfies Record<Access, StaticKey>

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

  /** `look`: the look this page was drawn with, shown chosen in the header. */
  constructor(private readonly settings: Settings, private readonly audio: GameAudio, private readonly handlers: MenuHandlers, private readonly look: LookId) {
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
    this.bindLook()
    document.addEventListener("mouseover", (e) => {
      if ((e.target as HTMLElement).closest?.("#menu button")) audio.play("ui_hover", { volume: 0.4 })
    })
    // Esc: from submenus, go back to the main screen. Captured before UI SDK's own listener, which
    // closes the password prompt: while it is open, Esc is the prompt's.
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || $("menu").classList.contains("hidden") || this.model.screen === "password") return
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
    $("look-label").textContent = t().menu.look
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

  /** Syncs the switches with settings changed from outside (F3). */
  syncSettings() {
    $<HTMLElementTagNameMap["ui-switch"]>("s-info").checked = this.settings.showInfo
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
      $("c-msg").textContent = t().menu.passwordBad
      $("c-password").focus()
    } else if (reason === "passwordBad") $<HTMLInputElement>("pw-input").select()
    else if (reason === "codeBad") {
      $("j-msg").textContent = t().menu.codeBad
      $("j-code").setAttribute("aria-invalid", "true")
      $("j-code").focus()
    }
    // A full room, or one gone from the list, sends nothing: the list already shows why.
  }

  /** Shows the model's screen. */
  private render() {
    const screen = this.model.screen
    const shown = SCREEN_ELEMENT[screen]
    for (const s of SCREENS) $(SCREEN_ELEMENT[s]).classList.toggle("hidden", SCREEN_ELEMENT[s] !== shown)
    if (screen === "home") this.renderOneTap()
    // The primary may have changed in a match's armoury since this one was drawn.
    if (screen === "armarie") this.buildArmarie()
    const prompt = $<HTMLElementTagNameMap["ui-dialog"]>("pw-dialog")
    if (screen === "password") this.renderPrompt()
    // Opened from code: UI SDK moves focus to the field and, on closing, back to what had it before.
    prompt.open = screen === "password"
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

  /**
   * The weapons: the primaries first, as one group of cards to choose from (UI SDK's radio group: one
   * tab stop, arrow keys, the radio role), then the ones always carried or picked up, to read only.
   * Drawn into the menu's armoury and, with `onPick`, into a match's.
   */
  buildArmarie(target: HTMLElement = $("armarie"), onPick?: (p: PrimaryId) => void) {
    const max = { damage: 110, rate: 10, range: 400, mag: 30 }
    const s = t()
    const bar = (label: string, v: number) => `<span class="stat">${label}<i style="width:${Math.min(100, v * 100)}%"></i></span>`
    const isPrimary = (id: WeaponId) => (PRIMARIES as readonly string[]).includes(id)
    /** The card's text; its name and blurb name and describe the radio. */
    const card = (id: WeaponId) => {
      const w = WEAPONS[id]
      const text = s.weapons[id]
      const rate = 60 / w.cooldownTicks
      const tag = isPrimary(id) ? s.menu.tag.primary : id === "lanciafrico" ? s.menu.tag.power : id === "mescul" ? s.menu.tag.melee : s.menu.tag.pistol
      return `<span class="tag">${w.slot} · ${tag}</span><b id="${target.id}-${id}">${text.name}</b><span class="blurb" id="${target.id}-${id}-blurb">${text.blurb}</span>
        <span class="stats">${bar(s.menu.stat.damage, (w.damage * w.pellets) / max.damage)}${bar(s.menu.stat.rate, rate / max.rate)}${bar(s.menu.stat.range, (w.range || 120) / max.range)}${bar(s.menu.stat.mag, Math.max(w.magazine, 1) / max.mag)}</span>`
    }
    // The mitraie can't be carried: it stays on the turrets.
    const carried = WEAPON_IDS.filter((id) => id !== "mitraie" && !isPrimary(id))
    target.innerHTML = `<ui-radio-group class="weapon-cards" aria-label="${s.static.armarieTitle.replace(/<[^>]*>/g, "")}">${PRIMARIES.map(
      (id) => `<ui-radio class="weapon" value="${id}" aria-labelledby="${target.id}-${id}" aria-describedby="${target.id}-${id}-blurb">${card(id)}</ui-radio>`
    ).join("")}</ui-radio-group>
      <ul class="weapon-cards carried">${carried.map((id) => `<li class="weapon">${card(id)}</li>`).join("")}</ul>`
    const group = target.querySelector<HTMLElementTagNameMap["ui-radio-group"]>("ui-radio-group")!
    group.value = this.settings.primary
    group.addEventListener("valuechange", (e) => {
      // A primary is always chosen: a change to none is refused.
      if (e.detail.value === null) return e.preventDefault()
      this.settings.primary = e.detail.value as PrimaryId
      this.handlers.settingsChanged()
      this.audio.play("switch")
      onPick?.(this.settings.primary)
    })
  }

  // ---------------------------------------------------------------- settings

  /**
   * The settings form, one for the menu and the match. Numbers on UI SDK sliders (drag, tap on the
   * track, arrow keys, Page Up/Down, Home/End), on and off on UI SDK switches, the choices among
   * named options on the browser's own selects (a phone opens its own picker for them).
   */
  private bindSettings() {
    const s = this.settings
    const slider = (id: string, key: "sensitivity" | "fov" | "master" | "music", format: (v: number) => string) => {
      const el = $<HTMLElementTagNameMap["ui-slider"]>(id)
      el.format = format
      el.value = s[key]
      const set = (v: number) => {
        if (v === s[key]) return
        s[key] = v
        this.handlers.settingsChanged()
      }
      // Applied while dragging (the volume is heard, the field of view seen), saved with every step like the rest.
      el.addEventListener("valuechange", (e) => {
        if (typeof e.detail.value === "number") set(e.detail.value)
      })
      // A finger that lands on the track moves the knob there at once; if the browser then takes the touch to
      // scroll the form (style.css lets it pan vertically), it was not meant for the slider: the value goes back.
      const control = el.querySelector("ui-slider-control")!
      let before = s[key]
      control.addEventListener("pointerdown", () => (before = s[key]), { capture: true })
      control.addEventListener("pointercancel", () => {
        // After UI SDK's own handling of the cancel, which ends the drag on the value it last had.
        setTimeout(() => {
          el.value = before
          set(before)
        })
      })
    }
    slider("s-sens", "sensitivity", (v) => v.toFixed(2))
    slider("s-fov", "fov", (v) => `${v}°`)
    slider("s-master", "master", (v) => `${Math.round(v * 100)}%`)
    slider("s-music", "music", (v) => `${Math.round(v * 100)}%`)
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
      const box = $<HTMLElementTagNameMap["ui-switch"]>(id)
      box.checked = s[key]
      box.addEventListener("checkedchange", (e) => {
        if (e.detail.value === s[key]) return
        s[key] = e.detail.value
        this.handlers.settingsChanged()
      })
    }
  }

  // ---------------------------------------------------------------- look

  /** The look's two buttons in the header. Choosing the other one reloads the page with it. */
  private bindLook() {
    const box = $("look-switch")
    for (const id of LOOK_IDS) {
      const b = document.createElement("button")
      b.textContent = LOOKS[id]
      b.dataset.look = id
      b.setAttribute("aria-pressed", String(id === this.look))
      b.classList.toggle("selected", id === this.look)
      b.addEventListener("click", () => {
        if (id === this.look) return
        this.audio.play("ui_click")
        chooseLook(id)
      })
      box.append(b)
    }
  }
}
