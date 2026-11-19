/**
 * The in-match menus' steps, with no DOM: which menu Esc goes back to, and where focus lands
 * when one opens, and what the Muster shows. The game draws the menus; this decides the order
 * between them and their content.
 */
import { TEAMS, type Team } from "../shared/map.ts"
import type { ClientMessage, Reach, RoomInfo } from "../shared/protocol.ts"
import { everyoneAlone } from "../shared/sim/rules.ts"
import { TICK_RATE } from "../shared/movement.ts"
import type { PhaseView } from "../shared/sim/view.ts"
import { isTraining } from "../shared/training/index.ts"
import { PRIMARIES, type PrimaryId } from "../shared/weapons.ts"

/** The menus a player opens over the match: the match menu, the loadout, the settings. */
export const MATCH_MENUS = ["pause", "loadout", "settings"] as const

/** The menu open over the match, or none. */
export type MatchMenu = "none" | (typeof MATCH_MENUS)[number]

/** Esc closes one step: the settings go back to the match menu, the loadout to where it was opened from. */
export function afterEscape(open: MatchMenu, loadoutFrom: "none" | "pause"): MatchMenu {
  if (open === "loadout") return loadoutFrom
  if (open === "settings") return "pause"
  return "none"
}

/**
 * The id of the control that takes focus when `which` opens after `previous`, or null for the
 * menu's first control. Back in the match menu, focus returns to the button that left it.
 */
export function focusOnOpen(which: MatchMenu, previous: MatchMenu): string | null {
  if (which !== "pause") return null
  if (previous === "settings") return "p-settings"
  if (previous === "loadout") return "p-loadout"
  return "p-resume"
}

/**
 * What the match menu offers for the primary: in a training the armoury, where it changes on the
 * spot; in a match the player's primary, read-only, for it is fixed until the Muster (nothing for
 * somebody not in the roster: never the armoury outside a training).
 */
export type MenuPrimary = { readonly tag: "armoury" } | { readonly tag: "fixed"; readonly primary: PrimaryId } | { readonly tag: "none" }

export function menuPrimary(room: Pick<RoomInfo, "mode" | "roster">, me: string): MenuPrimary {
  if (isTraining(room.mode)) return { tag: "armoury" }
  const primary = room.roster.find((r) => r.id === me)?.primary
  return primary ? { tag: "fixed", primary } : { tag: "none" }
}

/** The end screen's first focus: another match for the host, who alone can start one; leaving for the rest. */
export const endFocus = (host: boolean): string => (host ? "e-again" : "e-leave")

/** A member as the Muster lists them in their team. */
export interface MusterMember {
  readonly id: string
  readonly name: string
  readonly primary: PrimaryId
  /** Marked ready (a bot always is). */
  readonly ready: boolean
  readonly bot: boolean
  readonly host: boolean
}

/**
 * The primary picker of the Muster and the match's armoury: free, on the player's own primary, or
 * locked on the host's choice under single weapon, when nothing picked there is sent or remembered.
 */
export type PrimaryPicker = { readonly _tag: "free"; readonly chosen: PrimaryId } | { readonly _tag: "locked"; readonly chosen: PrimaryId }

export const primaryPicker = (room: Pick<RoomInfo, "single">, own: PrimaryId): PrimaryPicker =>
  room.single ? { _tag: "locked", chosen: room.single } : { _tag: "free", chosen: own }

/** The host's single-weapon control in the Muster: off, then every primary. */
export const SINGLE_OFF = "off"

/** The control's value for the room's setting. */
export const singleValue = (single: PrimaryId | null): string => single ?? SINGLE_OFF

/** The setting a value of the control asks for: a primary, or off for anything else. */
export const singleOf = (value: string): PrimaryId | null => PRIMARIES.find((p) => p === value) ?? null

/**
 * The Muster's first focus: start, in an Offline room, whose one player is its host, so that one
 * press begins the match; elsewhere the screen's first control, so that a host's stray press
 * does not start a match others are still choosing for.
 */
