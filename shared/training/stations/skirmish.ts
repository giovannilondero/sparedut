/** Station 12. The skirmish, the scoreboard and a quick phrase (ticket #50). No steps yet: a station without steps completes as soon as it is reached. */
import { station } from "../station.ts"

export const SKIRMISH_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {}
})
