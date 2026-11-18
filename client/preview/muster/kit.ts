/**
 * Throwaway kit for the three Muster prototypes (ticket #77 of spec #72): a fake room, the class
 * table, the texts only the prototypes need, and the pieces every layout shows, drawn with the
 * game's own texts and styles. Nothing here is wired to the game and nothing in the game imports
 * it; delete the whole folder once the chosen layout is built.
 *
 * The state lives in the URL hash, so every screen has an address the screenshots can open:
 *   b.html#screen=join&lang=it    a.html#screen=countdown    c.html#screen=single&tab=primary
 */
import { BOT_LEVEL_IDS, TEAM_INFO } from "../../../shared/folklore.ts"
import type { Team } from "../../../shared/map.ts"
import { PRIMARIES, type PrimaryId } from "../../../shared/weapons.ts"
import { esc } from "../../hud.ts"
import { setLang, t, type Lang } from "../../i18n.ts"

/**
 * - `muster`: the room before a match, seen by its host.
 * - `countdown`: the host has pressed start; ten seconds, still changeable, the host can cancel.
 * - `join`: a player who came in while a match is on: score, time, confirm.
 * - `single`: a guest in a single-weapon room: the picker locked on the host's choice.
 */
export type Screen = "muster" | "countdown" | "join" | "single"
export const SCREENS: readonly Screen[] = ["muster", "countdown", "join", "single"]

export interface State {
  readonly lang: Lang
  readonly screen: Screen
  readonly primary: Prim
  readonly team: Team
  readonly ready: boolean
  /** `join` in a Tampieste: the player enters from the next match. */
  readonly storm: boolean
  /** C's tab on a phone. */
  readonly tab: Tab
}

export type Tab = "teams" | "primary" | "chat" | "room"
export const TABS: readonly Tab[] = ["teams", "primary", "chat", "room"]

/** The primaries and the Motosee, which a later ticket adds: seven cards to lay out, not six. */
export type Prim = PrimaryId | "motosee"
export const PRIMS: readonly Prim[] = [...PRIMARIES, "motosee"]

const DEFAULTS: State = { lang: "fur", screen: "muster", primary: "doplete", team: "benandanti", ready: false, storm: false, tab: "teams" }

const oneOf = <T extends string>(ids: readonly T[], v: string | null, fallback: T): T => ids.find((id) => id === v) ?? fallback

function read(): State {
  const q = new URLSearchParams(location.hash.slice(1))
  return {
    lang: oneOf(["fur", "it"], q.get("lang"), DEFAULTS.lang),
    screen: oneOf(SCREENS, q.get("screen"), DEFAULTS.screen),
    primary: oneOf(PRIMS, q.get("primary"), DEFAULTS.primary),
    team: oneOf(["benandanti", "malandanti"], q.get("team"), DEFAULTS.team),
    ready: q.get("ready") === "1",
    storm: q.get("storm") === "1",
    tab: oneOf(TABS, q.get("tab"), DEFAULTS.tab)
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
  for (const k of ["ready", "storm"]) if (typeof next[k] === "string") next[k] = next[k] === "1"
  write({ ...state, ...next } as State)
}

export function run(root: HTMLElement, draw: (s: State) => string) {
  const render = () => {
    state = read()
    setLang(state.lang)
    document.documentElement.lang = state.lang
    root.innerHTML = draw(state) + switcher(state)
    root.dataset.screen = state.screen
    const log = root.querySelector(".mu-chat-log")
    if (log) log.scrollTop = log.scrollHeight
  }
  addEventListener("hashchange", render)
  root.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-set]")
    if (el && !(el as HTMLButtonElement).disabled) go(el.dataset.set!)
  })
  render()
}

/** The prototype's own bar, not part of the design: variant, screen and language. */
function switcher(s: State) {
  const page = location.pathname.split("/").pop() ?? "a.html"
  const variants = ["a", "b", "c"].map((v) => `<a href="./${v}.html${location.hash}" ${page.startsWith(v) ? 'aria-current="page"' : ""}>${v.toUpperCase()}</a>`).join("")
  const screens = SCREENS.map((sc) => `<button data-set="screen=${sc}" ${s.screen === sc ? 'aria-current="true"' : ""}>${sc}</button>`).join("")
  return `<nav class="proto-bar" aria-label="prototype">${variants}<span></span>${screens}<span></span><button data-set="lang=${s.lang === "fur" ? "it" : "fur"}">${s.lang === "fur" ? "it" : "fur"}</button><a href="./index.html">≡</a></nav>`
}

