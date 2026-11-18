/**
 * The end of station 12 as the owner plays it (follow-up to spec #37), driven by protocol messages
 * to the in-browser host: the skirmish won, then the scoreboard, a quick phrase and a chat message,
 * the foes standing down once it is won, and the progress the browser saves from it.
 */
import { afterEach, beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { MenuModel } from "../client/menu-model.ts"
import { loadSettings, saveSettings, trainingProgressed, trainingStart } from "../client/settings.ts"
import { stationEntries } from "../client/training-menu.ts"
import { initPhysics } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { STATION_IDS, type StationId } from "../shared/training/index.ts"
import type { TrainingStart } from "../shared/training/start.ts"
import { harness } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"
import { steps } from "./training-station.ts"

beforeAll(() => initPhysics())

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

/** A training on the in-browser host, as the browser asks for it, played by the automatic player. */
function training(start: Omit<TrainingStart, "completed"> & { readonly completed?: boolean }) {
  const h = harness(createBrowserHost)
  const me = h.connect()
  me.say({ t: "training", primary: "cramar", ...start })
  for (let i = 0; i < 120 && !me.last("snap")?.you?.alive; i++) h.play(1)
  const you = me.last("joined")!.you
  const auto = new Trainee(you)
  const snap = () => me.last("snap")!
  /** Plays the automatic player for at most `ticks` ticks, until `done` holds for the events so far. */
  const autoplay = (ticks: number, done: (events: GameEvent[]) => boolean) => {
    const events: GameEvent[] = []
    for (let i = 0; i < ticks && !done(events); i++) {
      for (const msg of auto.think(snap())) me.say(msg)
      const before = me.got.length
      h.play(1)
      for (const m of me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
    }
    return events
  }
  /** Plays until `step` of station 12 is current. */
  const until = (step: string) =>
    autoplay(60 * 180, () => {
      const now = snap().training
      return now?.tag === "station" && now.step === step
    })
  /** Stands still for `ticks` ticks (the automatic player's inputs, so they stay in sequence); returns the events. */
  const stand = (ticks: number) => {
    const events: GameEvent[] = []
    for (let i = 0; i < ticks; i++) {
      const msgs = auto.think(snap())
      const input = msgs.at(-1) as { t: "input"; i: object }
      me.say({ t: "input", i: { ...input.i, mz: 0, mx: 0, buttons: 0, jump: false } })
      const before = me.got.length
      h.play(1)
      for (const m of me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
    }
    return events
  }
  return { ...h, me, you, snap, autoplay, until, stand }
}

const ALL = STATION_IDS.length
const completed = (events: GameEvent[]) => events.some((e) => e.t === "training" && e.a === "complete")

describe("station 12 to the end of the training", () => {
  test("won, the scoreboard, a quick phrase and a chat message: station 12 and the training are completed, and saved so", () => {
    // Eleven stations done before, as the owner's browser had them.
    storage({ name: "Toni", training: { done: ALL - 1 } })
    const settings = loadSettings()
    const t = training(trainingStart(settings.training))
    expect(t.snap().training).toMatchObject({ tag: "station", station: "skirmish", step: "win" })
    const events = t.autoplay(60 * 240, completed)
    expect(steps(events)).toEqual(["win", "board", "phrases", "chat"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "skirmish" })
    expect(t.snap().training).toEqual({ tag: "complete" })

    // The browser saves it as `Game` does, and the next visit reads it.
    for (const e of events) settings.training = trainingProgressed(settings.training, e)
    saveSettings(settings)
    const later = loadSettings()
    expect(later.training).toEqual({ done: ALL })
    // The home entry shows its completed mark.
    expect(new MenuModel(later, () => saveSettings(later)).trainingEntry.completed).toBe(true)

    // Entering again: the station list shows every station completed, station 12 too.
    const again = training(trainingStart(later.training))
    const list = stationEntries(again.snap().training)
    expect(list.filter((e) => e.state !== "current").map((e) => e.state)).toEqual(Array(ALL - 1).fill("done"))
    expect(list.find((e) => e.station === "skirmish")!.state).toBe("done")
    // Gone to station 12 from the list, it is still marked completed elsewhere: station 1 too.
    again.me.say({ t: "goTo", station: "skirmish" })
    again.stand(6)
    expect(stationEntries(again.snap().training).filter((e) => e.state !== "current").map((e) => e.state)).toEqual(Array(ALL - 1).fill("done"))
  })

  test("completed, then station 5 from the list, a restart, and leaving and entering again: every station stays marked done, saved progress never drops", () => {
    storage({ name: "Toni", training: { done: ALL - 1 } })
    const settings = loadSettings()
    const t = training(trainingStart(settings.training))
    /** What `Game` does with each event: progress kept with the settings and saved. */
    const save = (events: GameEvent[]) => {
      for (const e of events) settings.training = trainingProgressed(settings.training, e)
      saveSettings(settings)
    }
    save(t.autoplay(60 * 240, completed))
    expect(t.snap().training).toEqual({ tag: "complete" })
    /** The list as the match menu draws it now: the current station marked, every other one done. */
    const allDone = (current: StationId) => {
      const list = stationEntries(t.snap().training)
      expect(list.find((e) => e.state === "current")?.station).toBe(current)
      expect(list.filter((e) => e.state !== "current").map((e) => e.state)).toEqual(Array(ALL - 1).fill("done"))
      expect(loadSettings().training).toEqual({ done: ALL })
      expect(new MenuModel(loadSettings(), () => {}).trainingEntry.completed).toBe(true)
    }
    // Station 5 from the list.
    t.me.say({ t: "goTo", station: STATION_IDS[4] })
    save(t.stand(6))
    allDone(STATION_IDS[4])
    // "Restart this station".
    t.me.say({ t: "goTo", station: STATION_IDS[4] })
    save(t.stand(6))
    allDone(STATION_IDS[4])
    // Station 5 played to its end: the next one is current, still all done.
    save(t.autoplay(60 * 120, (events) => events.some((e) => e.t === "training" && e.a === "station")))
    allDone(STATION_IDS[5])
    // Leaving and entering again, from the saved progress.
    const again = training(trainingStart(loadSettings().training))
    const list = stationEntries(again.snap().training)
    expect(list.filter((e) => e.state !== "current").map((e) => e.state)).toEqual(Array(ALL - 1).fill("done"))
  })

  test("an interface action reported before its step is current does not make the step impossible later", () => {
    const t = training({ unlocked: ALL, from: "skirmish" })
    // During the fight: the scoreboard, a quick phrase and a chat message, all too early.
    for (const a of ["board", "phrases", "chat"] as const) t.me.say({ t: "report", a })
    t.stand(5)
    expect(t.snap().training).toMatchObject({ step: "win", count: 0 })
    // Then the automatic player wins and does each again when it is current.
    expect(steps(t.autoplay(60 * 240, completed))).toEqual(["win", "board", "phrases", "chat"])
  })
})

describe("after the win, the foes stand down", () => {
  /** Hits on the trainee among `events`. */
  const hitsOn = (you: string, events: GameEvent[]) => events.filter((e) => e.t === "hit" && e.v === you)

  test("before the win they hit a trainee who stands still; after it, for the rest of the station, never", () => {
    const before = training({ unlocked: ALL, from: "skirmish" })
    expect(hitsOn(before.you, before.stand(60 * 20)).length).toBeGreaterThan(0)

    const after = training({ unlocked: ALL, from: "skirmish" })
    after.until("board")
    // Twenty seconds standing still where the fight ended: nobody shoots them.
    const calm = after.stand(60 * 20)
    expect(hitsOn(after.you, calm)).toEqual([])
    expect(calm.some((e) => e.t === "shot" && e.s !== after.you)).toBe(false)
    expect(after.snap().you!.alive).toBe(true)
  })

  test("restarting the station makes them fight again until the win", () => {
    const t = training({ unlocked: ALL, from: "skirmish" })
    t.until("board")
    t.me.say({ t: "goTo", station: "skirmish" satisfies StationId })
    const events = t.stand(60 * 20)
    expect(t.snap().training).toMatchObject({ station: "skirmish", step: "win" })
    expect(hitsOn(t.you, events).length).toBeGreaterThan(0)
  })
})

describe("the chat step", () => {
  test("a typed message completes it; a quick phrase does not, and a typed message is no quick phrase", () => {
    const t = training({ unlocked: ALL, from: "skirmish" })
    t.until("phrases")
    // A typed message is not the quick phrase the step asks for.
    t.me.say({ t: "report", a: "chat" })
    expect(steps(t.stand(5))).toEqual([])
    t.me.say({ t: "report", a: "phrases" })
    expect(steps(t.stand(5))).toEqual(["phrases"])
    expect(t.snap().training).toMatchObject({ step: "chat", count: 0 })
    // A quick phrase is not a chat message.
    t.me.say({ t: "report", a: "phrases" })
    expect(steps(t.stand(5))).toEqual([])
    t.me.say({ t: "report", a: "chat" })
    const events = t.stand(5)
    expect(steps(events)).toEqual(["chat"])
    expect(completed(events)).toBe(true)
  })

  test("on a controller and on touch, which cannot type, it completes itself when the client says so; on a keyboard it does not", () => {
    const t = training({ unlocked: ALL, from: "skirmish" })
    t.until("chat")
    t.me.say({ t: "unavailable", station: "skirmish", step: "chat", device: "keyboard" })
    expect(steps(t.stand(5))).toEqual([])
    t.me.say({ t: "unavailable", station: "skirmish", step: "chat", device: "pad" })
    expect(steps(t.stand(5))).toEqual(["chat"])
    const u = training({ unlocked: ALL, from: "skirmish" })
    u.until("chat")
    u.me.say({ t: "unavailable", station: "skirmish", step: "chat", device: "touch" })
    expect(steps(u.stand(5))).toEqual(["chat"])
  })
})
