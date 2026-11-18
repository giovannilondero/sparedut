/**
 * Station 7 of the training, bombs and mines, and the rule that the trainee cannot die before the
 * skirmish: driven by protocol messages to the in-browser host, as the player's client drives it.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import { initPhysics } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import type { StationId } from "../shared/training/index.ts"
import { RAIBL_MINE, SGNAPE_BOMB } from "../shared/weapons.ts"
import { harness } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"
import { alongTheStreet } from "./trainee/pickups.ts"

beforeAll(() => initPhysics())

const PLACE = SAGRE_STATIONS.throw

/** A training on the in-browser host, played by the automatic player until `station` is the current one. */
function reach(station: StationId) {
  const h = harness(createBrowserHost)
  const me = h.connect()
  me.say({ t: "training", primary: "cramar" })
  for (let i = 0; i < 120 && !me.last("snap")?.you?.alive; i++) h.play(1)
  const you = me.last("joined")!.you
  const auto = new Trainee(you)
  const snap = () => me.last("snap")!
  /** The automatic player plays until `done` holds; returns every event those ticks brought. */
  const autoplay = (done: () => boolean, ticks = 60 * 600) => {
    const events: GameEvent[] = []
    for (let tick = 0; tick < ticks && !done(); tick++) {
      for (const msg of auto.think(snap())) me.say(msg)
      const before = me.got.length
      h.play(1)
      for (const m of me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
    }
    return events
  }
  const at = (id: StationId) => {
    const now = snap().training
    return now?.tag === "station" && now.station === id
  }
  autoplay(() => at(station))
  expect(snap().training).toMatchObject({ tag: "station", station })
  let seq = snap().you!.seq
  /** Sends one input per tick, as a client does; returns every event those ticks brought. */
  const drive = (ticks: number, input: (tick: number) => Partial<PlayerInput>, until?: (events: GameEvent[]) => boolean) => {
    const events: GameEvent[] = []
    for (let i = 0; i < ticks; i++) {
      const s = snap()
      me.say({ t: "input", i: { ...IDLE_INPUT, weapon: s.you!.arsenal.current, ...input(i), seq: ++seq, view: s.tick } })
      const before = me.got.length
      h.play(1)
      for (const m of me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
      if (until?.(events)) break
    }
    return events
  }
  /** Walks along the street to a point and stops on it. */
  const walkTo = (to: readonly [number, number, number], ticks = 60 * 60) =>
    drive(ticks, () => alongTheStreet(snap().you!.body, to), () => {
      const b = snap().you!.body
      return Math.hypot(b.x - to[0], b.z - to[2]) < 0.4
    })
  return { ...h, me, you, drive, snap, walkTo, autoplay, at }
}

const steps = (events: GameEvent[]) => events.flatMap((e) => (e.t === "training" && e.a === "step" ? [e.step] : []))
/** The yaw that faces `to` from `from` (0 faces north, -z). */
const facing = (from: { x: number; z: number }, to: readonly number[]) => Math.atan2(-(to[0] - from.x), -(to[2] - from.z))
/** Taps a button every `every` ticks, so that each tap is a fresh press. */
const tap = (button: number, every: number) => (tick: number) => (tick % every === 0 ? button : 0)

describe("the trainee cannot die before the skirmish", () => {
  test("bombs thrown at their own feet leave the trainee alive with one point of health", () => {
    const { drive, snap, you } = reach("throw")
    const yaw = snap().players.find((p) => p.id === you)!.yaw
    let lowest = snap().you!.hp
    const events = drive(60 * 30, (tick) => ({ yaw, pitch: -1.5, buttons: tap(BUTTON.bomb, SGNAPE_BOMB.cooldownTicks + 5)(tick) }), () => {
      lowest = Math.min(lowest, snap().you!.hp)
      return lowest === 1 && !snap().ev.some((e) => e.t === "hit")
    })
    // Hits of their own bomb that would have killed them, had the training not spared them.
    const own = events.filter((e) => e.t === "hit" && e.v === you && e.a === you)
    expect(own.length).toBeGreaterThan(2)
    expect(own.reduce((sum, e) => sum + (e.t === "hit" ? e.d : 0), 0)).toBeGreaterThan(100)
    expect(events.some((e) => e.t === "kill" && e.v === you)).toBe(false)
    expect(snap().you!.alive).toBe(true)
    expect(snap().you!.hp).toBe(1)
  })
})

describe("station 7: bombs and mines", () => {
  test("bombs and mines are refilled when the station starts, however many were used before", () => {
    const { drive, snap, autoplay, at } = reach("armoury")
    drive(60, (tick) => ({ pitch: -1.5, buttons: tick === 0 ? BUTTON.bomb : tick === 10 ? BUTTON.mine : 0 }))
    expect(snap().you!.arsenal.bombs).toBe(SGNAPE_BOMB.perLife - 1)
    expect(snap().you!.arsenal.mines).toBe(RAIBL_MINE.perLife - 1)
    autoplay(() => at("throw"))
    expect(snap().training).toMatchObject({ station: "throw", step: "bomb", count: 0, target: 1 })
    expect(snap().you!.arsenal.bombs).toBe(SGNAPE_BOMB.perLife)
    expect(snap().you!.arsenal.mines).toBe(RAIBL_MINE.perLife)
  })

  test("a bomb that lands far from the bots does not complete the step, and the bombs come back", () => {
    const { drive, snap, you } = reach("throw")
    const yaw = snap().players.find((p) => p.id === you)!.yaw
    const events = drive(60 * 6, (tick) => ({ yaw: yaw + Math.PI, pitch: 0, buttons: tap(BUTTON.bomb, SGNAPE_BOMB.cooldownTicks + 5)(tick) }))
    expect(events.filter((e) => e.t === "launch" && e.k === "sgnape").length).toBeGreaterThan(SGNAPE_BOMB.perLife)
    expect(events.some((e) => e.t === "boom" && e.k === "sgnape")).toBe(true)
    expect(steps(events)).toEqual([])
    expect(snap().training).toMatchObject({ station: "throw", step: "bomb", count: 0 })
    expect(snap().you!.arsenal.bombs).toBeGreaterThan(0)
  })

  test("a bomb thrown by the player that hurts a bot completes the bomb step", () => {
    const { drive, snap, walkTo, you } = reach("throw")
    walkTo(PLACE.bombAt)
    const events = drive(60 * 8, (tick) => ({
      yaw: facing(snap().you!.body, PLACE.bombTargets[1]),
      pitch: 0,
      buttons: tap(BUTTON.bomb, SGNAPE_BOMB.cooldownTicks + 5)(tick)
    }), (ev) => steps(ev).length > 0)
    expect(events).toContainEqual(expect.objectContaining({ t: "boom", k: "sgnape" }))
    expect(events.some((e) => e.t === "hit" && e.a === you && e.v !== you)).toBe(true)
    expect(steps(events)).toEqual(["bomb"])
    expect(snap().training).toMatchObject({ station: "throw", step: "mine", count: 0 })
  })

  test("a bot walks over the place where the mine is planted", () => {
    const { drive, snap, you } = reach("throw")
    const crossed = new Set<string>()
    drive(60 * 15, () => ({}), () => {
      for (const p of snap().players) if (p.id !== you && Math.hypot(p.x - PLACE.mineAt[0], p.z - PLACE.mineAt[2]) < RAIBL_MINE.trigger / 2) crossed.add(p.id)
      return crossed.size > 0
    })
    expect(crossed.size).toBe(1)
  })

  test("a mine the player planted, set off by a bot, completes the mine step", () => {
    const { drive, snap, walkTo, autoplay, at, you } = reach("throw")
    autoplay(() => {
      const now = snap().training
      return now?.tag === "station" && now.step === "mine"
    })
    expect(at("throw")).toBe(true)
    // Just west of the walker's crossing, looking down at it: the mine lands on it.
    walkTo([PLACE.mineAt[0] - 0.8, 0, PLACE.mineAt[2]])
    const planted = drive(30, (tick) => ({ yaw: facing(snap().you!.body, PLACE.mineAt), pitch: -1.2, buttons: tick === 0 ? BUTTON.mine : 0 }))
    expect(planted).toContainEqual({ t: "launch", s: you, k: "mine" })
    const mine = snap().proj.find(([kind]) => kind === "mine")!
    expect(Math.hypot(mine[1] - PLACE.mineAt[0], mine[3] - PLACE.mineAt[2])).toBeLessThan(RAIBL_MINE.trigger / 2)
    // Out of the blast, waiting for the walker: it may already have crossed while the trainee walked away.
    const away = walkTo([PLACE.mineAt[0] - 6, 0, PLACE.mineAt[2]])
    const events = steps(away).length > 0 ? away : [...away, ...drive(60 * 20, () => ({}), (ev) => steps(ev).length > 0)]
    expect(events).toContainEqual(expect.objectContaining({ t: "boom", k: "mine" }))
    expect(steps(events)).toEqual(["mine"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "throw" })
  })

  test("the automatic player completes station 7", () => {
    const { autoplay, at } = reach("throw")
    const events = autoplay(() => !at("throw"), 60 * 90)
    expect(steps(events)).toEqual(["bomb", "mine"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "throw" })
  })
})
