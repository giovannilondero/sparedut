/**
 * The training's match menu, with no DOM: the station list (which station the player is at, which
 * are completed, which can be chosen) and its markup. `Game.buildPause` draws it when the menu
 * opens; nothing here runs per frame.
 */
import type { TrainingView } from "../shared/sim/view.ts"
import { STATION_IDS, type StationId } from "../shared/training/index.ts"
import type { Strings } from "./i18n.ts"
import type { TrainingProgress } from "./settings.ts"

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
 * every unlocked station but the last is completed; a training completed once has them all completed,
 * wherever the player is now.
 */
export function stationEntries(view: TrainingView | null): readonly StationEntry[] {
  const unlocked = view === null ? 1 : view.tag === "complete" ? STATION_IDS.length : view.unlocked
  const current = view?.tag === "station" ? view.station : null
  const done = view?.tag === "complete" || (view?.tag === "station" && view.completed) ? STATION_IDS.length : unlocked - 1
  return STATION_IDS.map((station, i) => ({
    station,
    n: i + 1,
    state: station === current ? "current" : i < done ? "done" : i < unlocked ? "open" : "locked"
  }))
}

/** What each state shows after the station's name, and what it says to a screen reader (none for an open one). */
const MARK = { current: "▸", done: "✓", open: "", locked: "🔒" } as const satisfies Record<StationEntryState, string>
const NOTE = {
  current: (tr: Strings["training"]) => tr.here,
  done: (tr: Strings["training"]) => tr.stationDone,
  open: () => "",
  locked: (tr: Strings["training"]) => tr.locked
} as const satisfies Record<StationEntryState, (tr: Strings["training"]) => string>

/**
 * Whether entering the training opens the station list first, before play: with saved progress
 * (a station completed) the player chooses; with none, station 1 starts at once.
 */
export const listOnEntry = (progress: TrainingProgress): boolean => progress.done > 0

/**
 * The list as it opens on entry: the station that continues (the first not completed, where the
 * simulation has put the trainee; none once the training was completed) and the one that takes
 * the focus, the one that continues or else the first.
 */
export function entryChoice(view: TrainingView | null): { readonly continues: StationId | null; readonly focus: StationId } {
  const completed = view?.tag === "complete" || (view?.tag === "station" && view.completed)
  const continues = completed ? null : (stationEntries(view).find((e) => e.state === "current" || e.state === "open")?.station ?? null)
  return { continues, focus: continues ?? STATION_IDS[0] }
}

/** The id of a station's button in the list, for the focus. */
export const stationButtonId = (station: StationId): string => `p-station-${station}`

/** The list's markup: one button per station, `data-station` on those that can be chosen; `continues`, the station that continues on entry (`entryChoice`). */
export function stationListHtml(entries: readonly StationEntry[], s: Strings, continues: StationId | null = null): string {
  const tr = s.training
  const items = entries.map(({ station, n, state }) => {
    const label = `${n}. ${tr.stations[station]}`
    const note = NOTE[state](tr)
    const attrs = state === "locked" ? " disabled" : ` data-station="${station}"`
    const go = station === continues ? `<span class="station-continue">${tr.continueHere}</span>` : ""
    const cls = `station-entry is-${state}${station === continues ? " continues" : ""}`
    return `<li><button id="${stationButtonId(station)}" class="${cls}"${attrs}${state === "current" ? ' aria-current="step"' : ""}><span>${label}</span>${go}<span class="station-mark" aria-hidden="true">${MARK[state]}</span>${note ? `<span class="station-note">${note}</span>` : ""}</button></li>`
  })
  return `<h3>${tr.stationList}</h3><ol class="station-list" id="p-stations">${items.join("")}</ol>`
}
