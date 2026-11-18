/**
 * Station 12, the skirmish, and the end of the training, driven by protocol messages to the
 * in-browser host as the player's client drives it: a short Bataie di Gnot against bots that fire,
 * the scoreboard and a quick phrase reported by the client, and a step the active device has no
 * control for, which the client says so and the simulation completes.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { Hub, type Clock } from "../server/hub.ts"
import { BOT_LEVEL_IDS } from "../shared/folklore.ts"
import { navGraph } from "../server/nav.ts"
import { stationGraph } from "../server/station-bot.ts"
import { SAGRE, SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import { createPhysicsWorld, initPhysics } from "../shared/physics.ts"
import { FLAG_BIT } from "../shared/protocol.ts"
import { SKIRMISH_SCORE } from "../shared/training/stations/skirmish.ts"
import { harness } from "./harness.ts"
import { reach, steps } from "./training-station.ts"

beforeAll(() => initPhysics())

const SKIRMISH = SAGRE_STATIONS.skirmish.area

/** The training's state as the last snapshot shows it. */
const at = (r: ReturnType<typeof reach>) => r.snap().training

describe("station 12: the skirmish", () => {
  test("its bots fire, at the lowest skill", () => {
    const r = reach("skirmish")
    expect(r.me.last("joined")!.room.level).toBe(BOT_LEVEL_IDS[0])
    // The trainee stands at the station's start: the bots come and fire at them.
    const events = r.wait(60 * 20)
    const bots = new Set(r.snap().players.filter((p) => p.id !== r.you).map((p) => p.id))
    expect(bots.size).toBeGreaterThan(0)
    expect(events.some((e) => e.t === "shot" && bots.has(e.s))).toBe(true)
    expect(events.some((e) => e.t === "hit" && e.v === r.you && e.a !== null && bots.has(e.a))).toBe(true)
  })

  test("its bots roam and path only in its half of the square, not up the street", () => {
    const whole = navGraph(createPhysicsWorld(SAGRE))
    const part = stationGraph(whole, "skirmish")
    expect(part.points.length).toBeGreaterThan(0)
    expect(part.points.length).toBeLessThan(whole.points.length)
    for (const [x, , z] of part.points) {
      expect(x).toBeGreaterThanOrEqual(SKIRMISH.minX)
      expect(x).toBeLessThanOrEqual(SKIRMISH.maxX)
      expect(Math.abs(z)).toBeLessThanOrEqual(SKIRMISH.maxZ)
    }
    // Still a graph a bot can walk: every point leads to another.
    for (const edges of part.edges) expect(edges.length).toBeGreaterThan(0)
  })

  test("the trainee can die in it, and respawns at the skirmish", () => {
    const r = reach("skirmish")
    const killed = r.drive(60 * 90, () => ({}), (events) => events.some((e) => e.t === "kill" && e.v === r.you))
    expect(killed.some((e) => e.t === "kill" && e.v === r.you)).toBe(true)
    expect(r.snap().you!.alive).toBe(false)
    r.drive(60 * 10, () => ({}), (events) => events.some((e) => e.t === "spawn" && e.s === r.you))
    const b = r.snap().you!.body
    expect(r.snap().you!.alive).toBe(true)
    expect(b.x).toBeGreaterThan(SKIRMISH.minX)
    expect(b.x).toBeLessThan(SKIRMISH.maxX)
    // Dying does not undo the skirmish: still its first step.
    expect(at(r)).toMatchObject({ station: "skirmish", step: "win" })
  })

  test("its score is its own, and its step completes when the Benandanti reach the target", () => {
    const r = reach("skirmish")
    // The modes' steps already raised the Benandanti's score: the skirmish counts from zero.
    expect(r.snap().score.benandanti).toBeGreaterThan(0)
    expect(at(r)).toMatchObject({ station: "skirmish", step: "win", count: 0, target: SKIRMISH_SCORE })
    const before = r.snap().score.benandanti
    const events = r.autoplay(60 * 120, (ev) => steps(ev).length > 0)
    expect(steps(events)).toEqual(["win"])
    const kills = events.filter((e) => e.t === "kill" && e.k === r.you).length
    expect(kills).toBeGreaterThanOrEqual(SKIRMISH_SCORE)
    expect(r.snap().score.benandanti - before).toBeGreaterThanOrEqual(SKIRMISH_SCORE)
    expect(at(r)).toMatchObject({ station: "skirmish", step: "board", count: 0 })
  })
})

