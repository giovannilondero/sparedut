/**
 * The training's entry on the home screen, through the menu model over a browser's storage: the
 * request it makes, the completed mark, and the invitation shown on a first visit until it is
 * dismissed or the training is started. Each "visit" loads the settings again, as a new page does.
 */
import { afterEach, expect, test } from "bun:test"
import { MenuModel } from "../client/menu-model.ts"
import { FRESH_TRAINING, loadSettings, saveSettings, trainingProgressed, type Settings } from "../client/settings.ts"
import { STATION_IDS } from "../shared/training/index.ts"

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

/** A page opened: the settings loaded from storage, and the menu saving them as `main.ts` wires it. */
function visit() {
  const settings = loadSettings()
  const model = new MenuModel(settings, () => saveSettings(settings))
  return { model, settings }
}

/** What the game does with a training's events: progress kept with the settings and saved. */
function played(settings: Settings, ...events: Parameters<typeof trainingProgressed>[1][]) {
  for (const e of events) settings.training = trainingProgressed(settings.training, e)
  saveSettings(settings)
}

test("the entry asks for the training, starting where the saved progress says", () => {
  storage({ name: "Toni", training: { done: 4 } })
  expect(visit().model.training()).toEqual({ kind: "send", request: { t: "training", start: { unlocked: 5, from: "stalls" } } })
})

test("a first visit shows the invitation, and no completed mark", () => {
  storage(null)
  expect(visit().model.trainingEntry).toEqual({ invitation: "shown", completed: false })
})

test("a dismissed invitation is gone, and stays gone on the next visit", () => {
  storage({ name: "Toni" })
  const { model } = visit()
  model.dismissInvitation()
  expect(model.trainingEntry.invitation).toBe("hidden")
  expect(visit().model.trainingEntry.invitation).toBe("hidden")
  // The training is still there to start.
  expect(visit().model.training().kind).toBe("send")
})

test("starting the training once ends the invitation, even before a station is completed", () => {
  storage({ name: "Toni" })
  const { model } = visit()
  expect(model.training().kind).toBe("send")
  expect(model.trainingEntry.invitation).toBe("hidden")
  const next = visit()
  expect(next.settings.training).toEqual(FRESH_TRAINING)
  expect(next.model.trainingEntry.invitation).toBe("hidden")
})

test("dismissing after starting changes nothing that is saved", () => {
  storage({ name: "Toni" })
  const { model } = visit()
  model.training()
  const saved = store.get(KEY)
  model.dismissInvitation()
  expect(store.get(KEY)).toBe(saved)
})

test("starting without a name asks for the name first, and the invitation stays", () => {
  storage(null)
  const { model } = visit()
  model.go("vocabolari")
  expect(model.training()).toEqual({ kind: "refused", reason: "needName" })
  expect(model.screen).toBe("home")
  expect(model.trainingEntry.invitation).toBe("shown")
  expect(visit().model.trainingEntry.invitation).toBe("shown")
  // With a name, the same tap starts it.
  model.typeName("Toni")
  expect(model.training()).toEqual({ kind: "send", request: { t: "training", start: { unlocked: 1, from: "look" } } })
})

test("the completed mark shows only once the training has been completed", () => {
  storage({ name: "Toni" })
  const { model, settings } = visit()
  model.training()
  played(settings, ...STATION_IDS.slice(0, -1).map((station) => ({ t: "training", a: "station", station }) as const))
  expect(model.trainingEntry.completed).toBe(false)
  expect(visit().model.trainingEntry.completed).toBe(false)
  played(settings, { t: "training", a: "station", station: "skirmish" }, { t: "training", a: "complete" })
  // The menu shown again after the training reads the same settings the game saved into.
  expect(model.trainingEntry.completed).toBe(true)
  expect(visit().model.trainingEntry).toEqual({ invitation: "hidden", completed: true })
})

test("starting over clears the completed mark and keeps the invitation away", () => {
  storage({ name: "Toni", training: { done: STATION_IDS.length }, trainingInvitation: "dismissed" })
  const { settings } = visit()
  // What the match menu's "start over" does.
  settings.training = FRESH_TRAINING
  saveSettings(settings)
  expect(visit().model.trainingEntry).toEqual({ invitation: "hidden", completed: false })
  expect(visit().model.training()).toEqual({ kind: "send", request: { t: "training", start: { unlocked: 1, from: "look" } } })
})

test("a player who trained before the invitation existed is not invited", () => {
  storage({ name: "Toni", training: { done: 2 } })
  expect(visit().model.trainingEntry.invitation).toBe("hidden")
  storage({ name: "Toni", training: { done: STATION_IDS.length } })
  expect(visit().model.trainingEntry).toEqual({ invitation: "hidden", completed: true })
})

test("an invitation saved by a broken version falls back to what the progress says", () => {
  for (const trainingInvitation of [null, 3, "maybe", { dismissed: true }]) {
    storage({ trainingInvitation })
    expect(visit().model.trainingEntry.invitation).toBe("shown")
  }
})
