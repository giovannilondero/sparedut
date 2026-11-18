/**
 * Interface steps: what a player does that the simulation cannot see, so the client reports it.
 * The simulation sees that the weapon in hand changed, not whether the player chose it by its
 * slot, as the previous weapon or by cycling; it never sees the scoreboard, the quick phrases or a
 * chat message typed.
 *
 * The report is an intent (`{ t: "report", a }` in the protocol, `ReportInterface` in the
 * simulation). Only a training accepts it, and only for its current step: a step declares the
 * action whose report it accepts in `StepRule.report`, and sees how many arrived this tick in
 * `Seen.reported`. A report of any other action is ignored.
 */
import type { ControlId } from "./station.ts"

/** The actions a client may report: a closed set, each the control its step teaches. */
export const INTERFACE_ACTIONS = ["slot", "lastWeapon", "cycle", "board", "phrases", "chat"] as const satisfies readonly ControlId[]
export type InterfaceAction = (typeof INTERFACE_ACTIONS)[number]
