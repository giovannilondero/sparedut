/** Station 5. The stalls: one step per primary (ticket #44). No steps yet: a station without steps completes as soon as it is reached. */
import { station } from "../station.ts"

export const STALLS_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {}
})
