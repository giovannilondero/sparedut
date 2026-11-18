/** Station 7. Bombs and mines (ticket #45). No steps yet: a station without steps completes as soon as it is reached. */
import { station } from "../station.ts"

export const THROW_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {}
})
