/** Station 6: choose a primary other than the one in hand, as the armoury's list does. */
import type { PrimaryId } from "../../shared/weapons.ts"
import type { Drivers } from "./moves.ts"

/** How often the trainee chooses again while the step is still current (ticks). */
const EVERY = 30

export const ARMOURY: Drivers<"armoury"> = {
  choosePrimary: (sight) => {
    if (sight.ticks % EVERY !== 0) return {}
    const p: PrimaryId = sight.you.arsenal.primary === "doplete" ? "cramar" : "doplete"
    return { say: [{ t: "primary", p }] }
  }
}
