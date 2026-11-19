/**
 * The balance rule for a team switch while a match is on, the same for the room that applies it
 * and for the screen that offers it: one fact, read from the room's members or from its roster.
 */
import type { Team } from "./map.ts"

/** What a switch while a match is on does: taken, taken with a bot of the other team moving the other way, or refused. */
export type TeamSwitch = { readonly tag: "taken" } | { readonly tag: "swap"; readonly bot: string } | { readonly tag: "refused" }

/**
 * A switch from `from` to `to` among `members` (everybody in the room, entered or not). The teams
 * must not become unbalanced: onto a team that is not smaller, one of its bots swaps, and with no
 * bot there the switch is refused.
 */
export function teamSwitch(members: readonly { readonly id: string; readonly team: Team; readonly bot: boolean }[], from: Team, to: Team): TeamSwitch {
  const count = (team: Team) => members.filter((m) => m.team === team).length
  if (count(to) < count(from)) return { tag: "taken" }
  const bot = members.find((m) => m.bot && m.team === to)
  return bot ? { tag: "swap", bot: bot.id } : { tag: "refused" }
}
