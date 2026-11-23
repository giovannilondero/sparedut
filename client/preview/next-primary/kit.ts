/**
 * Throwaway kit for the next-primary prototypes (issue #93): a player asks for another primary
 * during a match and gets it at their next respawn. A fake match, the texts only the prototypes
 * need, and the game's own HUD and match menu, fed with fixed data. Nothing here is wired to the
 * game and nothing in the game imports it; delete the whole folder once a design is chosen.
 *
 * The HUD is the game's: its markup is read from the game's own page (`/index.html`), drawn by the
 * game's `Hud` class, laid out by `touchLayout` on touch. The match menu is the game's dialog with
 * the game's classes; each variant draws its primary section and adds what it needs.
 *
 * The state lives in the URL hash, so every screen has an address the screenshots can open:
 *   a.html#screen=pending&lang=it    b.html#screen=death&device=touch    c.html#screen=menu&single=1
 */
import { TEAM_INFO } from "../../../shared/folklore.ts"
import type { Team } from "../../../shared/map.ts"
import type { SnapSelf, Snapshot } from "../../../shared/protocol.ts"
import type { ArsenalValue } from "../../../shared/sim/schema.ts"
import { CLASSES, PRIMARIES, WEAPON_IDS, type PrimaryId } from "../../../shared/weapons.ts"
import type { Device } from "../../device.ts"
import { esc, Hud } from "../../hud.ts"
import { applyStatic, setLang, t, type Lang } from "../../i18n.ts"
import { classFigures } from "../../menu-model.ts"
import { touchLayout } from "../../touch.ts"

/**
 * - `menu`: the match menu, nothing asked for.
 * - `pending`: the match menu just after asking for another primary.
 * - `hud`: the match, alive, a change waiting.
 * - `death`: dead, waiting to respawn, a change waiting.
 * - `armoury`: a variant's own picker screen, when it has one apart from the menu (C).
 */
export type Screen = "menu" | "pending" | "hud" | "death" | "armoury"
export const SCREENS: readonly Screen[] = ["menu", "pending", "hud", "death", "armoury"]

export interface State {
  readonly lang: Lang
  readonly screen: Screen
  /** The primary asked for, shown where a change is waiting. */
  readonly next: PrimaryId
  /** A single-weapon room: nothing to choose. */
  readonly single: boolean
  /** `auto` follows the screen's pointer, like the game's first guess. */
  readonly device: "auto" | Device
  /** Taken for a screenshot: the prototype's bar hidden. */
  readonly shot: boolean
}

const DEFAULTS: State = { lang: "fur", screen: "menu", next: "mulin", single: false, device: "auto", shot: false }

const oneOf = <T extends string>(ids: readonly T[], v: string | null, fallback: T): T => ids.find((id) => id === v) ?? fallback

function read(): State {
  const q = new URLSearchParams(location.hash.slice(1))
  return {
    lang: oneOf(["fur", "it"], q.get("lang"), DEFAULTS.lang),
    screen: oneOf(SCREENS, q.get("screen"), DEFAULTS.screen),
    next: oneOf(PRIMARIES, q.get("next"), DEFAULTS.next),
    single: q.get("single") === "1",
    device: oneOf(["auto", "keyboard", "touch", "pad"], q.get("device"), DEFAULTS.device),
    shot: q.get("shot") === "1"
  }
}

function write(s: State) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(s)) {
    const d = DEFAULTS[k as keyof State]
    if (v !== d) q.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v))
  }
  location.hash = q.toString()
}

export let state = read()

/** Buttons with `data-set="k=v&…"` move to another state. */
export function go(patch: string) {
  const next: Record<string, unknown> = Object.fromEntries(new URLSearchParams(patch))
  for (const k of ["single", "shot"]) if (typeof next[k] === "string") next[k] = next[k] === "1"
  write({ ...state, ...next } as State)
}

// ------------------------------------------------------------------------------- the match

/** The player: Meni, a Benandant, with the Dopiete; the change asked for is `state.next`. */
export const ME = "me"
export const PRIMARY: PrimaryId = "doplete"
/** The single weapon of a single-weapon room. */
export const SINGLE: PrimaryId = "cjampanili"

/** The primary in hand: the room's under single weapon. */
export const current = (s: State): PrimaryId => (s.single ? SINGLE : PRIMARY)

/** The change waiting, if any: none in the menu before asking, none under single weapon, none when it is the current one. */
export function pending(s: State): PrimaryId | null {
  if (s.single || s.screen === "menu") return null
  return s.next === current(s) ? null : s.next
}

/**
 * What a press on a primary does: asking for another, or the current one, which cancels. In the
 * match menu the screen follows (no change, a change waiting); elsewhere it stays.
 */
