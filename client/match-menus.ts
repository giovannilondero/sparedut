/**
 * The in-match menus' steps, with no DOM: which menu Esc goes back to, and where focus lands
 * when one opens, and what the Muster shows. The game draws the menus; this decides the order
 * between them and their content.
 */
import type { Team } from "../shared/map.ts"
import type { Reach, RoomInfo } from "../shared/protocol.ts"
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
  readonly bot: boolean
  readonly host: boolean
}

/** The Muster's two teams, from the room's roster: who is in each, in the roster's order, with their primary. */
export function musterTeams(room: Pick<RoomInfo, "hostId" | "roster">): Record<Team, MusterMember[]> {
  const teams: Record<Team, MusterMember[]> = { benandanti: [], malandanti: [] }
  for (const r of room.roster) teams[r.team].push({ id: r.id, name: r.name, primary: r.primary, bot: r.bot, host: r.id === room.hostId })
  return teams
}

/**
 * The primary picker of the Muster and the match's armoury: free, on the player's own primary, or
 * locked on the host's choice under single weapon, when nothing picked there is sent or remembered.
 */
export type PrimaryPicker = { readonly _tag: "free"; readonly chosen: PrimaryId } | { readonly _tag: "locked"; readonly chosen: PrimaryId }

export const primaryPicker = (room: Pick<RoomInfo, "single">, own: PrimaryId): PrimaryPicker =>
  room.single ? { _tag: "locked", chosen: room.single } : { _tag: "free", chosen: own }

/**
 * The Muster's first focus: start, in an Offline room, whose one player is its host, so that one
 * press begins the match; elsewhere the screen's first control, so that a host's stray press
 * does not start a match others are still choosing for.
 */
export const musterFocus = (who: { readonly host: boolean; readonly reach: Reach }): string | null => (who.host && who.reach === "offline" ? "m-start" : null)
