/**
 * Station 5, the stalls: one step per primary that shoots, each giving its weapon. Driven by
 * protocol messages to the in-browser host, as the player's client drives it.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { BUTTON, IDLE_INPUT } from "../shared/input.ts"
import type { Spawn } from "../shared/map.ts"
import { SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import { initPhysics } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import type { StepOf } from "../shared/training/index.ts"
import { CRAMAR_HITS, MULIN_HITS } from "../shared/training/stations/stalls.ts"
import { WEAPONS, type PrimaryId } from "../shared/weapons.ts"
import { harness, type Client, type Harness } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"
import type { Driver } from "./trainee/moves.ts"
import { shooter, type Shooting } from "./trainee/stalls.ts"

beforeAll(() => initPhysics())

type Stall = StepOf<"stalls">
const PLACE = SAGRE_STATIONS[4]
const STALLS: readonly Stall[] = ["cramar", "doplete", "cjampanili", "mulin", "gjalinis"]
/** A bound on any one drive, so a test that never sees what it waits for fails instead of hanging. */
const PATIENCE = 60 * 60

interface At extends Harness {
  readonly me: Client
  readonly trainee: Trainee
}

const snap = (h: At) => h.me.last("snap")!
const view = (h: At) => h.me.last("snap")?.training
const stationNow = (h: At) => {
  const v = view(h)
  return v?.tag === "station" ? v.station : null
}
const stepNow = (h: At) => {
  const v = view(h)
  return v?.tag === "station" ? v.step : null
}

/** A training on the in-browser host, played by the automatic player until `step` of the stalls is current. */
function at(step: Stall, primary: PrimaryId = "cramar"): At {
  const h = harness(createBrowserHost)
  const me = h.connect()
  me.say({ t: "training", primary })
  const at: At = { ...h, me, trainee: new Trainee(me.last("joined")!.you) }
  autoplay(at, () => stationNow(at) === "stalls" && stepNow(at) === step && snap(at).you?.alive === true)
  expect(view(at)).toMatchObject({ tag: "station", station: "stalls", step })
  return at
}

