/**
 * The training's rules on dying and fighting. On dying: before the skirmish the trainee cannot die. A hit that would kill
 * leaves them with `SPARED_HP` instead, whatever dealt it, their own bomb or mine included. In the
 * skirmish they die as in any match. Applied where damage is applied (`ApplyDamage`); a regular
 * room, whose training is `Off`, never meets it.
 */
import { STATION_IDS, stepRule, stepsOf, type StationId, type StepId } from "./index.ts"
import type { FoeStance } from "./station.ts"

/** The first station at which the trainee can die: the skirmish, a fight for real. */
export const DEADLY_FROM = STATION_IDS.indexOf("skirmish")

/** The health a hit that would have killed a spared trainee leaves them with. */
export const SPARED_HP = 1

/** Whether the trainee is spared at station `station` (an index in `STATION_IDS`). */
export const spared = (station: number) => station < DEADLY_FROM

/** Whether kills score at station `station`, as in a Bataie di Gnot: only in the skirmish. */
export const killsScore = (station: number) => station === DEADLY_FROM

/** What the station's foes do while `step` of `station` is current (`StepRule.foes`). */
export const foeStance = (station: StationId, step: StepId): FoeStance => stepRule(station, step).foes ?? "fight"

/** Whether the foes stand down at step `step` of station `station` (indices, as the `Training` machine keeps them): their hits on the trainee do nothing. */
export const foesStandDown = (station: number, step: number): boolean => {
  const id = STATION_IDS[station]
  return foeStance(id, stepsOf(id)[step]) === "standDown"
}
