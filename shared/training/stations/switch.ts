/** Station 4. Changing weapon: by slot, previous, cycling (ticket #43). No steps yet: a station without steps completes as soon as it is reached. */
import { station } from "../station.ts"

export const SWITCH_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {}
})
