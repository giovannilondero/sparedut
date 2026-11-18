/** Station 2. Obstacle course: jump the bar, crouch under the beam, sprint to the line (ticket #41). No steps yet: a station without steps completes as soon as it is reached. */
import { station } from "../station.ts"

export const COURSE_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {}
})
