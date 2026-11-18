/** Station 10: walk up to the wounded teammate and hold the Cassele dal Miedi's beam on them until they are whole. */
import { BUTTON } from "../../shared/input.ts"
import { eyeHeight } from "../../shared/movement.ts"
import { SAGRE_STATIONS } from "../../shared/maps/sagre.ts"
import type { Drivers } from "./moves.ts"
import { alongTheStreet } from "./pickups.ts"

const WOUNDED = SAGRE_STATIONS.medic.wounded.at
/** Close enough to keep the beam (9 m) on them, and inside the medic's aura too. */
const BESIDE = 3

export const MEDIC: Drivers<"medic"> = {
  heal: (sight) => {
    const me = sight.you.body
    const away = Math.hypot(WOUNDED[0] - me.x, WOUNDED[2] - me.z)
    if (away > BESIDE) return { input: { ...alongTheStreet(me, WOUNDED), weapon: "miedi" } }
    // The teammate stands on their spot: aim at their chest.
    const rise = WOUNDED[1] + 1.1 - (me.y + eyeHeight(me))
    const yaw = Math.atan2(-(WOUNDED[0] - me.x), -(WOUNDED[2] - me.z))
    return { input: { weapon: "miedi", yaw, pitch: Math.atan2(rise, away), buttons: BUTTON.fire } }
  }
}
