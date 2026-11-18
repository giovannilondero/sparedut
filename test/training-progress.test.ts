/**
 * Moving around the training, driven by protocol messages to the in-browser host as the player's
 * client drives it: where a training starts, going to a station, restarting one, starting over,
 * and the pause of the match menu.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { Hub } from "../server/hub.ts"
import { IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import { initPhysics } from "../shared/physics.ts"
import { STATION_IDS, stepsOf, type StationId } from "../shared/training/index.ts"
import { harness } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"

beforeAll(() => initPhysics())

const ALL = STATION_IDS.length
const startOf = (station: StationId) => SAGRE_STATIONS[STATION_IDS.indexOf(station)].start

/** A training on the in-browser host, as the browser asks for it, played until the trainee is alive. */
function started(request: { unlocked?: number; from?: StationId } = {}) {
  const h = harness(createBrowserHost)
  const me = h.connect()
  me.say({ t: "training", primary: "cramar", ...request })
  for (let i = 0; i < 120 && !me.last("snap")?.you?.alive; i++) h.play(1)
  const snap = () => me.last("snap")!
  let seq = snap().you!.seq
  /** Sends one input per tick, as a client does. */
  const drive = (ticks: number, input: (tick: number) => Partial<PlayerInput>) => {
    for (let i = 0; i < ticks; i++) {
      me.say({ t: "input", i: { ...IDLE_INPUT, weapon: snap().you!.arsenal.current, ...input(i), seq: ++seq, view: snap().tick } })
      h.play(1)
    }
  }
  /** Lets a few ticks pass for an intent to arrive and a snapshot to tell it. */
  const settle = () => drive(6, () => ({}))
  return { ...h, me, snap, drive, settle }
}

/** Standing at a station's start: where going to it puts the player. */
const standsAtStart = (body: { x: number; z: number }, station: StationId) => {
  const start = startOf(station)
  expect(body.x).toBeCloseTo(start.at[0], 1)
  expect(body.z).toBeCloseTo(start.at[2], 1)
}

describe("where a training starts", () => {
  test("with nothing saved, at the first station with only it unlocked", () => {
    const { snap } = started()
    expect(snap().training).toMatchObject({ tag: "station", station: "look", unlocked: 1 })
    standsAtStart(snap().you!.body, "look")
  })

  test("the request's station and unlocked count: the player starts there, at its start, with its setup", () => {
    const { snap } = started({ unlocked: 4, from: "switch" })
    expect(snap().training).toMatchObject({ tag: "station", station: "switch", step: stepsOf("switch")[0], count: 0, unlocked: 4 })
    standsAtStart(snap().you!.body, "switch")
    // Station 4's setup: the mandi in hand.
    expect(snap().you!.arsenal.current).toBe("mandi")
  })

  test("a station beyond the unlocked ones starts at the last unlocked one", () => {
    const { snap } = started({ unlocked: 2, from: "armoury" })
    expect(snap().training).toMatchObject({ station: "course", unlocked: 2 })
  })

  test("the host refuses an unlocked count outside the training", () => {
    const { connect } = harness(createBrowserHost)
    for (const unlocked of [0, ALL + 1, 1.5]) {
      const me = connect()
      me.say({ t: "training", primary: "cramar", unlocked, from: "look" })
      expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
    }
  })
})

