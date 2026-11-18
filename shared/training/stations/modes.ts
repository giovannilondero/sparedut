/** Station 11. The modes: frico, plaçute, cjar, storm (tickets #48, #49). No steps yet: a station without steps completes as soon as it is reached. */
import { station } from "../station.ts"

export const MODES_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {}
})
