/**
 * The training's progress as the browser keeps it, with the other settings: what is saved as
 * stations and the training complete, and where a new training starts.
 */
import { afterEach, expect, test } from "bun:test"
import { MenuModel } from "../client/menu-model.ts"
import { FRESH_TRAINING, loadSettings, saveSettings, trainingProgressed, trainingStart, type Settings } from "../client/settings.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { STATION_IDS, type StationId } from "../shared/training/index.ts"

const KEY = "sparedut.settings"
let store = new Map<string, string>()

/** A browser's storage, as the settings see it. */
function storage(saved: object | null) {
  store = new Map<string, string>(saved ? [[KEY, JSON.stringify(saved)]] : [])
  globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as Storage
}

afterEach(() => {
  // @ts-expect-error: the test runner has no storage of its own.
  delete globalThis.localStorage
})

const done = (station: StationId): GameEvent => ({ t: "training", a: "station", station })
const COMPLETE: GameEvent = { t: "training", a: "complete" }

/** The settings after the game records `events` and saves, as `Game` does; then loaded again, as the next visit does. */
function played(s: Settings, ...events: GameEvent[]) {
  for (const e of events) s.training = trainingProgressed(s.training, e)
  saveSettings(s)
  return loadSettings()
}

test("a first-time player starts the training at station 1, with only it unlocked", () => {
  storage(null)
  const s = loadSettings()
  expect(s.training).toEqual(FRESH_TRAINING)
  expect(trainingStart(s.training)).toEqual({ unlocked: 1, from: "look" })
})

test("a completed station is saved: after leaving, the training starts at the first station not completed", () => {
  storage({ name: "Toni" })
  const later = played(loadSettings(), done("look"), done("course"))
  expect(JSON.parse(store.get(KEY)!).training).toEqual({ done: 2 })
  expect(later.training).toEqual({ done: 2 })
  expect(trainingStart(later.training)).toEqual({ unlocked: 3, from: "always" })
  // The other settings are kept beside it.
  expect(later.name).toBe("Toni")
})

test("going back to an earlier station and completing it again unlocks nothing less", () => {
  storage({ training: { done: 5 } })
  const later = played(loadSettings(), done("course"))
  expect(trainingStart(later.training)).toEqual({ unlocked: 6, from: "armoury" })
})

test("a completed training is saved: every station unlocked, and a new training starts at station 1", () => {
  storage(null)
  const later = played(loadSettings(), done("skirmish"), COMPLETE)
  expect(later.training).toEqual({ done: STATION_IDS.length })
  expect(trainingStart(later.training)).toEqual({ unlocked: STATION_IDS.length, from: "look" })
})

test("a step completed is not progress worth saving: only a whole station is", () => {
  storage(null)
  const later = played(loadSettings(), { t: "training", a: "step", station: "look", step: "lookAround" })
  expect(later.training).toEqual(FRESH_TRAINING)
})

test("starting over clears the saved progress, the completion too", () => {
  storage({ training: { done: STATION_IDS.length } })
  const s = loadSettings()
  s.training = FRESH_TRAINING
  saveSettings(s)
  expect(loadSettings().training).toEqual({ done: 0 })
  expect(trainingStart(loadSettings().training)).toEqual({ unlocked: 1, from: "look" })
})

test("progress saved by an old or broken version falls back to a first training", () => {
  // The older shape (`unlocked`, `completed`) included: nothing was released with it.
  for (const training of [null, 5, { done: -1 }, { done: 13 }, { done: 2.5 }, { done: "3" }, { unlocked: 4, completed: false }, { unlocked: 12, completed: true }]) {
    storage({ training })
    expect(loadSettings().training).toEqual(FRESH_TRAINING)
  }
})

test("the home screen's training request carries where to start", () => {
  storage({ name: "Toni", training: { done: 3 } })
  const model = new MenuModel(loadSettings(), () => {})
  expect(model.training()).toEqual({ kind: "send", request: { t: "training", start: { unlocked: 4, from: "switch" } } })
})