export const musterFocus = (who: { readonly host: boolean; readonly reach: Reach }): string | null => (who.host && who.reach === "offline" ? "m-start" : null)

/**
 * The Muster screen a member sees, if any. `muster`: the room is in its Muster. `joining`: they
 * joined a live match and have not entered it, so they choose, see the score and the time, and
 * confirm; `nextMatch` when entering now plays from the next match (the Tampieste has one life).
 * During the results the end screen shows instead, for everybody.
 */
export type MusterScreen = { readonly tag: "closed" } | { readonly tag: "muster" } | { readonly tag: "joining"; readonly nextMatch: boolean }

export function musterScreen(room: Pick<RoomInfo, "roster" | "mode">, me: string, phase: RoomInfo["phase"]): MusterScreen {
  if (phase === "Muster") return { tag: "muster" }
  if (phase === "Live" && room.roster.find((r) => r.id === me)?.place === "waiting") return { tag: "joining", nextMatch: room.mode === "tampieste" }
  return { tag: "closed" }
}

/** The Muster's countdown in whole seconds left, rounded up so that it never reads 0 before the start; null while none runs. */
export function musterCountdown(phase: PhaseView, tick: number): number | null {
  if (phase.tag !== "Muster" || phase.starts === null) return null
  return Math.max(1, Math.ceil((phase.starts - tick) / TICK_RATE))
}

/**
 * Whether the host's start, which counts as the host's ready mark, goes live at once: every other
 * human member is ready. Then the press that starts is the one that takes the pointer for the match.
 */
export const startsAtOnce = (room: Pick<RoomInfo, "roster">, me: string): boolean => room.roster.every((r) => r.bot || r.id === me || r.ready)

/** A control's box on the screen, as `getBoundingClientRect` gives it. */
export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** A direction of the pad's d-pad. */
export type PadDirection = "up" | "down" | "left" | "right"

/**
 * Where the d-pad moves focus in a menu the pad drives (the Muster): the index of the control
 * nearest in that direction, the distance across it counting double so that a control in line is
 * chosen over a nearer one off to the side; -1 when there is none.
 */
export function nextFocus(from: Box, boxes: readonly Box[], dir: PadDirection): number {
  const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  const at = centre(from)
  const [along, sign] = dir === "up" ? (["y", -1] as const) : dir === "down" ? (["y", 1] as const) : dir === "left" ? (["x", -1] as const) : (["x", 1] as const)
  const across = along === "x" ? "y" : "x"
  let best = -1
  let bestScore = Infinity
  boxes.forEach((b, i) => {
    const c = centre(b)
    const ahead = (c[along] - at[along]) * sign
    if (b === from || ahead <= 1) return
    const score = ahead + 2 * Math.abs(c[across] - at[across])
    if (score < bestScore) {
      best = i
      bestScore = score
    }
  })
  return best
}

/** A host's bot button: one bot more or less, on a team, or on no team named in a mode with none. */
export interface BotButton {
  readonly delta: 1 | -1
  readonly team: Team | null
}

/** The host's bot buttons, in the Muster and in the match menu: a + and a − for each team, or one of each in a mode with no teams. */
export const botButtons = (room: Pick<RoomInfo, "mode">): readonly BotButton[] =>
  everyoneAlone(room)
    ? [
        { delta: 1, team: null },
        { delta: -1, team: null }
      ]
    : TEAMS.flatMap((team) => [
        { delta: 1, team },
        { delta: -1, team }
      ])

/**
 * What a bot button sends. With no team named, the room still seats each bot on a team: a bot is
 * added to the side with fewer members, and the last bot added is the one removed.
 */
export function botMessage(room: Pick<RoomInfo, "roster">, button: BotButton): ClientMessage {
  const count = (team: Team) => room.roster.filter((r) => r.team === team).length
  const team = button.team ?? (button.delta > 0 ? (count("benandanti") <= count("malandanti") ? "benandanti" : "malandanti") : (room.roster.findLast((r) => r.bot)?.team ?? "benandanti"))
  return { t: "bot", team, delta: button.delta }
}
