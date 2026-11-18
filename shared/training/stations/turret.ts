/** Station 9. The turret and the Lanciafrico (ticket #46). No steps yet: a station without steps completes as soon as it is reached. */
import { station } from "../station.ts"

export const TURRET_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {}
})
