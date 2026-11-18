/**
 * Throwaway kit for the three menu prototypes (spec #20): the state they move between,
 * fake rooms, and the pieces every prototype shows, drawn with the game's real texts.
 * Nothing here is wired to the game; delete the whole folder once the real menu lands.
 *
 * The state lives in the URL hash, so every screen has an address the screenshots can open:
 *   a.html#screen=create&step=3&reach=online&access=password&lang=it&rooms=empty
 */
import { BOT_LEVEL_IDS, MODE_IDS, type BotLevel, type ModeId } from "../../../shared/folklore.ts"
import type { MapId } from "../../../shared/map.ts"
import { MAP_IDS } from "../../../shared/maps/index.ts"
import { ACCESSES, REACHES, type Access, type Reach, type RoomSummary } from "../../../shared/protocol.ts"
import { esc } from "../../hud.ts"
import { setLang, t, type Lang } from "../../i18n.ts"
import { LOOK_IDS, LOOKS, type LookId } from "../../looks.ts"

export interface State {
  readonly lang: Lang
  /** The prototype's own screen names. */
  readonly screen: string
  readonly step: number
  /** `empty` shows the room list with no rooms. */
  readonly rooms: "some" | "empty"
  /** The prototype's one folding thing: B's options, C's creation panel. */
  readonly open: boolean
  readonly mode: ModeId
  readonly map: MapId
  readonly reach: Reach
  readonly access: Access
  readonly level: BotLevel
  readonly look: LookId
}

const DEFAULTS: State = { lang: "fur", screen: "home", step: 1, rooms: "some", open: false, mode: "bataie", map: "glemone", reach: "lan", access: "open", level: "pari", look: "cumo" }

const oneOf = <T extends string>(ids: readonly T[], v: string | null, fallback: T): T => ids.find((id) => id === v) ?? fallback

function read(): State {
  const q = new URLSearchParams(location.hash.slice(1))
  return {
    lang: oneOf(["fur", "it"], q.get("lang"), DEFAULTS.lang),
    screen: q.get("screen") ?? DEFAULTS.screen,
    step: Number(q.get("step") ?? DEFAULTS.step),
    rooms: oneOf(["some", "empty"], q.get("rooms"), DEFAULTS.rooms),
    open: q.get("open") === "1",
    mode: oneOf(MODE_IDS, q.get("mode"), DEFAULTS.mode),
    map: oneOf(MAP_IDS, q.get("map"), DEFAULTS.map),
    reach: oneOf(REACHES, q.get("reach"), DEFAULTS.reach),
    access: oneOf(ACCESSES, q.get("access"), DEFAULTS.access),
    level: oneOf(BOT_LEVEL_IDS, q.get("level"), DEFAULTS.level),
    look: oneOf(LOOK_IDS, q.get("look"), DEFAULTS.look)
  }
}

function write(s: State) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(s)) {
    const value = typeof v === "boolean" ? (v ? "1" : "0") : String(v)
    if (value !== String(typeof v === "boolean" ? (DEFAULTS[k as keyof State] ? "1" : "0") : DEFAULTS[k as keyof State])) q.set(k, value)
  }
  location.hash = q.toString()
}

export let state = read()

/** Moves to another state: `{ screen: "create" }`, or `"screen=create&step=1"` from a `data-set` attribute. */
export function go(patch: Partial<State> | string) {
  const next = typeof patch === "string" ? Object.fromEntries(new URLSearchParams(patch)) : patch
  const merged = { ...state, ...next }
  if (typeof next.open === "string") merged.open = next.open === "1"
  if (typeof next.step === "string") merged.step = Number(next.step)
  write(merged as State)
}

/** What the player typed: kept outside the hash, so it survives redraws. */
export const typed = { name: "Meni", code: "", password: "", minutes: "10", bots: "3", ff: false }

/**
 * Draws the prototype on every move. `back` is where `Esc` goes from a state (null: nowhere).
 * Buttons with `data-set="k=v&…"` move; inputs with `data-typed="name"` are remembered.
 */
export function run(root: HTMLElement, draw: (s: State) => string, back: (s: State) => Partial<State> | null) {
  const render = () => {
    state = read()
    setLang(state.lang)
    root.innerHTML = draw(state)
    root.dataset.screen = state.screen
  }
  addEventListener("hashchange", render)
  root.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-set]")
    if (el && !(el as HTMLButtonElement).disabled) go(el.dataset.set!)
  })
  root.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement
    const key = el.dataset.typed as keyof typeof typed | undefined
    if (!key) return
    if (key === "ff") typed.ff = el.checked
    else typed[key] = el.value
  })
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return
    const to = back(state)
    if (to) go(to)
  })
  render()
}

// ------------------------------------------------------------------------------- fake rooms

