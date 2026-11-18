/** Station 1, look and move: turn the view, then walk to the marker beside the first stall. */
import { Ops } from "@typeonce/ritmo"
import { SAGRE_STATIONS } from "../../maps/sagre.ts"
import { entering, near, station } from "../station.ts"

/** How far the view must turn from where it faced when the step began (radians, either way). */
export const LOOK_AROUND_TURN = Math.PI / 2
/** How close to the marker counts as reaching it (metres). */
export const MARKER_RADIUS = 1.5

const PLACE = SAGRE_STATIONS[0]

/** The angle between two yaws, from 0 to π. */
const turned = (from: number, to: number) => {
  const d = to - from
  return Math.abs(Ops.atan2(Ops.sin(d), Ops.cos(d)))
}

export const LOOK_STATION = station({
  setup: { objective: "none", bots: [] },
  steps: {
    lookAround: {
      control: "look",
      target: 1,
      begin: (seen) => ({ count: 0, mark: seen.me.yaw }),
      advance: (seen, now) => ({ count: turned(now.mark, seen.me.yaw) >= LOOK_AROUND_TURN ? 1 : 0, mark: now.mark })
    },
    walkToMarker: entering("move", (seen) => near(seen, PLACE.marker, MARKER_RADIUS))
  }
})
