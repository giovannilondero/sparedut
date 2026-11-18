/**
 * Station 11 of the training, its second half, driven by protocol messages to the in-browser host
 * as the player's client drives it: push the cjar to the end of its track, then stay inside the
 * storm while it closes. Before the skirmish the storm hurts but never kills.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import type { V3 } from "../shared/map.ts"
import { SAGRE } from "../shared/maps/sagre.ts"
import { initPhysics } from "../shared/physics.ts"
import { STORM_SECONDS } from "../shared/training/stations/modes.ts"
import { reach, steps } from "./training-station.ts"
import { Trainee } from "./trainee/index.ts"

beforeAll(() => initPhysics())

const [TRACK_START, TRACK_END] = SAGRE.track

describe("station 11: the cjar", () => {
  test("the cjar is in force at the start of its track when its step begins", () => {
    const { snap } = reach("modes", undefined, "cjar")
    expect(snap().training).toMatchObject({ station: "modes", step: "cjar", count: 0, target: 1 })
    expect(snap().objective).toBe("cjar")
    expect(snap().cart?.progress).toBe(0)
  })

  test("the cjar does not move with nobody beside it", () => {
    const { wait, snap } = reach("modes", undefined, "cjar")
    const events = wait(60 * 3)
    expect(steps(events)).toEqual([])
    expect(snap().cart?.progress).toBe(0)
  })

  test("pushed from beside it, the cjar reaches the end of its track and completes the step", () => {
    const { walkTo, drive, snap } = reach("modes", undefined, "cjar")
    walkTo(TRACK_START)
    expect(snap().cart?.pushers).toBe(1)
    // Walk along the track a step behind the cjar (it goes east), until it arrives.
    const pushed = drive(60 * 60, () => {
      const at = snap().cart?.at ?? TRACK_END
      const b = snap().you!.body
      const behind = at[0] - 1.5
      return Math.hypot(behind - b.x, at[2] - b.z) > 0.5 ? { mz: 1, yaw: Math.atan2(-(behind - b.x), -(at[2] - b.z)) } : {}
    }, (events) => steps(events).length > 0)
    expect(pushed).toContainEqual({ t: "cart", a: "arrived" })
    expect(steps(pushed)).toEqual(["cjar"])
    expect(snap().cart).toBeNull()
  })
})

describe("station 11: the storm", () => {
  /** The radius of the storm in force, or -1 when there is none. */
  const radius = (r: ReturnType<typeof reach>) => r.snap().storm?.radius ?? -1
  const count = (r: ReturnType<typeof reach>) => {
    const t = r.snap().training
    return t?.tag === "station" && t.step === "storm" ? t.count : -1
  }

  test("the storm is in force when its step begins, centred on the square, with the player inside", () => {
    const r = reach("modes", undefined, "storm")
    expect(r.snap().objective).toBe("storm")
    expect(r.snap().training).toMatchObject({ station: "modes", step: "storm", count: 0, target: STORM_SECONDS })
    const storm = r.snap().storm!
    expect([storm.x, storm.z]).toEqual([SAGRE.hill.at[0], SAGRE.hill.at[2]])
    const b = r.snap().you!.body
    expect(Math.hypot(b.x - storm.x, b.z - storm.z)).toBeLessThan(storm.radius)
  })

  test("the storm closes in, then holds", () => {
    const r = reach("modes", undefined, "storm")
    const start = radius(r)
    // Outside the closed ring, so that the step does not complete while the storm is watched.
    r.walkTo([SAGRE.hill.at[0], 0, SAGRE.hill.at[2] + 14])
    r.wait(60 * 2)
    const closing = radius(r)
    expect(closing).toBeLessThan(start)
    r.wait(60 * 30)
    const closed = radius(r)
    expect(closed).toBeLessThan(closing)
    expect(closed).toBeGreaterThan(SAGRE.hill.radius)
    r.wait(60)
    expect(radius(r)).toBe(closed)
  })

  test("staying inside counts the seconds; the last completes the step and station 11", () => {
    const r = reach("modes", undefined, "storm")
    r.walkTo(SAGRE.hill.at)
    r.wait(60 * 3)
    expect(count(r)).toBeGreaterThanOrEqual(2)
    expect(count(r)).toBeLessThan(STORM_SECONDS)
    const events = r.drive(60 * (STORM_SECONDS + 2), () => ({}), (e) => steps(e).length > 0)
    expect(steps(events)).toEqual(["storm"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "modes" })
    expect(r.snap().training).not.toMatchObject({ station: "modes" })
    expect(r.snap().storm).toBeNull()
  })

  test("outside the ring the storm hurts but never kills, and the seconds outside do not count", () => {
    const r = reach("modes", undefined, "storm")
    const corner: V3 = [126, 0, -24]
    r.walkTo(corner)
    const events = r.drive(60 * 40, () => {
      expect(r.snap().you!.alive).toBe(true)
      return {}
    })
    const hurt = events.filter((e) => e.t === "hit" && e.v === r.you && e.a === null)
    expect(hurt.length).toBeGreaterThan(20)
    expect(events.some((e) => e.t === "kill" && e.v === r.you)).toBe(false)
    expect(r.snap().you).toMatchObject({ alive: true, hp: 1 })
    expect(steps(events)).toEqual([])
    expect(count(r)).toBeLessThan(STORM_SECONDS)
  })
})

describe("station 11: the automatic player", () => {
  test("completes every step of station 11, and the station", () => {
    const { me, play, snap, you } = reach("modes")
    const auto = new Trainee(you)
    const done: string[] = []
    let station = false
    for (let tick = 0; tick < 60 * 180 && !station; tick++) {
      for (const msg of auto.think(snap())) me.say(msg)
      const before = me.got.length
      play(1)
      for (const m of me.got.slice(before))
        if (m.t === "snap")
          for (const e of m.ev) {
            if (e.t === "training" && e.a === "step" && e.station === "modes") done.push(e.step)
            if (e.t === "training" && e.a === "station" && e.station === "modes") station = true
          }
    }
    expect(done).toEqual(["frico", "placute", "cjar", "storm"])
    expect(station).toBe(true)
  })
})