/** The room list as the host would send it: LAN first, then Online. Covers LAN, Online, password and full rooms. */
export const FAKE_ROOMS: readonly RoomSummary[] = [
  { code: "GLMN", host: "Toni", reach: "lan", access: "open", mode: "bataie", map: "glemone", players: 3, bots: 5, max: 16, phase: "Live" },
  { code: "OSOF", host: "Mariute", reach: "lan", access: "password", mode: "frico", map: "osoppo", players: 6, bots: 2, max: 16, phase: "Warmup" },
  { code: "VENC", host: "Bepi di Vençon", reach: "online", access: "open", mode: "culine", map: "venzone", players: 9, bots: 0, max: 16, phase: "Live" },
  { code: "RAIB", host: "Sdrume", reach: "online", access: "password", mode: "cjar", map: "predil", players: 4, bots: 4, max: 16, phase: "Live" },
  { code: "MARN", host: "Pieri dal Lât", reach: "online", access: "open", mode: "tampieste", map: "maran", players: 16, bots: 0, max: 16, phase: "Live" },
  { code: "PALP", host: "Nadia", reach: "online", access: "open", mode: "bataie", map: "trincee", players: 2, bots: 6, max: 16, phase: "Warmup" }
]

export const roomsOf = (s: State) => (s.rooms === "empty" ? [] : FAKE_ROOMS)

// ------------------------------------------------------------------------------- pieces

const pressed = (on: boolean) => `aria-pressed="${on}"${on ? ` class="on"` : ""}`

/** Furlan / Italiano. */
export function langSwitch(s: State, compact = false) {
  const b = (l: Lang, label: string) => `<button data-set="lang=${l}" ${pressed(s.lang === l)}>${label}</button>`
  return `<div class="seg lang-seg${compact ? " compact" : ""}" role="group" aria-label="${t().static.language}"><span class="seg-label">${t().static.language}</span>${b("fur", "Furlan")}${b("it", "Italiano")}</div>`
}

/** Cumò / Vêr. */
export function lookSwitch(s: State, compact = false) {
  const b = (id: LookId) => `<button data-set="look=${id}" ${pressed(s.look === id)}>${LOOKS[id]}</button>`
  return `<div class="seg look-seg${compact ? " compact" : ""}" role="group" aria-label="${t().menu.look}"><span class="seg-label">${t().menu.look}</span>${LOOK_IDS.map(b).join("")}</div>`
}

export function nameField(cls = "") {
  const s = t().static
  return `<label class="field name ${cls}"><span>${s.nameLabel}</span><input data-typed="name" maxlength="20" value="${esc(typed.name)}" placeholder="${s.namePh}" autocomplete="off" /></label>`
}

/** The one-tap Offline match; `line` shows what it will start. */
export function oneTapButton(s: State, cls = "big primary") {
  const st = t().static
  return `<button class="${cls} one-tap"><span>${st.oneTap}</span><small>${st.oneTapSub}</small><small class="last">${lastLine(s)}</small></button>`
}

/** The last settings, as the one-tap button would reuse them. */
export const lastLine = (s: State) => `${t().modes[s.mode].name} · ${t().maps[s.map].name} · ${t().menu.minutes(Number(typed.minutes))}`

export function codeJoin(cls = "") {
  const st = t().static
  const id = `code-${cls.split(" ")[0] || "join"}`
  return `<form class="code-join ${cls}" onsubmit="return false"><label for="${id}">${st.join}</label><input id="${id}" data-typed="code" maxlength="4" placeholder="ABCD" value="${esc(typed.code)}" autocomplete="off" autocapitalize="characters" spellcheck="false" /><button>${st.joinGo}</button></form>`
}

/** The training's reserved place: shown, not usable yet. */
export function trainingEntry(cls = "big") {
  const tr = t().menu.training
  return `<button class="${cls} training" disabled><span>${tr.name} <i class="soon">${tr.soon}</i></span><small>${tr.sub}</small></button>`
}

/** Armoury, settings, vocabulary. */
export function tools(cls = "tools") {
  const st = t().static
  return `<div class="${cls}"><button>${st.armarie}</button><button>${st.settings}</button><button>${st.vocab}</button></div>`
}

export function roomRow(r: RoomSummary) {
  const s = t()
  const full = r.players >= r.max
  const locked = r.reach !== "offline" && r.access === "password"
  const lock = locked ? `<i class="lock" role="img" aria-label="${s.menu.passwordRoom}" title="${s.menu.passwordRoom}">🔒</i>` : ""
  return `<li><button class="room${full ? " full" : ""}"${full ? " disabled" : ""}>
    <span class="room-tags"><i class="chip ${r.reach}">${s.menu.reach[r.reach]}</i>${lock}</span>
    <span class="room-what"><b>${esc(r.host)}</b><small>${s.modes[r.mode].name} · ${s.maps[r.map].name}</small></span>
    <span class="room-seats"><b>${r.players}/${r.max}</b><small>${full ? s.menu.full : r.code}</small></span>
  </button></li>`
}

