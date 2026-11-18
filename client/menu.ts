/**
 * The main menu: name, language, rooms, armoury, settings, glossary. It draws the menu model
 * and forwards the player's events to it; what a choice means is the model's to decide.
 */
import type { TrainingStart } from "../shared/training/start.ts"
import type { MapId } from "../shared/map.ts"
import type { Access, RoomSummary } from "../shared/protocol.ts"
import { PRIMARIES, WEAPON_IDS, WEAPONS, type PrimaryId, type WeaponId } from "../shared/weapons.ts"
// UI SDK's radio group: one tab stop, arrow keys, the radio role. Markup and styling stay the game's.
import "@ui-sdk/web/radio"
// UI SDK's dialog, for the password prompt: focus moved in and back, Tab kept inside, Esc and outside presses close it.
import "@ui-sdk/web/dialog"
// UI SDK's select (a bottom sheet on a small touch screen) and collapsible (creation's "options").
import "@ui-sdk/web/select"
import "@ui-sdk/web/collapsible"
// The settings: UI SDK's switch for the on-off ones, its slider for the numbers, its field to name the slider's thumb.
import "@ui-sdk/web/switch"
import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"
import { alwaysChosen } from "./choice.ts"
import type { GameAudio } from "./contracts.ts"
import { esc } from "./hud.ts"
import { onLangChange, setLang, t, type Lang } from "./i18n.ts"
import { chooseLook, LOOK_IDS, LOOKS, type LookId } from "./looks.ts"
import { classFigures, focusOnScreen, MenuModel, SCREENS, type CreateOptions, type Outcome, type PasswordRefusal, type PromptProblem, type Refusal, type Screen } from "./menu-model.ts"
import type { PrimaryPicker } from "./match-menus.ts"
import { oneTapRoom, type Settings } from "./settings.ts"

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

export interface MenuHandlers {
  readonly create: (o: CreateOptions) => void
  /** `password` only once the player typed one (from the prompt or an invite link). */
  readonly join: (code: string, password?: string) => void
  /** The training: always Offline, nothing to choose; `start` from the saved progress. */
  readonly training: (start: TrainingStart) => void
  /** The map chosen in the menu: it becomes the background. */
  readonly mapChanged: (id: MapId) => void
  readonly settingsChanged: () => void
  /** Opens the browser's install prompt, kept from `beforeinstallprompt`. */
  readonly install: () => void
  /** The waiting new version takes over; the page reloads into it. */
  readonly update: () => void
}

type RadioGroup = HTMLElementTagNameMap["ui-radio-group"]
type Select = HTMLElementTagNameMap["ui-select"]

/** Each screen's first control, where focus lands when it opens; the vocabulary has none but its heading. */
const FIRST_CONTROL: { readonly [S in Exclude<Screen, "home" | "password">]: () => void } = {
  create: () => $<RadioGroup>("c-mode").api.focus(),
  // Drawn again as it opens: its group takes focus once UI SDK has set it up.
  armarie: () => requestAnimationFrame(() => $("armarie").querySelector<RadioGroup>("ui-radio-group")?.api.focus()),
  settings: () => $<HTMLElementTagNameMap["ui-slider"]>("s-sens").api.focus(),
  vocabolari: () => $("vocab-title").focus()
}

/**
 * Fills a UI SDK radio group with one card per value: one Tab stop, the arrow keys inside, the radio
 * role. `choose` hears the player's choice; the group never lets the choice go back to none.
 */
function cardGroup<V extends string>(group: RadioGroup, values: readonly V[], choose: (value: V) => void) {
  group.innerHTML = values.map((v) => `<ui-radio class="card" value="${v}"><b></b><small></small></ui-radio>`).join("")
  // The group offers only these values: whatever it reports is one of them.
  group.addEventListener("valuechange", alwaysChosen((v) => choose(v as V)))
}

