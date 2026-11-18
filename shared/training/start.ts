/**
 * Where a training begins. The browser keeps the player's progress (how many stations are
 * unlocked) and sends it with the training request, with the station to start at; the simulation
 * trusts it, because the room is Offline and the player's own.
 */
import { STATION_IDS, type StationId } from "./index.ts"

export interface TrainingStart {
  /** How many stations, from the first, the player may go to: 1 to all of them. */
  readonly unlocked: number
  /** The station to start at; one beyond the unlocked ones starts at the last unlocked one. */
  readonly from: StationId
}

/** A first training: station 1, nothing else unlocked. */
export const FIRST_START: TrainingStart = { unlocked: 1, from: STATION_IDS[0] }

/** The simulation's first arrival for a start: station indices, as the `Training` machine keeps them. */
export function arrival(start: TrainingStart): { readonly station: number; readonly unlocked: number } {
  const unlocked = Math.max(1, Math.min(STATION_IDS.length, Math.floor(start.unlocked)))
  return { station: Math.min(STATION_IDS.indexOf(start.from), unlocked - 1), unlocked }
}
