/**
 * Station 11 of the training, the modes, driven by protocol messages to the in-browser host as the
 * player's client drives it: the frico and the plaçute, each in force only while its step is.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import type { V3 } from "../shared/map.ts"
import { SAGRE } from "../shared/maps/sagre.ts"
import { initPhysics } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import type { StationId } from "../shared/training/index.ts"
import { PLACUTE_POINTS } from "../shared/training/stations/modes.ts"
import { harness } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"
import { alongTheStreet } from "./trainee/pickups.ts"

beforeAll(() => initPhysics())

/** A training on the in-browser host, played by the automatic player until `station` is current; `seen` gets every snapshot's station and objective on the way. */
function reach(station: StationId, seen?: (station: string, objective: string) => void) {
  const h = harness(createBrowserHost)
  const me = h.connect()
  me.say({ t: "training", primary: "cramar" })
  for (let i = 0; i < 120 && !me.last("snap")?.you?.alive; i++) h.play(1)
  const you = me.last("joined")!.you
  const auto = new Trainee(you)
  for (let tick = 0; tick < 60 * 900; tick++) {
    const now = me.last("snap")!
    if (now.training?.tag === "station") {
      if (now.training.station === station) break
      seen?.(now.training.station, now.objective)
    }
    for (const msg of auto.think(me.last("snap"))) me.say(msg)
    h.play(1)
  }
  expect(me.last("snap")!.training).toMatchObject({ tag: "station", station })
  let seq = me.last("snap")!.you!.seq
  const snap = () => me.last("snap")!
  /** Sends one input per tick, as a client does; returns every event those ticks brought. */
  const drive = (ticks: number, input: (tick: number) => Partial<PlayerInput>, until?: (events: GameEvent[]) => boolean) => {
    const events: GameEvent[] = []
    for (let i = 0; i < ticks; i++) {
      me.say({ t: "input", i: { ...IDLE_INPUT, weapon: snap().you!.arsenal.current, ...input(i), seq: ++seq, view: snap().tick } })
      const before = me.got.length
      h.play(1)
      for (const m of me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
      if (until?.(events)) break
    }
    return events
  }
  /** Walks to a point and stops on it. */
  const walkTo = (to: V3, ticks = 60 * 30) =>
    drive(ticks, () => alongTheStreet(snap().you!.body, to), () => {
      const b = snap().you!.body
      return Math.hypot(b.x - to[0], b.z - to[2]) < 0.4
    })
  /** Stands still for a while. */
  const wait = (ticks: number) => drive(ticks, () => ({}))
  return { ...h, me, you, snap, drive, walkTo, wait }
}

const steps = (events: GameEvent[]) => events.flatMap((e) => (e.t === "training" && e.a === "step" ? [e.step] : []))
const ENEMY_BASE = SAGRE.flagBases.malandanti
const HOME = SAGRE.flagBases.benandanti

describe("station 11: the frico", () => {
  test("the frico is in force on arrival, and nothing else", () => {
    const { snap } = reach("modes")
    expect(snap().training).toMatchObject({ station: "modes", step: "frico", count: 0, target: 1 })
    expect(snap().objective).toBe("frico")
  })

  test("going home without the enemy frico completes nothing", () => {
    const { walkTo, wait, snap } = reach("modes")
    const events = [...walkTo(HOME), ...wait(60)]
    expect(steps(events)).toEqual([])
    expect(snap().training).toMatchObject({ step: "frico", count: 0 })
  })

  test("the enemy frico is taken and carried, and bringing it home completes the step", () => {
    const { walkTo, wait, snap, you } = reach("modes")
    const taken = walkTo(ENEMY_BASE)
    expect(taken).toContainEqual({ t: "flag", team: "malandanti", a: "taken", s: you })
    walkTo([140, 0, -10])
    expect(snap().flags.malandanti).toEqual({ _tag: "carried", by: you })
    expect(steps(wait(5))).toEqual([])
    const home = walkTo(HOME)
    expect(home).toContainEqual({ t: "flag", team: "malandanti", a: "captured", s: you })
    expect(steps(home)).toEqual(["frico"])
    expect(snap().training).toMatchObject({ station: "modes", step: "placute" })
    expect(snap().objective).toBe("placute")
  })
})

describe("station 11: the plaçute", () => {
  /** At the plaçute step: the frico brought home. */
  const atPlacute = () => {
    const r = reach("modes")
    r.walkTo(ENEMY_BASE)
    r.walkTo(HOME)
    expect(r.snap().training).toMatchObject({ step: "placute", count: 0, target: PLACUTE_POINTS })
    return r
  }

  test("standing outside the plaçute scores nothing", () => {
    const { wait, snap } = atPlacute()
    wait(60 * 3)
    expect(snap().training).toMatchObject({ step: "placute", count: 0 })
    expect(snap().objective).toBe("placute")
  })

  test("the plaçute scores while the player stands in it, counted until the target completes the step", () => {
    const { walkTo, wait, snap } = atPlacute()
    const entered = walkTo(SAGRE.hill.at)
    expect(entered).toContainEqual({ t: "hill", team: "benandanti" })
    expect(snap().hill.owner).toBe("benandanti")
    wait(60 * 2 + 5)
    const count = snap().training
    expect(count?.tag === "station" && count.step === "placute" ? count.count : -1).toBeGreaterThanOrEqual(2)
    const events = wait(60 * PLACUTE_POINTS)
    expect(steps(events)).toEqual(["placute"])
    expect(snap().objective).not.toBe("placute")
  })
})

describe("station 11: one objective in force at a time", () => {
  test("no objective is in force at the stations before it", () => {
    const objectives = new Map<string, Set<string>>()
    reach("modes", (station, objective) => {
      if (!objectives.has(station)) objectives.set(station, new Set())
      objectives.get(station)!.add(objective)
    })
    expect(objectives.size).toBeGreaterThan(0)
    for (const [, seen] of objectives) expect([...seen]).toEqual(["none"])
  })

  test("the automatic player completes the frico and the plaçute", () => {
    const { me, play, snap, you } = reach("modes")
    const auto = new Trainee(you)
    const done: string[] = []
    for (let tick = 0; tick < 60 * 120 && done.length < 2; tick++) {
      for (const msg of auto.think(snap())) me.say(msg)
      const before = me.got.length
      play(1)
      for (const m of me.got.slice(before)) if (m.t === "snap") for (const e of m.ev) if (e.t === "training" && e.a === "step" && e.station === "modes") done.push(e.step)
    }
    expect(done).toEqual(["frico", "placute"])
  })
})