describe("station 12: the scoreboard and a quick phrase", () => {
  test("each completes when the client reports it, and only while it is the current step", () => {
    const r = reach("skirmish")
    // Not yet: the skirmish is current.
    r.me.say({ t: "report", a: "board" })
    r.me.say({ t: "report", a: "phrases" })
    expect(steps(r.wait(5))).toEqual([])
    expect(at(r)).toMatchObject({ step: "win", count: 0 })

    const b = reach("skirmish", undefined, "board")
    b.me.say({ t: "report", a: "phrases" })
    expect(steps(b.wait(5))).toEqual([])
    b.me.say({ t: "report", a: "board" })
    expect(steps(b.wait(5))).toEqual(["board"])
    expect(at(b)).toMatchObject({ step: "phrases", count: 0 })
    // The scoreboard again is no quick phrase.
    b.me.say({ t: "report", a: "board" })
    expect(steps(b.wait(5))).toEqual([])
    b.me.say({ t: "report", a: "phrases" })
    const events = b.wait(5)
    expect(steps(events)).toEqual(["phrases"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "skirmish" })
    expect(events).toContainEqual({ t: "training", a: "complete" })
    expect(at(b)).toEqual({ tag: "complete" })
    // A completed training has no bots left.
    b.wait(10)
    expect(b.snap().players.filter((p) => p.id !== b.you && p.f & FLAG_BIT.alive)).toEqual([])
  })
})

describe("a step the active device has no control for", () => {
  test("a quick phrase on a controller completes itself when the client says so; on touch it does not", () => {
    const r = reach("skirmish", undefined, "phrases")
    r.me.say({ t: "unavailable", station: "skirmish", step: "phrases", device: "touch" })
    r.me.say({ t: "unavailable", station: "skirmish", step: "phrases", device: "keyboard" })
    expect(steps(r.wait(5))).toEqual([])
    r.me.say({ t: "unavailable", station: "skirmish", step: "phrases", device: "pad" })
    const events = r.wait(5)
    expect(steps(events)).toEqual(["phrases"])
    expect(events).toContainEqual({ t: "training", a: "complete" })
  })

  test("the previous weapon completes itself on a controller and on touch, never on a keyboard", () => {
    for (const device of ["pad", "touch"] as const) {
      const r = reach("switch", undefined, "lastWeapon")
      r.me.say({ t: "unavailable", station: "switch", step: "lastWeapon", device: "keyboard" })
      expect(steps(r.wait(5))).toEqual([])
      r.me.say({ t: "unavailable", station: "switch", step: "lastWeapon", device })
      expect(steps(r.wait(5))).toEqual(["lastWeapon"])
      expect(at(r)).toMatchObject({ station: "switch", step: "cycle", count: 0 })
    }
  })

  test("only for the current step: another step's, or one the device has, is ignored", () => {
    const r = reach("switch", undefined, "bySlot")
    // Not current yet.
    r.me.say({ t: "unavailable", station: "switch", step: "lastWeapon", device: "pad" })
    // Current, but a controller has a control for it.
    r.me.say({ t: "unavailable", station: "switch", step: "bySlot", device: "pad" })
    // Another station's.
    r.me.say({ t: "unavailable", station: "skirmish", step: "phrases", device: "pad" })
    expect(steps(r.wait(5))).toEqual([])
    expect(at(r)).toMatchObject({ station: "switch", step: "bySlot", count: 0 })
  })

  test("outside a training it is refused; a step that does not exist is invalid", () => {
    const browser = (clock: Clock) => createBrowserHost(clock)
    for (const make of [browser, (clock: Clock) => new Hub(clock)]) {
      const h = harness(make)
      const me = h.connect()
      const where = make === browser ? { reach: "offline" } : { reach: "online", access: { kind: "open" } }
      me.say({ t: "create", ...where, mode: "bataie", map: "glemone", minutes: 5, bots: 0, level: "zovin", ff: false, primary: "cramar" })
      h.play(5)
      me.say({ t: "unavailable", station: "skirmish", step: "phrases", device: "pad" })
      expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
    }
    const r = reach("look")
    r.me.say({ t: "unavailable", station: "look", step: "nowhere", device: "pad" })
    expect(r.me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
    r.me.say({ t: "unavailable", station: "look", step: "lookAround", device: "fridge" })
    expect(r.me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
  })
})