// ------------------------------------------------------------------------------- data

/** The spec's starting class table: health and base speed for each primary. */
export const CLASS: Record<Prim, { readonly health: number; readonly speed: number }> = {
  cramar: { health: 100, speed: 1.0 },
  doplete: { health: 110, speed: 1.05 },
  cjampanili: { health: 75, speed: 0.95 },
  mulin: { health: 150, speed: 0.8 },
  miedi: { health: 90, speed: 1.05 },
  gjalinis: { health: 100, speed: 0.95 },
  motosee: { health: 125, speed: 1.12 }
}

interface Member {
  readonly id: string
  readonly name: string
  readonly team: Team
  readonly primary: Prim
  readonly bot: boolean
  readonly ready: boolean
  /** A joiner who has not entered yet: in the room, not on the map. */
  readonly out?: boolean
}

export const ME = "me"
/** The single weapon of the `single` screen. */
export const SINGLE: Prim = "cjampanili"

const OTHERS: readonly Member[] = [
  { id: "toni", name: "Toni", team: "benandanti", primary: "mulin", bot: false, ready: true },
  { id: "mariute", name: "Mariute", team: "benandanti", primary: "miedi", bot: false, ready: false },
  { id: "b1", name: "Pieri Gubane", team: "benandanti", primary: "cramar", bot: true, ready: true },
  { id: "sdrume", name: "Sdrume", team: "malandanti", primary: "cjampanili", bot: false, ready: true },
  { id: "nadia", name: "Nadia", team: "malandanti", primary: "gjalinis", bot: false, ready: false },
  { id: "bepi", name: "Bepi di Vençon", team: "malandanti", primary: "motosee", bot: false, ready: true },
  { id: "b2", name: "Strie Sorc", team: "malandanti", primary: "doplete", bot: true, ready: true }
]

const isJoin = (s: State) => s.screen === "join"
/** The host is "me" except where a guest's view is what is being judged. */
export const isHost = (s: State) => s.screen === "muster" || s.screen === "countdown"
export const myPrimary = (s: State): Prim => (s.screen === "single" ? SINGLE : s.primary)

/** The roster as the room would send it, the player in it. A joiner is not on a team until they enter. */
export function roster(s: State): Record<Team, Member[]> {
  const me: Member = { id: ME, name: "Meni", team: s.team, primary: myPrimary(s), bot: false, ready: s.ready, out: isJoin(s) }
  const all = [...OTHERS.map((m) => (s.screen === "single" ? { ...m, primary: SINGLE } : m)), me]
  const teams: Record<Team, Member[]> = { benandanti: [], malandanti: [] }
  for (const m of all) teams[m.team].push(m)
  return teams
}

const hostId = (s: State) => (isHost(s) ? ME : "toni")

export const readyCount = (s: State) => {
  const humans = [...roster(s).benandanti, ...roster(s).malandanti].filter((m) => !m.bot && !m.out)
  return { ready: humans.filter((m) => m.ready).length, of: humans.length }
}

/** The room: mode, map, length, reach, access, code. */
export const ROOM = { code: "GLMN", mode: "bataie", map: "glemone", minutes: 10, reach: "lan", access: "password", level: "pari" } as const

/** A match already on, for the joiner: score and time left. */
export const LIVE = { ben: 23, mal: 19, left: "6:42" }

const CHAT: readonly [string, Team, string][] = [
  ["Toni", "benandanti", "Jo o cjol il Mulin, cuvierç la puarte"],
  ["Sdrume", "malandanti", "Cjampanili su la tor, come simpri"],
  ["Mariute", "benandanti", "Miedi. No stait a murî masse"],
  ["Bepi di Vençon", "malandanti", "A rivin chei di Paulâr 🪚"],
  ["Nadia", "malandanti", "un minût, o cjol un cafè"]
]

// ------------------------------------------------------------------------------- texts

