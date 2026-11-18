/** Station 1: look around, then walk to the marker. */
import { SAGRE_STATIONS } from "../../shared/maps/sagre.ts"
import { turn, walkTo, type Drivers } from "./moves.ts"

export const LOOK: Drivers<"look"> = {
  lookAround: (sight) => turn(sight, 0.05),
  walkToMarker: (sight) => walkTo(sight, SAGRE_STATIONS[0].marker)
}