describe("going to a station", () => {
  test("an unlocked station: the player is placed at its start, with its setup and its first step", () => {
    const h = started({ unlocked: 4, from: "switch" })
    h.me.say({ t: "goTo", station: "course" })
    h.settle()
    expect(h.snap().training).toMatchObject({ tag: "station", station: "course", step: stepsOf("course")[0], count: 0, unlocked: 4 })
    standsAtStart(h.snap().you!.body, "course")
    // Station 2 holds nothing in particular: the mandi of station 4 is gone with a fresh arsenal.
    expect(h.snap().you!.arsenal.current).not.toBe("mandi")
  })

  test("going forward to an unlocked station works too", () => {
    const h = started({ unlocked: 4, from: "look" })
    h.me.say({ t: "goTo", station: "switch" })
    h.settle()
    expect(h.snap().training).toMatchObject({ station: "switch", unlocked: 4 })
    standsAtStart(h.snap().you!.body, "switch")
  })

  test("a locked station is refused: the player stays where they are", () => {
    const h = started({ unlocked: 2, from: "course" })
    h.drive(30, () => ({ mz: 1, yaw: startOf("course").yaw }))
    h.drive(30, () => ({}))
    const before = h.snap().you!.body
    h.me.say({ t: "goTo", station: "switch" })
    h.settle()
    expect(h.snap().training).toMatchObject({ station: "course", unlocked: 2 })
    expect(h.snap().you!.body.x).toBeCloseTo(before.x, 1)
  })

  test("the game server and a regular Offline room refuse it", () => {
    const server = harness((clock) => new Hub(clock)).connect()
    server.say({ t: "goTo", station: "look" })
    expect(server.got.at(-1)).toEqual({ t: "error", code: "invalid" })

    const h = harness(createBrowserHost)
    const me = h.connect()
    me.say({ t: "create", reach: "offline", mode: "bataie", map: "glemone", minutes: 5, bots: 0, level: "zovin", ff: false, primary: "cramar" })
    h.play(2)
    for (const msg of [{ t: "goTo", station: "look" }, { t: "startOver" }]) {
      me.say(msg)
      expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
    }
  })

  test("restart this station: back at its start, its setup applied again, its first step from nothing", () => {
    const h = started({ unlocked: 4, from: "course" })
    // Walk on, eastward along the street, then restart.
    h.drive(90, () => ({ mz: 1, yaw: startOf("course").yaw }))
    expect(h.snap().you!.body.x).not.toBeCloseTo(startOf("course").at[0], 0)
    h.me.say({ t: "goTo", station: "course" })
    h.settle()
    expect(h.snap().training).toMatchObject({ station: "course", step: stepsOf("course")[0], count: 0 })
    standsAtStart(h.snap().you!.body, "course")
  })

  test("after the training is completed, every station can be chosen", () => {
    // The last station with steps, played by the automatic player to the end of the training.
    const last = STATION_IDS.findLast((s) => stepsOf(s).length > 0)!
    const h = started({ unlocked: ALL, from: last })
    const auto = new Trainee(h.me.last("joined")!.you)
    for (let tick = 0; tick < 60 * 120 && h.snap().training?.tag !== "complete"; tick++) {
      for (const msg of auto.think(h.snap())) h.me.say(msg)
      h.play(1)
    }
    expect(h.snap().training).toEqual({ tag: "complete" })
    h.me.say({ t: "goTo", station: "look" })
    h.settle()
    expect(h.snap().training).toMatchObject({ tag: "station", station: "look", unlocked: ALL })
    standsAtStart(h.snap().you!.body, "look")
  })
})

describe("starting over", () => {
  test("back to station 1 with only it unlocked: the stations after it are locked again", () => {
    const h = started({ unlocked: 6, from: "armoury" })
    h.me.say({ t: "startOver" })
    h.settle()
    expect(h.snap().training).toMatchObject({ tag: "station", station: "look", step: stepsOf("look")[0], count: 0, unlocked: 1 })
    standsAtStart(h.snap().you!.body, "look")
    h.me.say({ t: "goTo", station: "course" })
    h.settle()
    expect(h.snap().training).toMatchObject({ station: "look" })
  })
})

describe("the match menu's pause", () => {
  test("opening it stops the training; closing it resumes from the same tick", () => {
    const h = started({ unlocked: 2, from: "course" })
    h.me.say({ t: "pause", paused: true })
    h.play(3)
    const tick = h.snap().tick
    const body = h.snap().you!.body
    h.play(120)
    expect(h.snap().tick).toBe(tick)
    h.me.say({ t: "pause", paused: false })
    h.play(10)
    expect(h.snap().tick).toBeGreaterThan(tick)
    expect(h.snap().tick).toBeLessThanOrEqual(tick + 12)
    expect(h.snap().you!.body.x).toBeCloseTo(body.x, 1)
  })

  test("a station chosen while paused is reached once the menu closes", () => {
    const h = started({ unlocked: 4, from: "look" })
    h.me.say({ t: "pause", paused: true })
    h.me.say({ t: "goTo", station: "switch" })
    h.play(30)
    expect(h.snap().training).toMatchObject({ station: "look" })
    h.me.say({ t: "pause", paused: false })
    h.settle()
    expect(h.snap().training).toMatchObject({ station: "switch" })
  })
})
