/** Station 10. The medic: heal the wounded teammate (ticket #47). No steps yet: a station without steps completes as soon as it is reached. */
import { station } from "../station.ts"

export const MEDIC_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {}
})
