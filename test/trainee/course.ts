/** Station 2: jump the bar, crouch under the beam, sprint from the run-up past the line. */
import { BUTTON } from "../../shared/input.ts"
import type { V3 } from "../../shared/map.ts"
import { SAGRE_STATIONS } from "../../shared/maps/sagre.ts"
import { MOVE } from "../../shared/movement.ts"
import { walkTo, type Act, type Drivers, type Sight } from "./moves.ts"

const { bar, sprintFrom, sprintLine } = SAGRE_STATIONS[1]
/** Past the line, down the middle of the street. */
const BEYOND: V3 = [sprintLine + 4, 0, 0]

/** Walks at `at` with `buttons` held. */
const holding = (sight: Sight, at: V3, buttons: number): Act => {
  const act = walkTo(sight, at)
  return { input: { ...act.input, buttons } }
}

export const COURSE: Drivers<"course"> = {
  jumpBar: (sight) => {
    const x = sight.you.body.x
    return holding(sight, sprintFrom, x > bar.min[0] - 1.3 && x < bar.min[0] ? BUTTON.jump : 0)
  },
  crouchBeam: (sight) => holding(sight, sprintFrom, BUTTON.crouch),
  // Sprints east from the run-up; a trainee found past it and not already running walks back first.
  sprintToLine: (sight) => {
    const { x, vx } = sight.you.body
    if (x <= sprintFrom[0] + 1 || vx > MOVE.crouch + 1) return holding(sight, BEYOND, BUTTON.sprint)
    return walkTo(sight, [sprintFrom[0] - 1, 0, 0])
  }
}