/** Texts only the prototypes use. Generated Friulian: the owner's to correct. */
const PT = {
  fur: {
    ready: "Pront",
    notReady: "Al sielç",
    out: "no ancjemò dentri",
    imReady: "O soi pront",
    notYet: "No soi ancjemò pront",
    readyCount: (r: number, n: number) => `${r} di ${n} pronts`,
    countdown: "Si partìs tra",
    countdownSub: "Si pues ancjemò cambiâ squadre e arme",
    cancel: "Ferme",
    waitHost: "L'host al fâs partî cuant che o sês pronts",
    health: "Vite",
    speed: "Sveltece",
    you: "tu",
    team: "Squadre",
    joinTitle: "Partide in cors",
    joinSub: "Sielç squadre e arme, po jentre. Nissune presse: fin che no tu jentris no tu sês su la mape.",
    enter: "Jentre in partide",
    left: (t: string) => `mancjin ${t}`,
    seat: "Un bot al ten il to puest fin che tu jentris",
    stormNext: "Te Tampieste si jentre de prossime partide: tu jentris cuant che e finìs chê di cumò.",
    single: "Arme uniche",
    singleOff: "Distudade",
    singleOn: (w: string) => `Arme uniche: ducj cun ${w} e il Mescul`,
    singleWhy: "Le cambie dome l'host, te Adunade",
    room: "Stanze",
    teams: "Squadris",
    motosee: { name: "Motosee", blurb: "A rivin chei di Paulâr." }
  },
  it: {
    ready: "Pronto",
    notReady: "Sceglie",
    out: "non ancora dentro",
    imReady: "Sono pronto",
    notYet: "Non sono ancora pronto",
    readyCount: (r: number, n: number) => `${r} su ${n} pronti`,
    countdown: "Si parte tra",
    countdownSub: "Si possono ancora cambiare squadra e arma",
    cancel: "Ferma",
    waitHost: "L'host fa partire quando siete pronti",
    health: "Vita",
    speed: "Velocità",
    you: "tu",
    team: "Squadra",
    joinTitle: "Partita in corso",
    joinSub: "Scegli squadra e arma, poi entra. Nessuna fretta: finché non entri non sei sulla mappa.",
    enter: "Entra in partita",
    left: (t: string) => `mancano ${t}`,
    seat: "Un bot tiene il tuo posto finché non entri",
    stormNext: "Nella Tampieste si entra dalla prossima partita: entri quando finisce quella in corso.",
    single: "Arma unica",
    singleOff: "Spenta",
    singleOn: (w: string) => `Arma unica: tutti con ${w} e il Mescul`,
    singleWhy: "La cambia solo l'host, nell'Adunata",
    room: "Stanza",
    teams: "Squadre",
    motosee: { name: "Motosee", blurb: "Arrivano quelli di Paularo." }
  }
} as const

export const pt = () => PT[state.lang]

export const primName = (p: Prim) => (p === "motosee" ? pt().motosee.name : t().weapons[p].name)
const primBlurb = (p: Prim) => (p === "motosee" ? pt().motosee.blurb : t().weapons[p].blurb)

// ------------------------------------------------------------------------------- pieces

const teamName = (team: Team) => t().teams[team].name
const other = (team: Team): Team => (team === "benandanti" ? "malandanti" : "benandanti")

/** Mode · map · length. */
export const roomLine = () => `${t().modes[ROOM.mode].name} · ${t().maps[ROOM.map].name} · ${t().menu.minutes(ROOM.minutes)}`

/** Code, copy, reach and access, as the match menu draws them. */
export function roomCode() {
  const p = t().pause
  return `<div class="pause-code mu-code">
    <div><div class="muted">${p.code}</div><div class="invite">${ROOM.code}</div></div>
    <div class="pause-share"><button>${p.copy}</button><div class="muted pause-reach">${p.reach[ROOM.reach]} · 🔒 ${p.access[ROOM.access]}</div></div>
  </div>`
}

