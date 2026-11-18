/** Station 8. Pickups: frico, gubane, sgnape, munizions (ticket #46). No steps yet: a station without steps completes as soon as it is reached. */
import { station } from "../station.ts"

export const PICKUPS_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {}
})
