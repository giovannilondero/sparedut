import { afterEach, expect, test } from "bun:test"
import { loadSettings, oneTapRoom } from "../client/settings.ts"

/** A browser's storage, as the settings see it. */
function storage(saved: object | null) {
  const store = new Map<string, string>(saved ? [["sparedut.settings", JSON.stringify(saved)]] : [])
  globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null } as Storage
}

afterEach(() => {
  // @ts-expect-error: the test runner has no storage of its own.
  delete globalThis.localStorage
})

test("the home screen's button makes an Offline room with what the player chose last, friendly fire off", () => {
  storage({ name: "Toni", lastMode: "frico", lastMap: "trincee", lastMinutes: 20, lastBots: 6, lastLevel: "plevan" })
  expect(oneTapRoom(loadSettings())).toEqual({ mode: "frico", map: "trincee", minutes: 20, reach: "offline", bots: 6, level: "plevan", ff: false, single: null })
})

test("a first-time player gets an Offline room with the defaults", () => {
  storage(null)
  expect(oneTapRoom(loadSettings())).toEqual({ mode: "bataie", map: "glemone", minutes: 10, reach: "offline", bots: 4, level: "pari", ff: false, single: null })
})

test("a player who last made a room without bots still gets bots to play against", () => {
  storage({ lastBots: 0 })
  expect(oneTapRoom(loadSettings()).bots).toBe(4)
})

test("the Offline room has no access: nobody else can come in", () => {
  storage(null)
  const room = oneTapRoom(loadSettings())
  expect("access" in room).toBe(false)
})

test("a saved mode or map a room cannot choose (the training's) falls back to the defaults", () => {
  storage({ lastMode: "dutrine", lastMap: "sagre" })
  expect(oneTapRoom(loadSettings())).toMatchObject({ mode: "bataie", map: "glemone" })
})
