/** Station 8: walk over each pickup in turn. */
import { BUTTON, type PlayerInput } from "../../shared/input.ts"
import type { V3 } from "../../shared/map.ts"
import { SAGRE, SAGRE_STATIONS } from "../../shared/maps/sagre.ts"
import type { Body } from "../../shared/movement.ts"
import type { Drivers } from "./moves.ts"

const { bar: BAR, beam: BEAM } = SAGRE_STATIONS.course

/**
 * Sprints along the street straight at a point, jumping the obstacle course's bar and crouching
 * under its beam on the way: the trainee may reach a station from anywhere west of it.
 */
export const alongTheStreet = (body: Body, to: V3): Partial<PlayerInput> => {
  const yaw = Math.atan2(-(to[0] - body.x), -(to[2] - body.z))
  const eastward = to[0] > body.x
  if (eastward && body.x > BEAM.min[0] - 1.5 && body.x < BEAM.max[0] + 0.6) return { mz: 1, yaw, buttons: BUTTON.crouch }
  const jump = eastward && body.x > BAR.min[0] - 1.6 && body.x < BAR.min[0] ? BUTTON.jump : 0
  return { mz: 1, yaw, buttons: BUTTON.sprint | jump }
}

const PICKUPS = SAGRE_STATIONS.pickups.pickups

export const PICKUPS_DRIVERS: Drivers<"pickups"> = {
  frico: (sight) => ({ input: alongTheStreet(sight.you.body, SAGRE.pickups[PICKUPS.frico].at) }),
  gubane: (sight) => ({ input: alongTheStreet(sight.you.body, SAGRE.pickups[PICKUPS.gubane].at) }),
  sgnape: (sight) => ({ input: alongTheStreet(sight.you.body, SAGRE.pickups[PICKUPS.sgnape].at) }),
  munizions: (sight) => ({ input: alongTheStreet(sight.you.body, SAGRE.pickups[PICKUPS.munizions].at) })
}
export { PICKUPS_DRIVERS as PICKUPS }