/** The list, or the empty list offering to create a room. */
export function roomList(s: State, createSet: string) {
  const list = roomsOf(s)
  if (list.length) return `<ul class="rooms">${list.map(roomRow).join("")}</ul>`
  return `<div class="rooms-empty"><p>${t().menu.roomsEmpty}</p><button class="primary" data-set="${createSet}">${t().static.create}</button></div>`
}

export function modeCard(s: State, id: ModeId, rules = true) {
  const m = t().modes[id]
  return `<button class="card${id === s.mode ? " selected" : ""}" data-set="mode=${id}" role="radio" aria-checked="${id === s.mode}"><b>${m.name}</b><small>${m.sub}</small>${rules ? `<small class="rules">${m.rules}</small>` : ""}</button>`
}

export function mapCard(s: State, id: MapId) {
  const m = t().maps[id]
  return `<button class="card map-card map-${id}${id === s.map ? " selected" : ""}" data-set="map=${id}" role="radio" aria-checked="${id === s.map}"><b>${m.name}</b><small>${m.sub}</small></button>`
}

export function levelCards(s: State) {
  const l = t().levels
  return `<div class="levels" role="radiogroup">${BOT_LEVEL_IDS.map((id) => `<button class="card${id === s.level ? " selected" : ""}" data-set="level=${id}" role="radio" aria-checked="${id === s.level}"><b>${l[id].name}</b><small>${l[id].sub}</small></button>`).join("")}</div>`
}

/** The three reaches, each with its line. Offline drops access. */
export function reachCards(s: State) {
  const m = t().menu
  return `<div class="reaches" role="radiogroup" aria-label="${t().static.reachLabel}">${REACHES.map((r) => `<button class="card${r === s.reach ? " selected" : ""}" data-set="reach=${r}" role="radio" aria-checked="${r === s.reach}"><b><i class="chip ${r}">${m.reach[r]}</i></b><small>${m.reachSub[r]}</small></button>`).join("")}</div>`
}

/** Access, only for LAN and Online; the password field only with Password. */
export function accessBlock(s: State) {
  if (s.reach === "offline") return ""
  const st = t().static
  const opt = (a: Access, label: string) => `<button data-set="access=${a}" role="radio" aria-checked="${a === s.access}"${a === s.access ? ` class="on"` : ""}>${label}</button>`
  const password =
    s.access === "password"
      ? `<label class="field"><span>${st.passwordLabel}</span><input data-typed="password" maxlength="32" value="${esc(typed.password)}" autocomplete="off" spellcheck="false" /></label>`
      : ""
  return `<div class="field access"><span>${st.accessLabel}</span><div class="seg wide" role="radiogroup">${opt("open", st.accessOpen)}${opt("password", `🔒 ${st.accessPassword}`)}</div></div>${password}`
}

const MINUTES = [5, 10, 15, 20]

export function minutesSelect() {
  const m = t().menu
  return `<label class="field"><span>${t().static.minutesLabel}</span><select data-typed="minutes">${MINUTES.map((n) => `<option value="${n}"${String(n) === typed.minutes ? " selected" : ""}>${m.minutes(n)}</option>`).join("")}</select></label>`
}

export function botsSelect() {
  const m = t().menu
  return `<label class="field"><span>${t().static.botsLabel}</span><select data-typed="bots">${Array.from({ length: 8 }, (_, i) => `<option value="${i}"${String(i) === typed.bots ? " selected" : ""}>${i === 0 ? m.botsNone : i}</option>`).join("")}</select></label>`
}

export const ffCheck = () => `<label class="check"><input type="checkbox" data-typed="ff"${typed.ff ? " checked" : ""} /> <span>${t().static.ff}</span></label>`

/** Duration, bots, skill, reach, access: in one line, for a summary. */
export function optionsLine(s: State) {
  const m = t().menu
  const st = t().static
  const bots = Number(typed.bots)
  const parts = [m.minutes(Number(typed.minutes)), `${bots === 0 ? m.botsNone : `${bots} bot`}`, t().levels[s.level].name, m.reach[s.reach]]
  if (s.reach !== "offline") parts.push(s.access === "password" ? `🔒 ${st.accessPassword}` : st.accessOpen)
  return parts.join(" · ")
}

/** Why create would be refused, or "" when it would go. */
export function missing(s: State) {
  if (!typed.name.trim()) return t().menu.needName
  if (s.reach !== "offline" && s.access === "password" && !typed.password) return t().menu.passwordBad
  return ""
}

export const brand = (cls = "") => `<header class="brand-x ${cls}"><div class="kicker">${t().static.kicker}</div><h1>Sparedût</h1><div class="sub">${t().static.sub}</div></header>`
