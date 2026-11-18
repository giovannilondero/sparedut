/** Station 7: a bomb thrown down the street at the bots standing there, then a mine planted where one walks. */
import { BUTTON } from "../../shared/input.ts"
import type { V3 } from "../../shared/map.ts"
import { SAGRE_STATIONS } from "../../shared/maps/sagre.ts"
import { SGNAPE_BOMB } from "../../shared/weapons.ts"
import { yawTo, type Drivers, type Sight } from "./moves.ts"
import { alongTheStreet } from "./pickups.ts"

const PLACE = SAGRE_STATIONS[6]
/** Where the trainee stands to plant: just west of the walker's crossing; looking down at it, the mine lands on it. */
const PLANT_FROM: V3 = [PLACE.mineAt[0] - 0.8, 0, PLACE.mineAt[2]]
const LOOK_DOWN = -1.2
/** Where the trainee waits for the walker, out of the mine's blast. */
const WAIT_AT: V3 = [PLACE.mineAt[0] - 6, 0, PLACE.mineAt[2]]
/** How close counts as standing on a point. */
const ON = 0.4

const near = (sight: Sight, at: V3, r: number) => Math.hypot(sight.you.body.x - at[0], sight.you.body.z - at[2]) < r

/** Whether one of the trainee's mines sits on the walker's crossing (only the trainee plants mines in a training). */
const planted = (sight: Sight) => sight.snap.proj.some(([kind, x, , z]) => kind === "mine" && Math.hypot(x - PLACE.mineAt[0], z - PLACE.mineAt[2]) < 1.5)

export const THROW: Drivers<"throw"> = {
  bomb: (sight) => {
    if (!near(sight, PLACE.bombAt, ON)) return { input: alongTheStreet(sight.you.body, PLACE.bombAt) }
    // Level with the street: the bomb lands among the targets and rolls into them.
    const throwNow = sight.ticks % (SGNAPE_BOMB.cooldownTicks + 5) === 0
    return { input: { yaw: yawTo(sight, PLACE.bombTargets[1]), pitch: 0, buttons: throwNow ? BUTTON.bomb : 0 } }
  },
  mine: (sight) => {
    if (planted(sight)) return near(sight, WAIT_AT, ON) ? { input: { pitch: 0 } } : { input: { ...alongTheStreet(sight.you.body, WAIT_AT), pitch: 0 } }
    if (!near(sight, PLANT_FROM, ON)) return { input: alongTheStreet(sight.you.body, PLANT_FROM) }
    return { input: { yaw: yawTo(sight, PLACE.mineAt), pitch: LOOK_DOWN, buttons: sight.ticks % 20 === 0 ? BUTTON.mine : 0 } }
  }
}
