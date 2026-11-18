/**
 * The ways between stations: which of the fair's gates are closed follows from where the training
 * is, never from what happened before. Every gate from the current station's onward is closed, so
 * the way to the next station opens when the station completes, and a trainee who goes to any
 * station finds its way closed again until they complete it. A completed training, and a regular
 * room, close nothing. The host and the client's prediction both derive the gates from here: the
 * host from its simulation, the client from its snapshot's `TrainingView`.
 */
import type { TrainingView } from "../sim/view.ts"
import { STATION_IDS } from "./index.ts"

/** Gate `i` closes the way from station `i` to station `i + 1` (indices into `STATION_IDS`). */
export const gateClosed = (gate: number, station: number | null) => station !== null && gate >= station

/** Every gate of a map with `count` gates, closed (true) or open, with the trainee at `station` (null: none closed). */
export const closedGates = (count: number, station: number | null): boolean[] => {
  const closed: boolean[] = []
  for (let i = 0; i < count; i++) closed.push(gateClosed(i, station))
  return closed
}

/** The station whose way is closed, as a snapshot shows the training: null outside a training or once it is complete. */
export const viewedStation = (view: TrainingView | null): number | null => (view?.tag === "station" ? STATION_IDS.indexOf(view.station) : null)
