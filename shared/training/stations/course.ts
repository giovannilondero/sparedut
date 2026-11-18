/**
 * Station 2, the obstacle course: jump the bar, crouch under the beam, sprint to the line.
 * The bar and the beam span the whole street, so being past one is having jumped it or crouched
 * under it (`test/map-sagre.test.ts` proves the physics); the sprint must be one run, unbroken,
 * from the run-up across the line.
 */
import { SAGRE_STATIONS } from "../../maps/sagre.ts"
import { sprinting } from "../../movement.ts"
import { entering, station, type StepRule } from "../station.ts"

const PLACE = SAGRE_STATIONS[1]

/** How far before the line an unbroken sprint must have begun (metres); the run-up is 9 m before it. */
export const SPRINT_RUN = 6

/**
 * Sprinting to the line: `mark` is where the sprint under way began (where the trainee stands
 * while not sprinting). Done on the tick a sprinting trainee is past the line, having begun the
 * sprint at least `SPRINT_RUN` metres before it.
 */
const sprintToLine: StepRule = {
  control: "sprint",
  target: 1,
  begin: (seen) => ({ count: 0, mark: seen.me.body.x }),
  advance: (seen, now) => {
    const { body } = seen.me
    if (!sprinting(seen.me.controls.input, body.crouch)) return { count: 0, mark: body.x }
    return { count: body.x > PLACE.sprintLine && now.mark <= PLACE.sprintLine - SPRINT_RUN ? 1 : 0, mark: now.mark }
  }
}

export const COURSE_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {
    jumpBar: entering("jump", (seen) => seen.me.body.x > PLACE.bar.max[0]),
    crouchBeam: entering("crouch", (seen) => seen.me.body.x > PLACE.beam.max[0]),
    sprintToLine
  }
})