export function choose(p: PrimaryId, s: State) {
  const inMenu = s.screen === "menu" || s.screen === "pending"
  if (p === current(s)) return inMenu ? "screen=menu" : `next=${p}`
  return `${inMenu ? "screen=pending&" : ""}next=${p}`
}

const NAMES = new Map<string, string>([
  [ME, "Meni"],
  ["toni", "Toni"],
  ["mariute", "Mariute"],
  ["b1", "Pieri Gubane"],
  ["sdrume", "Sdrume"],
  ["nadia", "Nadia"],
  ["bepi", "Bepi di Vençon"],
  ["b2", "Strie Sorc"]
])
const TEAMS = new Map<string, Team>([
  [ME, "benandanti"],
  ["toni", "benandanti"],
  ["mariute", "benandanti"],
  ["b1", "benandanti"],
  ["sdrume", "malandanti"],
  ["nadia", "malandanti"],
  ["bepi", "malandanti"],
  ["b2", "malandanti"]
])
const BOTS = new Set(["b1", "b2"])
const HOST = "toni"
const KILLER = "sdrume"

/** The room's code and where it is seen. */
const ROOM = { code: "GLMN", mode: "bataie", reach: "lan", access: "open" } as const

// ------------------------------------------------------------------------------- texts

/** Texts only the prototypes use. Generated Friulian: the owner's to correct. */
const PT = {
  fur: {
    inHand: "In man",
    nextLife: "Prossime vite",
    nextLifeOf: (name: string) => `Prossime vite: ${name}`,
    chooseOther: "Sielç une altre: e rive cuant che tu tornis in pîts.",
    keepUntil: "Fin che no tu tornis in pîts tu tegnis chê che tu âs in man.",
    cancel: "No cambiâ",
    comeBackWith: "Tu tornis cun",
    now: "Cumò",
    withWhat: "Cun ce tornistu?",
    keys: (n: number) => `Frache 1–${n} par sielzi`,
    tap: "Tocje par sielzi",
    armouryNote: "La gnove arme principâl e rive cuant che tu tornis in pîts: fin alore tu tegnis chê che tu âs.",
    armouryOpen: "Armarie",
    arrived: "Gnove arme principâl",
    menuNote: "Tu le cambiis te Armarie, ancje di muart: e rive ae prossime vite."
  },
  it: {
    inHand: "In mano",
    nextLife: "Prossima vita",
    nextLifeOf: (name: string) => `Prossima vita: ${name}`,
    chooseOther: "Scegline un'altra: arriva quando torni in piedi.",
    keepUntil: "Finché non torni in piedi tieni quella che hai in mano.",
    cancel: "Non cambiare",
    comeBackWith: "Torni con",
    now: "Ora",
    withWhat: "Con cosa torni?",
    keys: (n: number) => `Premi 1–${n} per scegliere`,
    tap: "Tocca per scegliere",
    armouryNote: "La nuova arma principale arriva quando torni in piedi: fino ad allora tieni quella che hai.",
    armouryOpen: "Armeria",
    arrived: "Nuova arma principale",
    menuNote: "La cambi nell'Armeria, anche da morto: arriva alla prossima vita."
  }
} as const

export const pt = () => PT[state.lang]

export const primName = (p: PrimaryId) => t().weapons[p].name
export const primShort = (p: PrimaryId) => t().weapons[p].short

// ------------------------------------------------------------------------------- pieces

/** Health and speed as the armoury and the match menu write them: label and number. */
export const figuresHtml = (p: PrimaryId) =>
  classFigures(t(), p)
    .map(([label, value]) => `<span class="stat figure">${label}<b>${value}</b></span>`)
    .join("")

/** Health and speed as the Muster's tiles draw them: a bar each, from half the lowest figure to the highest. */
const scale = (all: readonly number[]) => {
  const low = Math.min(...all) / 2
  const high = Math.max(...all)
  return (v: number) => (v - low) / (high - low)
}
const healthBar = scale(PRIMARIES.map((p) => CLASSES[p].hp))
const speedBar = scale(PRIMARIES.map((p) => CLASSES[p].speed))

export function classBars(p: PrimaryId) {
  const [[hl, hv], [sl, sv]] = classFigures(t(), p)
  const bar = (label: string, value: string, v: number) => `<span class="mu-stat">${label}<i style="--v:${v.toFixed(3)}"></i><b>${value}</b></span>`
  return `<span class="mu-stats">${bar(hl, hv, healthBar(CLASSES[p].hp))}${bar(sl, sv, speedBar(CLASSES[p].speed))}</span>`
}