/** Health and speed of a primary, as two bars with their numbers. */
export function classStats(p: Prim, cls = "") {
  const c = CLASS[p]
  const bar = (label: string, v: number, text: string) => `<span class="stat mu-stat">${label}<i style="width:${Math.round(v * 100)}%"></i><b>${text}</b></span>`
  return `<span class="stats mu-stats ${cls}">${bar(pt().health, c.health / 150, String(c.health))}${bar(pt().speed, (c.speed - 0.6) / 0.55, `×${c.speed.toFixed(2)}`)}</span>`
}

/** One member's row: name, marks, primary, ready. */
export function memberRow(s: State, m: Member, compact = false) {
  const you = m.id === ME
  const crown = m.id === hostId(s) ? ` <span title="host">👑</span>` : ""
  const ready = m.out ? `<span class="mu-ready out" title="${pt().out}" aria-label="${pt().out}">⌛</span>` : isJoin(s) ? "" : m.ready || m.bot ? `<span class="mu-ready on" title="${pt().ready}">✓${compact ? "" : ` ${pt().ready}`}</span>` : `<span class="mu-ready" title="${pt().notReady}">…${compact ? "" : ` ${pt().notReady}`}</span>`
  return `<li class="mu-member${you ? " me" : ""}${m.out ? " out" : ""}${m.bot ? " bot" : ""}">
    <span class="mu-name">${esc(m.name)}${m.bot ? " 🤖" : ""}${crown}${you ? ` <i class="mu-you">${pt().you}</i>` : ""}</span>
    <span class="mu-prim">${primName(m.primary)}</span>${ready}
  </li>`
}

/** A team's list under its name; the joiner sees the score in its head. */
export function teamList(s: State, team: Team, opts: { compact?: boolean; switchable?: boolean } = {}) {
  const list = roster(s)[team]
  const mine = s.team === team
  const sw = opts.switchable && !mine ? `<button class="mu-switch" data-set="team=${team}">${t().pause.switchTeam(teamName(team))}</button>` : ""
  return `<section class="mu-team mu-${team}${mine ? " mine" : ""}" style="--team:${TEAM_INFO[team].color}">
    <header><h3>${teamName(team)}</h3><span class="muted">${list.length}</span></header>
    <ul>${list.map((m) => memberRow(s, m, opts.compact)).join("")}</ul>${sw}
  </section>`
}

/** Team choice as a two-way switch (A and C); B switches by its flanks. */
export function teamChoice(s: State) {
  const b = (team: Team) =>
    `<button role="radio" aria-checked="${s.team === team}" class="${s.team === team ? "on" : ""}" data-set="team=${team}" style="--team:${TEAM_INFO[team].color}">${teamName(team)}</button>`
  return `<div class="field mu-teamchoice"><span>${pt().team}</span><div class="seg wide" role="radiogroup">${b("benandanti")}${b("malandanti")}</div></div>`
}

/**
 * The primary picker: the game's weapon cards, each with the class's health and speed. `look`
 * is how dense: full cards, short rows, or tiles. Locked under single weapon.
 */
export function picker(s: State, look: "cards" | "rows" | "tiles") {
  const locked = s.screen === "single"
  const mine = myPrimary(s)
  const item = (p: Prim) => {
    const on = p === mine
    const dis = locked && !on
    const body =
      look === "cards"
        ? `<b>${primName(p)}</b><span class="blurb">${primBlurb(p)}</span>${classStats(p)}`
        : look === "rows"
          ? `<b>${primName(p)}</b>${classStats(p, "inline")}`
          : `<b>${primName(p)}</b><span class="mu-nums">♥ ${CLASS[p].health} · ⇢ ${CLASS[p].speed.toFixed(2)}</span>`
    return `<button class="weapon mu-${look}" role="radio" aria-checked="${on}"${on ? " data-checked" : ""}${dis ? " disabled" : ""} data-set="primary=${p}">${body}</button>`
  }
  const lock = locked ? `<p class="mu-lock">🔒 ${pt().singleOn(primName(SINGLE))}<small>${pt().singleWhy}</small></p>` : ""
  return `${lock}<div class="weapon-cards mu-picker mu-picker-${look}${locked ? " locked" : ""}" role="radiogroup" aria-label="${t().muster.primary}">${PRIMS.map(item).join("")}</div>`
}