/** Lets the automatic player play until `until` holds; returns every event of those ticks. */
function autoplay(h: At, until: () => boolean, ticks = 60 * 600): GameEvent[] {
  const events: GameEvent[] = []
  for (let tick = 0; tick < ticks && !until(); tick++) {
    for (const msg of h.trainee.think(snap(h))) h.me.say(msg)
    const before = h.me.got.length
    h.play(1)
    for (const m of h.me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
  }
  return events
}

/** Plays one driver, one input per tick as a client sends them, until `until` sees the events so far; returns those events. */
function play(h: At, driver: Driver, until: (events: readonly GameEvent[]) => boolean, ticks = PATIENCE): GameEvent[] {
  const events: GameEvent[] = []
  const me = snap(h).you!
  let seq = me.seq
  let yaw = snap(h).players.find((p) => Math.abs(p.x - me.body.x) < 0.01 && Math.abs(p.z - me.body.z) < 0.01)?.yaw ?? 0
  let pitch = 0
  for (let i = 0; i < ticks && !until(events); i++) {
    const s = snap(h)
    const act = driver({ snap: s, you: s.you!, yaw, pitch, ticks: i })
    const input = { ...IDLE_INPUT, yaw, pitch, weapon: s.you!.arsenal.current, ...act.input, seq: ++seq, view: s.tick }
    yaw = input.yaw
    pitch = input.pitch
    h.me.say({ t: "input", i: input })
    const before = h.me.got.length
    h.play(1)
    for (const m of h.me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
  }
  return events
}

const myself = (h: At) => h.me.last("joined")!.you
/** Hits the trainee made on someone else. */
const hitsOnOthers = (h: At, events: readonly GameEvent[]) => events.filter((e) => e.t === "hit" && e.a === myself(h) && e.v !== myself(h)).length
const steps = (events: readonly GameEvent[]) => events.flatMap((e) => (e.t === "training" && e.a === "step" ? [e.step] : []))

/** Shoots until `hits` hits on bots, unless the step completes first. */
const hitWith = (h: At, s: Shooting, hits = 1) => play(h, shooter(s), (events) => hitsOnOthers(h, events) >= hits || steps(events).length > 0)

/** A spot to stand at, facing east. */
const spot = (x: number, z: number): Spawn => ({ at: [x, 0, z], yaw: -Math.PI / 2 })

describe("station 5: the stalls", () => {
  test("each stall gives its primary in hand and loaded; the trainee's own primary comes back after the station", () => {
    const h = at("cramar", "miedi")
    const begun: Partial<Record<Stall, unknown>> = {}
    const events = autoplay(h, () => {
      const step = stepNow(h)
      if (stationNow(h) === "stalls" && step && !(step in begun)) {
        const a = snap(h).you!.arsenal
        begun[step as Stall] = { current: a.current, primary: a.primary, nextPrimary: a.nextPrimary, ammo: a.ammo[step as Stall] }
      }
      return stationNow(h) === "armoury"
    })
    for (const stall of STALLS) {
      const ammo = { mag: WEAPONS[stall].magazine, reserve: WEAPONS[stall].reserve }
      // The first stall's weapon is in hand on the tick the step begins, but the switch to the Mandi
      // station 4 ended with may still be in flight and take it out again; the later stalls' previous
      // weapon is no longer owned, so nothing can.
      const current = stall === "cramar" ? expect.anything() : stall
      expect(begun[stall]).toEqual({ current, primary: stall, nextPrimary: "miedi", ammo })
    }
    expect(steps(events)).toEqual([...STALLS])
    expect(events).toContainEqual({ t: "training", a: "station", station: "stalls" })
    expect(snap(h).you!.arsenal.primary).toBe("miedi")
  })

  test("the Cramâr's step counts hits with the Cramâr only, and shows its count", () => {
    const h = at("cramar")
    expect(view(h)).toMatchObject({ step: "cramar", count: 0, target: CRAMAR_HITS })
    expect(CRAMAR_HITS).toBeGreaterThan(1)
    // Hits with the Mandi, on the same moving bot from the same stall, do not count.
    const mandi = hitWith(h, { from: PLACE.stalls.cramar.at, at: "cramar", weapon: "mandi", trigger: "pull", aim: "always" }, 3)
    expect(hitsOnOthers(h, mandi)).toBeGreaterThanOrEqual(3)
    expect(view(h)).toMatchObject({ step: "cramar", count: 0 })
    const counts = new Set<number>()
    const cramar = play(h, shooter({ from: PLACE.stalls.cramar.at, at: "cramar", weapon: "cramar", trigger: "hold", aim: "always" }), (events) => {
      const v = view(h)
      if (v?.tag === "station" && v.step === "cramar") counts.add(v.count)
      return steps(events).length > 0
    })
    expect(steps(cramar)).toEqual(["cramar"])
    expect([...counts].some((n) => n > 0 && n < CRAMAR_HITS)).toBe(true)
  })

  test("the Dopiete's step needs a hit from close, with the Dopiete", () => {
    const h = at("doplete")
    expect(hitsOnOthers(h, hitWith(h, { from: PLACE.stalls.doplete.at, at: "doplete", weapon: "mandi", trigger: "pull", aim: "always" }))).toBe(1)
    // From the Cramâr's stall, three times as far.
    expect(hitsOnOthers(h, hitWith(h, { from: PLACE.stalls.cramar.at, at: "doplete", weapon: "doplete", trigger: "pull", aim: "always" }))).toBe(1)
    expect(view(h)).toMatchObject({ step: "doplete", count: 0 })
    expect(steps(hitWith(h, { from: PLACE.stalls.doplete.at, at: "doplete", weapon: "doplete", trigger: "pull", aim: "always" }))).toEqual(["doplete"])
  })

  test("the Cjampanili's step needs a far hit made through the scope", () => {
    const h = at("cjampanili")
    const far = PLACE.stalls.cjampanili.at
    // Aim pressed only as the trigger is pulled: the scope is not up yet.
    expect(hitsOnOthers(h, hitWith(h, { from: far, at: "cjampanili", weapon: "cjampanili", trigger: "pull", aim: "tap" }))).toBe(1)
    // Through the scope, but from close.
    expect(hitsOnOthers(h, hitWith(h, { from: spot(-15, 2), at: "cjampanili", weapon: "cjampanili", trigger: "pull", aim: "always" }))).toBe(1)
    expect(view(h)).toMatchObject({ step: "cjampanili", count: 0 })
    expect(steps(hitWith(h, { from: far, at: "cjampanili", weapon: "cjampanili", trigger: "pull", aim: "always" }))).toEqual(["cjampanili"])
  })

  test("the Mulin's step needs it spun up and firing, with the Mulin", () => {
    const h = at("mulin")
    const from = PLACE.stalls.mulin.at
    expect(hitsOnOthers(h, hitWith(h, { from, at: "gjalinis", weapon: "mandi", trigger: "pull", aim: "always" }))).toBe(1)
    // Back to the Mulin, and the trigger held for less than its spin-up: it never fires.
    play(h, shooter({ from, at: "gjalinis", weapon: "mulin", trigger: "none", aim: "always" }), () => snap(h).you!.arsenal.current === "mulin" && snap(h).you!.arsenal.action._tag === "ready")
    const short = play(h, shooter({ from, at: "gjalinis", weapon: "mulin", trigger: "hold", aim: "always" }), () => false, WEAPONS.mulin.spinTicks - 5)
    expect(short.some((e) => e.t === "shot")).toBe(false)
    expect(view(h)).toMatchObject({ step: "mulin", count: 0, target: MULIN_HITS })
    expect(steps(hitWith(h, { from, at: "gjalinis", weapon: "mulin", trigger: "hold", aim: "always" }, MULIN_HITS + 50))).toEqual(["mulin"])
  })

  test("the Cjanon des Gjalinis' step completes when a hen bursts on a bot", () => {
    const h = at("gjalinis")
    const from = PLACE.stalls.gjalinis.at
    // A hen fired at the sky bursts on nobody.
    const sky: Driver = (sight) => {
      const me = sight.you.body
      if (Math.hypot(from.at[0] - me.x, from.at[2] - me.z) > 0.4) return shooter({ from, at: "gjalinis", weapon: "gjalinis", trigger: "none", aim: "never" })(sight)
      return { input: { weapon: "gjalinis", pitch: 1.4, buttons: sight.ticks % 200 === 0 ? BUTTON.fire : 0 } }
    }
    const missed = play(h, sky, (events) => events.some((e) => e.t === "boom" && e.k === "gjaline"))
    expect(missed.some((e) => e.t === "boom" && e.k === "gjaline")).toBe(true)
    expect(view(h)).toMatchObject({ step: "gjalinis", count: 0 })
    const burst = hitWith(h, { from, at: "gjalinis", weapon: "gjalinis", trigger: "pull", aim: "never" })
    expect(steps(burst)).toEqual(["gjalinis"])
    expect(burst.some((e) => e.t === "boom" && e.k === "gjaline")).toBe(true)
  })
})
