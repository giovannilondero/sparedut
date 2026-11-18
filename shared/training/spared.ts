/**
 * The training's rule on dying: before the skirmish the trainee cannot die. A hit that would kill
 * leaves them with `SPARED_HP` instead, whatever dealt it, their own bomb or mine included. In the
 * skirmish they die as in any match. Applied where damage is applied (`ApplyDamage`); a regular
 * room, whose training is `Off`, never meets it.
 */
import { STATION_IDS } from "./index.ts"

/** The first station at which the trainee can die: the skirmish, a fight for real. */
export const DEADLY_FROM = STATION_IDS.indexOf("skirmish")

/** The health a hit that would have killed a spared trainee leaves them with. */
export const SPARED_HP = 1

/** Whether the trainee is spared at station `station` (an index in `STATION_IDS`). */
export const spared = (station: number) => station < DEADLY_FROM