/** The two figures in short, for a chip: ♥ health · speed. */
export const figuresShort = (p: PrimaryId) => `♥ ${CLASSES[p].hp} · ${Math.round(CLASSES[p].speed * 100)}%`

/** The single-weapon note above a locked picker: the Muster's own text. */
export const lockedNote = () => `<p class="mu-lock">${esc(t().muster.locked(primName(SINGLE)))}</p>`

/** The two teams as the match menu lists them. */
function rosterHtml() {
  return (["benandanti", "malandanti"] as const)
    .map(
      (team) =>
        `<ul><li style="color:${TEAM_INFO[team].color};font-family:var(--serif)"><b>${t().teams[team].name}</b></li>${[...TEAMS]
          .filter(([, tm]) => tm === team)
          .map(([id]) => `<li${id === ME ? ' style="color:var(--gold)"' : ""}>${esc(NAMES.get(id)!)}${BOTS.has(id) ? " 🤖" : ""}${id === HOST ? " 👑" : ""}</li>`)
          .join("")}</ul>`
    )
    .join("")
}

/** What a variant puts in the match menu, and how it marks the match. */
export interface Variant {
  /** The match menu's primary section (in place of today's read-only one). */
  readonly menuPrimary: (s: State, device: Device) => string
  /** Buttons the variant adds among the menu's actions, after the team switch. */
  readonly menuActions?: (s: State, device: Device) => string
  /** Its own picker screen (`armoury`), as the content of a match dialog: title and body. */
  readonly armoury?: (s: State, device: Device) => { readonly title: string; readonly main: string }
  /** Marks the HUD once it is drawn: alive (`hud`) or dead (`death`), a change waiting or not. */
  readonly decorate: (s: State, device: Device, hud: HTMLElement) => void
}

/**
 * The match menu as the game draws it for a guest (`Game.buildPause`), the variant's section in
 * place of the primary and moved first: in a match it is what the player can change, the room's
 * code under it (on a phone on its side the code would push the choice out of view).
 */
function matchMenu(s: State, v: Variant, device: Device) {
  const st = t()
  const p = st.pause
  const other = st.teams.malandanti.name
  return {
    title: `${st.modes[ROOM.mode].name} <small class="muted">· ${st.modes[ROOM.mode].sub}</small>`,
    main: `<div class="overlay-body">
      <div class="pause-primary np-primary" id="p-primary">${v.menuPrimary(s, device)}</div>
      <div class="pause-code">
        <div><div class="muted">${p.code}</div><div class="invite">${ROOM.code}</div></div>
        <div class="pause-share"><button>${p.copy}</button><div class="muted pause-reach">${p.reach[ROOM.reach]} · ${p.access[ROOM.access]}</div></div>
      </div>
      <div class="roster" id="p-roster">${rosterHtml()}</div>
      <div class="muted host-only">${p.hostOnly}</div>
    </div>
    <div class="row overlay-actions">
      <button id="p-resume" class="primary" data-set="screen=hud">${st.loadout.resume}</button>
      <button id="p-team">${p.switchTeam(other)}</button>
      ${v.menuActions?.(s, device) ?? ""}
      <button id="p-settings">${st.static.settings}</button>
      <button id="p-leave">${p.leave}</button>
    </div>`
  }
}

// ------------------------------------------------------------------------------- the HUD

/** The game's HUD markup and the element that reads the safe-area insets, read once from the game's page. */
let hudTemplate: { readonly hud: HTMLElement; readonly safe: HTMLElement } | null = null

async function loadHud() {
  if (hudTemplate) return hudTemplate
  const html = await fetch("/index.html").then((r) => r.text())
  const doc = new DOMParser().parseFromString(html, "text/html")
  hudTemplate = { hud: doc.getElementById("hud")!, safe: doc.getElementById("safe-area")! }
  return hudTemplate
}

const deviceOf = (s: State): Device => (s.device !== "auto" ? s.device : matchMedia("(pointer: coarse)").matches ? "touch" : "keyboard")

/** The player as the snapshot gives them: the Dopiete in hand, or dead at Sdrume's hands with two seconds to wait. */
function you(s: State, alive: boolean): SnapSelf {
  const primary = current(s)
  const ammo = Object.fromEntries(WEAPON_IDS.map((id) => [id, { mag: id === primary ? 2 : 12, reserve: id === primary ? 14 : 48 }]))
  const arsenal = {
    kit: s.single ? "single" : "full",
    current: primary,
    primary,
    nextPrimary: pending(s) ?? primary,
    power: s.single ? null : "lanciafrico",
    ammo,
    bombs: s.single ? 0 : 2,
    mines: s.single ? 0 : 1,
    sgnape: 0
  } as unknown as ArsenalValue
  return { hp: alive ? 82 : 0, armor: alive ? 25 : 0, shield: 0, respawn: 110, killer: alive ? null : KILLER, arsenal, alive } as unknown as SnapSelf
}

