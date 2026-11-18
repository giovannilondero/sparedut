/** Station 6. The armoury: open it and choose a primary (ticket #43). No steps yet: a station without steps completes as soon as it is reached. */
import { station } from "../station.ts"

export const ARMOURY_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {}
})
