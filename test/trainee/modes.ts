/** Station 11: fetch the enemy frico and bring it home, stand in the plaçute, push the cjar, stay inside the storm. */
import { SAGRE } from "../../shared/maps/sagre.ts"
import type { V3 } from "../../shared/map.ts"
import type { Drivers } from "./moves.ts"
import { walkTo } from "./moves.ts"

const { flagBases: BASES, hill: HILL, track: TRACK } = SAGRE

/** How far behind the cjar the trainee walks while pushing it: well within its reach. */
const PUSH_BEHIND = 1.5

export const MODES: Drivers<"modes"> = {
  frico: (sight) => {
    // No one else is at the station: if the enemy frico is carried, the trainee carries it.
    const carrying = sight.snap.flags.malandanti._tag === "carried"
    return walkTo(sight, carrying ? BASES.benandanti : BASES.malandanti)
  },
  placute: (sight) => {
    const b = sight.you.body
    return Math.hypot(b.x - HILL.at[0], b.z - HILL.at[2]) < HILL.radius / 2 ? {} : walkTo(sight, HILL.at)
  },
  cjar: (sight) => {
    // Keep a step behind the cjar, which only moves with a Benandante beside it.
    const at = sight.snap.cart?.at ?? TRACK[TRACK.length - 1]
    const behind: V3 = [at[0] - PUSH_BEHIND, 0, at[2]]
    const b = sight.you.body
    return Math.hypot(b.x - behind[0], b.z - behind[2]) < 0.5 ? {} : walkTo(sight, behind)
  },
  // The storm closes on the plaçute's centre: wait there.
  storm: (sight) => {
    const b = sight.you.body
    return Math.hypot(b.x - HILL.at[0], b.z - HILL.at[2]) < HILL.radius / 2 ? {} : walkTo(sight, HILL.at)
  }
}
