/**
 * Station 11, the modes: each step puts one objective in force (`StepRule.given`) and completes
 * when that objective scores, by the objective's own rules (`PlayObjectives`). Nothing is in force
 * on arrival but the first step's objective; a step without `given` keeps the one before it.
 *
 * The storm has no match clock to close by, as a regular room's does: its step gives it a course
 * of its own (`STORM_CLOSING`), from the tick the step begins.
 */
import { SAGRE_STATIONS } from "../../maps/sagre.ts"
import { outsideStorm } from "../../sim/rules.ts"
import { once, pointsSince, station, type Seen, type StepRule, type StormClosing } from "../station.ts"

const PLACE = SAGRE_STATIONS.modes

/** Points the plaçute must score while the trainee holds it: one a second (`PlayObjectives`). */
export const PLACUTE_POINTS = 5

/** The trainee brought the enemy frico home this tick. */
const broughtHome = (seen: Seen) => seen.events.some((e) => e.t === "flag" && e.a === "captured" && e.s === seen.me.session)

/**
 * The storm closes on the square's centre: from a ring around the whole west half of the square
 * (its farthest corner is 34 m away) to one twice the plaçute's, in 15 s, then holds.
 */
export const STORM_CLOSING: StormClosing = { at: PLACE.storm, from: 36, to: 8, ticks: 15 * 60 }

/** Seconds the trainee must spend inside the storm: more than it takes to close, so it is seen closing. */
export const STORM_SECONDS = 20

/**
 * Counts the seconds the trainee is inside the storm: once a second from the step's start (`mark`),
 * if inside then. Seconds outside, where the storm hurts, do not count.
 */
const insideTheStorm: StepRule = {
  control: "move",
  target: STORM_SECONDS,
  given: { objective: "storm", storm: STORM_CLOSING },
  begin: (seen) => ({ count: 0, mark: seen.tick }),
  advance: (seen, now) => {
    const second = (seen.tick - now.mark) % 60 === 0 && seen.tick > now.mark
    const inside = seen.storm !== null && !outsideStorm(seen.storm, seen.me.body)
    return { count: now.count + (second && inside ? 1 : 0), mark: now.mark }
  }
}

/** The cjar reached the end of its track this tick: only a Benandante beside it pushes it (`PlayObjectives`). */
const arrived = (seen: Seen) => seen.events.some((e) => e.t === "cart" && e.a === "arrived")

export const MODES_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {
    /** Take the enemy frico at its base and bring it home, to the Benandanti's own. */
    frico: { ...once("move", broughtHome), given: { objective: "frico" } },
    /** Stand in the plaçute until it has scored `PLACUTE_POINTS`. */
    placute: { ...pointsSince("move", PLACUTE_POINTS), given: { objective: "placute" } },
    /** Push the cjar, from the start of its short track, to the end. */
    cjar: { ...once("move", arrived), given: { objective: "cjar" } },
    /** Stay inside the storm while it closes, `STORM_SECONDS` in all. */
    storm: insideTheStorm
  }
})