/** The chosen primary, big: what the player enters with. */
export function chosen(s: State) {
  const p = myPrimary(s)
  return `<div class="mu-chosen"><span class="tag">${t().muster.primary}</span><b>${primName(p)}</b><span class="blurb">${primBlurb(p)}</span>${classStats(p)}</div>`
}

/** The host's bot tools and the single-weapon setting; for a guest, who starts. */
export function hostTools(s: State) {
  const p = t().pause
  if (!isHost(s)) return `<div class="muted host-only">${p.hostOnly}</div>`
  const ben = TEAM_INFO.benandanti.short
  const mal = TEAM_INFO.malandanti.short
  const levels = BOT_LEVEL_IDS.map((l) => `<option${l === ROOM.level ? " selected" : ""}>${t().levels[l].name}</option>`).join("")
  const singles = [`<option>${pt().singleOff}</option>`, ...PRIMS.map((w) => `<option>${primName(w)}</option>`)].join("")
  return `<div class="host-tools mu-host"><span class="host-label">👑 ${p.host}</span>
    <div class="host-bots"><button>${p.addBot(ben)}</button><button>${p.removeBot(ben)}</button><button>${p.addBot(mal)}</button><button>${p.removeBot(mal)}</button></div>
    <label class="mu-select">${p.level}<select>${levels}</select></label>
    <label class="mu-select">${pt().single}<select>${singles}</select></label>
  </div>`
}

export function chat() {
  const m = t().muster
  const lines = CHAT.map(([n, team, text]) => `<div><b style="color:${TEAM_INFO[team].color}">${esc(n)}</b>: ${esc(text)}</div>`).join("")
  return `<div class="mu-chat"><div class="mu-chat-log" role="log">${lines}</div><input maxlength="120" placeholder="${m.chatPlaceholder}" aria-label="${m.chat}" /></div>`
}

/** Score and time of the match the joiner is about to enter. */
export function liveBar() {
  return `<div class="mu-live"><span style="color:var(--ben)">${TEAM_INFO.benandanti.short} <b>${LIVE.ben}</b></span><span class="muted">${pt().left(LIVE.left)}</span><span style="color:var(--mal)"><b>${LIVE.mal}</b> ${TEAM_INFO.malandanti.short}</span></div><p class="mu-joinsub">${pt().joinSub}</p>`
}

/** The countdown: big number, what it means, and cancel for the host. */
export function countdown(s: State) {
  return `<div class="mu-countdown" role="timer"><span>${pt().countdown}</span><b>7</b><small>${pt().countdownSub}</small>${isHost(s) ? `<button data-set="screen=muster">${pt().cancel}</button>` : ""}</div>`
}

/**
 * The actions under the thumb: ready and start in the Muster, cancel during the countdown, enter
 * for the joiner; leave always.
 */
export function actions(s: State, leaveHere = true) {
  const p = t().pause
  const rc = readyCount(s)
  const ready = `<button class="mu-readybtn${s.ready ? " on" : ""}" aria-pressed="${s.ready}" data-set="ready=${s.ready ? 0 : 1}">${s.ready ? `✓ ${pt().imReady}` : pt().imReady}</button>`
  const leave = leaveHere ? leaveButton() : ""
  if (isJoin(s))
    return `<div class="mu-actions">${s.storm ? `<p class="mu-note">${pt().stormNext}</p>` : `<p class="mu-note muted">${pt().seat}</p><button class="primary mu-go">${pt().enter}</button>`}${leave}</div>`
  if (s.screen === "countdown") return `<div class="mu-actions">${countdown(s)}${ready}${leave}</div>`
  const start = isHost(s) ? `<button class="primary mu-go" data-set="screen=countdown">${p.start}<small>${pt().readyCount(rc.ready, rc.of)}</small></button>` : `<p class="mu-note muted">${pt().waitHost} · ${pt().readyCount(rc.ready, rc.of)}</p>`
  return `<div class="mu-actions">${start}${ready}${leave}</div>`
}

export const leaveButton = (cls = "") => `<button class="mu-leave ${cls}">${t().pause.leave}</button>`

/** The screen's title: the Muster, or the match on. */
export const title = (s: State) => (isJoin(s) ? pt().joinTitle : t().muster.title)

export { other, teamName }
