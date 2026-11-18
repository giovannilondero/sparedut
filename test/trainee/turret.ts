/** Station 9: mount the turret, fire until it overheats, dismount; pick up the Lanciafrico and fire it. */
import { BUTTON } from "../../shared/input.ts"
import { turretRestSeat } from "../../shared/map.ts"
import { SAGRE, SAGRE_STATIONS } from "../../shared/maps/sagre.ts"
import type { Driver, Drivers } from "./moves.ts"
import { alongTheStreet } from "./pickups.ts"

const PLACE = SAGRE_STATIONS.turret
const TURRET = SAGRE.turrets[PLACE.turret]
const SEAT = turretRestSeat(TURRET)
const LANCIAFRICO = SAGRE.pickups[PLACE.lanciafrico].at
/** How close to the seat the trainee stops to mount (the turret's reach is wider). */
const AT_SEAT = 0.5

/** Presses "use" on every other tick, so that each press is a new one, facing the way the gun points. */
const tapUse: Driver = (sight) => ({ input: { yaw: TURRET.yaw, buttons: sight.ticks % 2 === 0 ? BUTTON.use : 0 } })

export const TURRET_DRIVERS: Drivers<"turret"> = {
  mount: (sight) => {
    const b = sight.you.body
    return Math.hypot(b.x - SEAT[0], b.z - SEAT[2]) > AT_SEAT ? { input: alongTheStreet(b, SEAT) } : tapUse(sight)
  },
  overheat: (sight) => (sight.snap.turrets[PLACE.turret].gunner === null ? tapUse(sight) : { input: { yaw: TURRET.yaw, buttons: BUTTON.fire } }),
  dismount: tapUse,
  pickLanciafrico: (sight) => ({ input: alongTheStreet(sight.you.body, LANCIAFRICO) }),
  fireLanciafrico: (sight) => ({ input: { yaw: TURRET.yaw, weapon: "lanciafrico", buttons: sight.ticks % 2 === 0 ? BUTTON.fire : 0 } })
}
export { TURRET_DRIVERS as TURRET }
