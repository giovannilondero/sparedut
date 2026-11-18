/**
 * The training's match menu, with no DOM: the station list (which station the player is at, which
 * are completed, which can be chosen) and its markup. `Game.buildPause` draws it when the menu
 * opens; nothing here runs per frame.
 */
import type { TrainingView } from "../shared/sim/view.ts"
import { STATION_IDS, type StationId } from "../shared/training/index.ts"
import type { Strings } from "./i18n.ts"

/** A station in the list: where the player is, completed, unlocked but not completed, or not reachable yet. */
export const STATION_ENTRY_STATES = ["current", "done", "open", "locked"] as const
export type StationEntryState = (typeof STATION_ENTRY_STATES)[number]

export interface StationEntry {
  readonly station: StationId
  /** Its number, from 1. */
  readonly n: number
  readonly state: StationEntryState
}

/**
 * The stations as the list shows them. Stations unlock only by completing the one before, so
 * every unlocked station but the last is completed; a completed training has them all completed.
 */
export function stationEntries(view: TrainingView | null): readonly StationEntry[] {
  const unlocked = view === null ? 1 : view.tag === "complete" ? STATION_IDS.length : view.unlocked
  const current = view?.tag === "station" ? view.station : null
  const done = view?.tag === "complete" ? STATION_IDS.length : unlocked - 1
  return STATION_IDS.map((station, i) => ({
    station,
    n: i + 1,
    state: station === current ? "current" : i < done ? "done" : i < unlocked ? "open" : "locked"
  }))
}

/** What each state shows after the station's name. */
const MARK = { current: "▸", done: "✓", open: "", locked: "🔒" } as const satisfies Record<StationEntryState, string>

/** The list's markup: one button per station, `data-station` on those that can be chosen. */
export function stationListHtml(entries: readonly StationEntry[], s: Strings): string {
  const tr = s.training
  const items = entries.map(({ station, n, state }) => {
    const label = `${n}. ${tr.stations[station]}`
    const note = state === "current" ? tr.here : state === "locked" ? tr.locked : state === "done" ? tr.stationDone : ""
    const attrs = state === "locked" ? " disabled" : ` data-station="${station}"`
    return `<li><button class="station-entry is-${state}"${attrs}${state === "current" ? ' aria-current="step"' : ""}><span>${label}</span><span class="station-mark" aria-hidden="true">${MARK[state]}</span>${note ? `<span class="station-note">${note}</span>` : ""}</button></li>`
  })
  return `<h3>${tr.stationList}</h3><ol class="station-list" id="p-stations">${items.join("")}</ol>`
}
