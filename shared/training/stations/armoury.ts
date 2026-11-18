/**
 * Station 6, the armoury: open it and choose a primary. Choosing is an ordinary intent the
 * simulation sees (the primary changes at once); opening the armoury is how the player gets there.
 */
import { PRIMARIES } from "../../weapons.ts"
import { station } from "../station.ts"

export const ARMOURY_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {
    /** Done when the primary in the arsenal differs from the one the station gave: `mark` is its index in `PRIMARIES`. */
    choosePrimary: {
      control: "armoury",
      target: 1,
      begin: (seen) => ({ count: 0, mark: PRIMARIES.indexOf(seen.me.arsenal.primary) }),
      advance: (seen, now) => ({ count: PRIMARIES.indexOf(seen.me.arsenal.primary) === now.mark ? 0 : 1, mark: now.mark })
    }
  }
})