/** The match: Bataie, 23 to 19, 6:42 left. */
const SNAP = { training: null, players: [], score: { benandanti: 23, malandanti: 19 }, phase: { tag: "Live", ends: 402 * 60 }, tick: 0, objective: "bataie" } as unknown as Snapshot

/**
 * Draws the page: the backdrop, the game's HUD over it, the match menu or the variant's own
 * screen when one is open, and the prototype's bar. Drawn again on every change of state or size.
 */
export function run(root: HTMLElement, v: Variant) {
  const render = async () => {
    state = read()
    const s = state
    setLang(s.lang)
    document.documentElement.classList.toggle("shot", s.shot)
    const device = deviceOf(s)
    const template = await loadHud()
    const hudEl = template.hud.cloneNode(true) as HTMLElement
    root.replaceChildren(hudEl, template.safe.cloneNode(true))
    applyStatic(hudEl)
    hudEl.insertAdjacentHTML("beforeend", switcher(s))
    const hud = new Hud()
    hud.show(true)
    hud.layFor(device)
    if (device === "touch") hud.placeTouch(touchLayout({ width: innerWidth, height: innerHeight }, hud.safeInsets()))
    const menuOpen = s.screen === "menu" || s.screen === "pending" || s.screen === "armoury"
    const alive = s.screen !== "death"
    const me = you(s, alive)
    hud.top(SNAP, ROOM.mode, NAMES)
    hud.vitals(me, null)
    hud.crosshair(6, alive && !menuOpen)
    hud.death(me, { phase: "Live", mode: ROOM.mode, played: true }, NAMES, 11)
    hud.killfeed("toni", "nadia", "mulin", false, NAMES, TEAMS, ME, 1)
    if (!alive) hud.killfeed(KILLER, ME, "cjampanili", true, NAMES, TEAMS, ME, 2)
    hud.chat("Mariute", "benandanti", "o ven a curâ, no stait a murî")
    hud.touchShown(device === "touch" && !menuOpen)
    if (menuOpen) {
      const id = s.screen === "armoury" ? "loadout" : "pause"
      const drawn = s.screen === "armoury" && v.armoury ? v.armoury(s, device) : matchMenu(s, v, device)
      const content = document.getElementById(id)!
      content.querySelector("ui-dialog-title")!.innerHTML = drawn.title
      content.querySelector(".overlay-main")!.innerHTML = drawn.main
      content.hidden = false
      hudEl.classList.add("np-menu")
    }
    if (!menuOpen) v.decorate(s, device, hudEl)
    // For the screenshots: the page has drawn this state.
    document.documentElement.dataset.drawn = location.hash
  }
  // A prototype that fails says so on the page, where the screenshot shows it.
  const shown = () =>
    render().catch((e: unknown) => {
      root.innerHTML = `<pre class="np-error">${esc(String(e instanceof Error ? e.stack : e))}</pre>`
    })
  addEventListener("hashchange", () => void shown())
  let resized = 0
  addEventListener("resize", () => {
    clearTimeout(resized)
    resized = window.setTimeout(() => void shown(), 100)
  })
  root.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-set]")
    if (el && !(el as HTMLButtonElement).disabled) go(el.dataset.set!)
  })
  void shown()
}

/** The prototype's own bar, not part of the design: variant, screen, single weapon, device and language. */
function switcher(s: State) {
  const page = location.pathname.split("/").pop() ?? "a.html"
  const variants = ["a", "b", "c"].map((v) => `<a href="./${v}.html${location.hash}" ${page.startsWith(v) ? 'aria-current="page"' : ""}>${v.toUpperCase()}</a>`).join("")
  const screens = SCREENS.map((sc) => `<button data-set="screen=${sc}" ${s.screen === sc ? 'aria-current="true"' : ""}>${sc}</button>`).join("")
  const single = `<button data-set="single=${s.single ? 0 : 1}" ${s.single ? 'aria-current="true"' : ""}>single</button>`
  const devices = (["auto", "keyboard", "touch"] as const).map((d) => `<button data-set="device=${d}" ${s.device === d ? 'aria-current="true"' : ""}>${d}</button>`).join("")
  return `<nav class="proto-bar" aria-label="prototype">${variants}<span></span>${screens}<span></span>${single}<span></span>${devices}<span></span><button data-set="lang=${s.lang === "fur" ? "it" : "fur"}">${s.lang === "fur" ? "it" : "fur"}</button><a href="./index.html">≡</a></nav>`
}
