/**
 * The in-match menus' steps, with no DOM: which menu Esc goes back to, and where focus lands
 * when one opens, and what the Muster shows. The game draws the menus; this decides the order
 * between them and their content.
 */
import type { Team } from "../shared/map.ts"
import type { Reach, RoomInfo } from "../shared/protocol.ts"
import { TICK_RATE } from "../shared/movement.ts"
import type { PhaseView } from "../shared/sim/view.ts"
import type { PrimaryId } from "../shared/weapons.ts"

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

/** The Muster's two teams, from the room's roster: who is in each, in the roster's order, with their primary. */
export function musterTeams(room: Pick<RoomInfo, "hostId" | "roster">): Record<Team, MusterMember[]> {
  const teams: Record<Team, MusterMember[]> = { benandanti: [], malandanti: [] }
  for (const r of room.roster) teams[r.team].push({ id: r.id, name: r.name, primary: r.primary, ready: r.ready, bot: r.bot, host: r.id === room.hostId })
  return teams
}

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
  if (phase === "Live" && room.roster.find((r) => r.id === me)?.onMap === false) return { tag: "joining", nextMatch: room.mode === "tampieste" }
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
