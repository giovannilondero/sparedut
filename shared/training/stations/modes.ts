/**
 * Station 11, the modes: each step puts one objective in force (`StepRule.given`) and completes
 * when that objective scores, by the objective's own rules (`PlayObjectives`). Nothing is in force
 * on arrival but the first step's objective; a step without `given` keeps the one before it.
 *
 * #48 owns the frico and the plaçute; #49 adds the cjar and the storm after them, as two more
 * steps of the same shape (`given: { objective: "cjar" }`, then `"storm"`).
 */
import type { ObjectiveId } from "../../folklore.ts"
import { once, station, type Seen, type StepRule } from "../station.ts"

/** Points the plaçute must score while the trainee holds it: one a second (`PlayObjectives`). */
export const PLACUTE_POINTS = 5

/** The trainee brought the enemy frico home this tick. */
const broughtHome = (seen: Seen) => seen.events.some((e) => e.t === "flag" && e.a === "captured" && e.s === seen.me.session)

/** Counts the Benandanti's points since the step began: `mark` is their score then. */
const scoring = (target: number, objective: ObjectiveId): StepRule => ({
  control: "move",
  target,
  given: { objective },
  begin: (seen) => ({ count: 0, mark: seen.score.benandanti }),
  advance: (seen, now) => ({ count: seen.score.benandanti - now.mark, mark: now.mark })
})

export const MODES_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {
    /** Take the enemy frico at its base and bring it home, to the Benandanti's own. */
    frico: { ...once("move", broughtHome), given: { objective: "frico" } },
    /** Stand in the plaçute until it has scored `PLACUTE_POINTS`. */
    placute: scoring(PLACUTE_POINTS, "placute")
  }
})
