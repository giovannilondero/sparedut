/** Station 11: fetch the enemy frico and bring it home, then stand in the plaçute. */
import { SAGRE } from "../../shared/maps/sagre.ts"
import type { Drivers } from "./moves.ts"
import { walkTo } from "./moves.ts"

const { flagBases: BASES, hill: HILL } = SAGRE

export const MODES: Drivers<"modes"> = {
  frico: (sight) => {
    // No one else is at the station: if the enemy frico is carried, the trainee carries it.
    const carrying = sight.snap.flags.malandanti._tag === "carried"
    return walkTo(sight, carrying ? BASES.benandanti : BASES.malandanti)
  },
  placute: (sight) => {
    const b = sight.you.body
    return Math.hypot(b.x - HILL.at[0], b.z - HILL.at[2]) < HILL.radius / 2 ? {} : walkTo(sight, HILL.at)
  }
}
