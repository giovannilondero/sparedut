/** Station 3. Always with you: the Mandi and the mescul (ticket #42). No steps yet: a station without steps completes as soon as it is reached. */
import { station } from "../station.ts"

export const ALWAYS_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {}
})