/** Writes each card's name (HTML) and line (text) in the active language; `values` as `cardGroup` was given them. */
function cardTexts<V extends string>(group: RadioGroup, values: readonly V[], text: (value: V) => readonly [string, string]) {
  group.querySelectorAll<HTMLElement>("ui-radio").forEach((card, i) => {
    const [name, line] = text(values[i])
    card.querySelector("b")!.innerHTML = name
    card.querySelector("small")!.textContent = line
  })
}

/** A UI SDK select over numbers: its items rewritten in the active language, keeping the chosen one. */
function selectItems(select: Select, values: readonly number[], label: (n: number) => string, chosen: number) {
  select.querySelector("ui-select-content")!.innerHTML = values.map((n) => `<ui-select-item value="${n}">${label(n)}</ui-select-item>`).join("")
  select.value = String(chosen)
}

/** Single weapon off, as creation's select names its value. */
const SINGLE_OFF = "off"

/** An access as creation names it: on its card and in the options' summary. */
const accessLabel = (access: Access): string => (access === "password" ? `🔒 ${t().static.accessPassword}` : t().static.accessOpen)

/** The element each screen shows: the password prompt opens over the home screen. */
const SCREEN_ELEMENT = {
  home: "menu-home",
  password: "menu-home",
  create: "menu-create",
  armarie: "menu-armarie",
  settings: "menu-settings",
  vocabolari: "menu-vocabolari"
} as const satisfies Record<Screen, string>

/** A room in the list: reach chip, lock, host, mode, map and phase (Muster or match), players out of seats. A button when it can be chosen. */
function roomRow(r: RoomSummary, selectable: boolean, asButton: boolean): string {
  const s = t()
  const lock = r.reach !== "offline" && r.access === "password" ? `<i class="lock" role="img" aria-label="${s.menu.passwordRoom}" title="${s.menu.passwordRoom}">🔒</i>` : ""
  const inner = `<span class="room-tags"><i class="chip ${r.reach}">${s.menu.reach[r.reach]}</i>${lock}</span>
    <span class="room-what"><b>${esc(r.host)}</b><small>${s.modes[r.mode].name} · ${s.maps[r.map].name}${r.single ? ` · ${s.menu.single(s.weapons[r.single].name)}` : ""} · ${s.menu.phase[r.phase]}</small></span>
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
        else if (go === "training") this.apply(this.model.training())
        else this.go(go as Screen)
      })
    }
    for (const el of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
      el.addEventListener("click", () => {
        audio.play("ui_click")
        this.model.chooseLanguage(el.dataset.lang as Lang)
        setLang(settings.lang)
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
    this.bindTraining()
    this.bindApp()
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
    this.renderTraining()
    this.renderPrompt()
    this.buildArmarie()
    $("vocabolari").innerHTML = t().menu.vocab.map(([w, d]) => `<p><b>${w}</b> — ${d}</p>`).join("")
    this.renderRooms(true)
    this.renderApp()
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

  /**
   * Shows or hides the menu, back on the home screen either way. Hidden for a match, it closes the
   * password prompt too: a modal dialog left open would keep the match inert under it.
   */
  show(on: boolean) {
    this.go("home")
    $("menu").classList.toggle("hidden", !on)
    this.model.menuShown(on)
    this.renderApp()
  }

  status(text: string) {
    $("status").textContent = text
  }

  go(screen: Screen) {
    this.apply(this.model.go(screen))
  }

  /** The home screen's one-tap match, asked for from outside it: the training's completion screen. */
  oneTap() {
    this.apply(this.model.oneTap())
  }

  /** Acts on the model's answer: sends the request, shows why it was refused, or draws the new screen. */
  private apply(o: Outcome) {
    if (o.kind === "send") {
      const r = o.request
      if (r.t === "create") this.handlers.create(r.room)
      else if (r.t === "training") this.handlers.training(r.start)
      else if (r.t === "join") this.handlers.join(r.code, r.password)
      // The installable game's requests: the install prompt, the new version.
      else if (r.t === "install" || r.t === "update") this.appRequest(r.t)
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
    if (screen === "home") {
      this.renderOneTap()
      this.renderTraining()
    }
    // The primary may have changed in a match's armoury since this one was drawn.
    if (screen === "armarie") this.buildArmarie()
    const prompt = $<HTMLElementTagNameMap["ui-dialog"]>("pw-dialog")
    if (screen === "password") this.renderPrompt()
    // Opened from code: UI SDK moves focus to the field and, on closing, back to what had it before.
    prompt.open = screen === "password"
    // A screen opens on its first control, and going back lands on the tile that opened it.
    const focus = focusOnScreen(from, screen)
    if (focus === "first" && screen !== "home" && screen !== "password") FIRST_CONTROL[screen]()
    else if (focus !== null && focus !== "first") document.querySelector<HTMLElement>(`#menu-home [data-go="${focus}"]`)?.focus()
  }

  // ---------------------------------------------------------------- the training's entry

  private bindTraining() {
    $("invite-close").addEventListener("click", () => {
      this.audio.play("ui_click")
      this.model.dismissInvitation()
      this.renderTraining()
      // The button that had focus is gone: focus stays on the training.
      $("home-training").querySelector<HTMLElement>(".training-entry")?.focus()
    })
  }

  /** The entry's completed mark, and the invitation: the entry edged in gold, with a ribbon and a close button. */
  private renderTraining() {
    const s = t().training.entry
    const { invitation, completed } = this.model.trainingEntry
    const inviting = invitation === "shown"
    $("home-training").toggleAttribute("data-inviting", inviting)
    const done = $("training-completed")
    done.hidden = !completed
    done.textContent = s.completed
    const ribbon = $("invite-ribbon")
    ribbon.hidden = !inviting
    ribbon.textContent = s.ribbon
    const close = $<HTMLButtonElement>("invite-close")
    close.hidden = ribbon.hidden
    close.setAttribute("aria-label", s.close)
    close.title = s.close
  }

  // ---------------------------------------------------------------- installing and updating the game

  private bindApp() {
    for (const [id, tap] of [["install", () => this.model.install()], ["update-notice", () => this.model.loadNewVersion()]] as const)
      $(id).addEventListener("click", () => {
        this.audio.play("ui_click")
        this.apply(tap())
      })
  }

  private appRequest(t: "install" | "update") {
    this.handlers[t]()
    this.renderApp()
  }

  /** What the page found at boot: it runs installed, or the game is added to the home screen by hand. */
  installSurroundings(env: { readonly installed: boolean; readonly byHand: boolean }) {
    this.model.installSurroundings(env)
    this.renderApp()
  }

  /** The browser offers its install prompt. */
  installOffered() {
    this.model.installOffered()
    this.renderApp()
  }

  /** The game was installed from this page. */
  installed() {
    this.model.installed()
    this.renderApp()
  }

  /** A new version is downloaded and waiting: the menu says so, now or on return from the match. */
  newVersionWaiting() {
    this.model.newVersionWaiting()
    this.renderApp()
  }

  /** The install entry and the update notice, as the model has them. */
  private renderApp() {
    const s = t().app
    const entry = this.model.installEntry
    const install = $<HTMLButtonElement>("install")
    install.hidden = entry !== "button"
    install.textContent = s.install
    const byHand = $("install-by-hand")
    byHand.hidden = entry !== "instructions"
    byHand.textContent = s.byHand
    const notice = this.model.updateNotice
    const update = $<HTMLButtonElement>("update-notice")
    update.hidden = notice === "hidden"
    update.disabled = notice === "loading"
    update.textContent = notice === "loading" ? s.updating : s.update
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

  // ---------------------------------------------------------------- create a room

  /** Listeners only once: the cards are built here and only their texts change with the language. */
  private bindCreate() {
    const { options, choices } = this.model
    const chosen = () => {
      this.audio.play("ui_click")
      this.renderChoices()
    }
    cardGroup($("c-mode"), options.modes, (v) => {
      this.model.chooseMode(v)
      chosen()
    })
    cardGroup($("c-map"), options.maps, (v) => {
      this.model.chooseMap(v)
      this.handlers.mapChanged(v)
      chosen()
    })
    cardGroup($("c-level"), options.levels, (v) => {
      this.model.chooseLevel(v)
      chosen()
    })
    // An Offline room lives in this browser: what only the server offers (access, password) hides.
    cardGroup($("c-reach"), options.reaches, (v) => {
      this.model.chooseReach(v)
      chosen()
    })
    cardGroup($("c-access"), options.accesses, (v) => {
      this.model.chooseAccess(v)
      chosen()
    })
    const number = (id: string, choose: (n: number) => void) =>
      $<Select>(id).addEventListener("valuechange", alwaysChosen((value) => {
        choose(Number(value))
        this.renderChoices()
      }))
    number("c-minutes", (n) => this.model.chooseMinutes(n))
    number("c-bots", (n) => this.model.chooseBots(n))
    $<Select>("c-single").addEventListener("valuechange", alwaysChosen((value) => {
      this.model.chooseSingle(value === SINGLE_OFF ? null : (value as PrimaryId))
      this.renderChoices()
    }))
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
    cardTexts($("c-mode"), options.modes, (v) => [s.modes[v].name, s.modes[v].sub])
    cardTexts($("c-map"), options.maps, (v) => [s.maps[v].name, s.maps[v].sub])
    cardTexts($("c-level"), options.levels, (v) => [s.levels[v].name, s.levels[v].sub])
    cardTexts($("c-reach"), options.reaches, (v) => [`<i class="chip ${v}">${s.menu.reach[v]}</i>`, s.menu.reachSub[v]])
    cardTexts($("c-access"), options.accesses, (v) => [accessLabel(v), ""])
    selectItems($("c-minutes"), options.minutes, s.menu.minutes, choices.minutes)
    selectItems($("c-bots"), options.bots, (n) => (n === 0 ? s.menu.botsNone : String(n)), choices.bots)
    const single = $<Select>("c-single")
    single.querySelector("ui-select-content")!.innerHTML = options.singles
      .map((p) => `<ui-select-item value="${p ?? SINGLE_OFF}">${p ? s.weapons[p].name : s.menu.singleOff}</ui-select-item>`)
      .join("")
    single.value = choices.single ?? SINGLE_OFF
    this.renderChoices()
  }

  /** What follows from the choices: the chosen mode's rules, the options' one-line summary, the fields that apply. */
  private renderChoices() {
    const s = t()
    const { choices, fields } = this.model
    $("c-rules").textContent = s.modes[choices.mode].rules
    $("c-summary").textContent = [
      s.menu.minutes(choices.minutes),
      s.menu.bots(choices.bots),
      s.levels[choices.level].name,
      s.menu.reach[choices.reach],
      ...(fields.access ? [accessLabel(choices.access)] : []),
      ...(choices.ff ? [s.menu.ffOn] : []),
      ...(choices.single ? [s.menu.single(s.weapons[choices.single].name)] : [])
    ].join(" · ")
    $("c-access-field").hidden = !fields.access
    $("c-password-field").hidden = !fields.password
    if (!fields.password) $("c-msg").textContent = ""
  }

  // ---------------------------------------------------------------- armoury

  /**
   * The weapons: the primaries first, as one group of cards to choose from (UI SDK's radio group: one
   * tab stop, arrow keys, the radio role), then the ones always carried or picked up, to read only.
   * Drawn into the menu's armoury and, with `onPick`, into a match's. A `locked` picker (single
   * weapon) shows the host's choice and takes no pick: the player's own primary stays remembered.
   */
  buildArmarie(target: HTMLElement = $("armarie"), onPick?: (p: PrimaryId) => void, picker: PrimaryPicker = { _tag: "free", chosen: this.settings.primary }) {
    const max = { damage: 110, rate: 10, range: 400, mag: 30 }
    const s = t()
    const bar = (label: string, v: number) => `<span class="stat">${label}<i style="width:${Math.min(100, v * 100)}%"></i></span>`
    const isPrimary = (id: WeaponId) => (PRIMARIES as readonly string[]).includes(id)
    /** The card's text; its name and blurb name and describe the radio. */
    const card = (id: WeaponId) => {
      const w = WEAPONS[id]
      const text = s.weapons[id]
      const rate = 60 / w.cooldownTicks
      const tag = isPrimary(id) ? s.menu.tag.primary : w.slot === 3 ? s.menu.tag.power : id === "mescul" ? s.menu.tag.melee : s.menu.tag.pistol
      // A primary is a class: its health and speed come first.
      const figures = isPrimary(id) ? classFigures(s, id as PrimaryId).map(([label, value]) => `<span class="stat figure">${label}<b>${value}</b></span>`).join("") : ""
      return `<span class="tag">${w.slot} · ${tag}</span><b id="${target.id}-${id}">${text.name}</b><span class="blurb" id="${target.id}-${id}-blurb">${text.blurb}</span>
        <span class="stats">${figures}${bar(s.menu.stat.damage, (w.damage * w.pellets) / max.damage)}${bar(s.menu.stat.rate, rate / max.rate)}${bar(s.menu.stat.range, (w.range || 120) / max.range)}${bar(s.menu.stat.mag, Math.max(w.magazine, 1) / max.mag)}</span>`
    }
    // The mitraie can't be carried: it stays on the turrets.
    const carried = WEAPON_IDS.filter((id) => id !== "mitraie" && !isPrimary(id))
    target.innerHTML = `<ui-radio-group class="weapon-cards" aria-label="${s.static.armarieTitle.replace(/<[^>]*>/g, "")}">${PRIMARIES.map(
      (id) => `<ui-radio class="weapon" value="${id}" aria-labelledby="${target.id}-${id}" aria-describedby="${target.id}-${id}-blurb">${card(id)}</ui-radio>`
    ).join("")}</ui-radio-group>
      <ul class="weapon-cards carried">${carried.map((id) => `<li class="weapon">${card(id)}</li>`).join("")}</ul>`
    const group = target.querySelector<HTMLElementTagNameMap["ui-radio-group"]>("ui-radio-group")!
    group.value = picker.chosen
    if (picker._tag === "locked") {
      for (const radio of group.querySelectorAll("ui-radio")) radio.toggleAttribute("disabled", true)
      return
    }
    // A primary is always chosen: a change to none is refused.
    group.addEventListener("valuechange", alwaysChosen((primary) => {
      this.model.choosePrimary(primary as PrimaryId)
      this.audio.play("switch")
      onPick?.(this.settings.primary)
    }))
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
      const set = (v: number) => this.model.changeSetting(key, v)
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
    q.addEventListener("change", () => this.model.changeSetting("quality", q.value as Settings["quality"]))
    const crouch = $<HTMLSelectElement>("s-crouch")
    crouch.value = s.crouch
    crouch.addEventListener("change", () => this.model.changeSetting("crouch", crouch.value as Settings["crouch"]))
    for (const [id, key] of [["s-autores", "autoRes"], ["s-info", "showInfo"], ["s-invert", "invertY"]] as const) {
      const box = $<HTMLElementTagNameMap["ui-switch"]>(id)
      box.checked = s[key]
      box.addEventListener("checkedchange", (e) => this.model.changeSetting(key, e.detail.value))
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
      b.addEventListener("click", () => {
        if (id === this.look) return
        this.audio.play("ui_click")
        chooseLook(id)
      })
      box.append(b)
    }
  }
}
