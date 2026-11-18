/**
 * Stations 8 and 9 of the training, driven by protocol messages to the in-browser host as the
 * player's client drives it: the pickups, then the turret and the Lanciafrico.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { turretRestSeat } from "../shared/map.ts"
import { SAGRE, SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import { initPhysics } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { MAX_HP } from "../shared/sim/rules.ts"
import { STATION_IDS, type StationId } from "../shared/training/index.ts"
import { WEAPONS } from "../shared/weapons.ts"
import { harness } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"
import { alongTheStreet } from "./trainee/pickups.ts"

beforeAll(() => initPhysics())

const PICKUPS = SAGRE_STATIONS.pickups.pickups
const at = (pickup: number) => SAGRE.pickups[pickup].at

/**
 * A training on the in-browser host, played by the automatic player until `station` is the current
 * one; `started`: begun there instead, as a browser that saved it as unlocked asks.
 */
function reach(station: StationId, started = false) {
  const h = harness(createBrowserHost)
  const me = h.connect()
  me.say({ t: "training", primary: "cramar", ...(started ? { from: station, unlocked: STATION_IDS.indexOf(station) + 1 } : {}) })
  for (let i = 0; i < 120 && !me.last("snap")?.you?.alive; i++) h.play(1)
  const you = me.last("joined")!.you
  const auto = new Trainee(you)
  for (let tick = 0; tick < 60 * 600; tick++) {
    const now = me.last("snap")!.training
    if (now?.tag === "station" && now.station === station) break
    for (const msg of auto.think(me.last("snap"))) me.say(msg)
    h.play(1)
  }
  expect(me.last("snap")!.training).toMatchObject({ tag: "station", station })
  let seq = me.last("snap")!.you!.seq
  /** Sends one input per tick, as a client does; returns every event those ticks brought. */
  const drive = (ticks: number, input: (tick: number) => Partial<PlayerInput>, until?: (events: GameEvent[]) => boolean) => {
    const events: GameEvent[] = []
    for (let i = 0; i < ticks; i++) {
      const snap = me.last("snap")!
      me.say({ t: "input", i: { ...IDLE_INPUT, weapon: snap.you!.arsenal.current, ...input(i), seq: ++seq, view: snap.tick } })
      const before = me.got.length
      h.play(1)
      for (const m of me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
      if (until?.(events)) break
    }
    return events
  }
  const snap = () => me.last("snap")!
  /** Walks along the street to a point and stops on it. */
  const walkTo = (to: readonly [number, number, number], ticks = 60 * 60) =>
    drive(ticks, () => alongTheStreet(snap().you!.body, to), () => {
      const b = snap().you!.body
      return Math.hypot(b.x - to[0], b.z - to[2]) < 0.4
    })
  return { ...h, me, you, drive, snap, walkTo }
}

const steps = (events: GameEvent[]) => events.flatMap((e) => (e.t === "training" && e.a === "step" ? [e.step] : []))

describe("station 8: pickups", () => {
  test("the player arrives hurt, without armour and low on ammunition, with every pickup there", () => {
    const { snap } = reach("pickups")
    const you = snap().you!
    expect(you.hp).toBeLessThan(MAX_HP)
    expect(you.armor).toBe(0)
    expect(you.arsenal.ammo.cramar.reserve).toBeLessThan(WEAPONS.cramar.reserve)
    expect(you.arsenal.bombs).toBe(0)
    expect(you.arsenal.mines).toBe(0)
    for (const i of Object.values(PICKUPS)) expect(snap().pickups[i]).toBe("1")
    expect(snap().training).toMatchObject({ station: "pickups", step: "frico", count: 0, target: 1 })
  })

  test("taking the frico heals, and completes its step", () => {
    const { snap, walkTo } = reach("pickups")
    const hp = snap().you!.hp
    const events = walkTo(at(PICKUPS.frico))
    expect(events).toContainEqual(expect.objectContaining({ t: "pick", k: "frico" }))
    expect(steps(events)).toEqual(["frico"])
    expect(snap().you!.hp).toBeGreaterThan(hp)
    expect(snap().training).toMatchObject({ station: "pickups", step: "gubane" })
  })

  test("a pickup taken before its step does not complete it", () => {
    const { snap, walkTo } = reach("pickups")
    // Around the frico, to the sgnape: taken, but the frico is the step.
    const sgnape = at(PICKUPS.sgnape)
    walkTo([at(PICKUPS.frico)[0] - 3, 0, -2])
    walkTo([sgnape[0], 0, -2])
    const events = walkTo(sgnape)
    expect(events).toContainEqual(expect.objectContaining({ t: "pick", k: "sgnape" }))
    expect(steps(events)).toEqual([])
    expect(snap().training).toMatchObject({ station: "pickups", step: "frico", count: 0 })
  })

  test("a pickup taken out of turn is back when its step comes, so the station never waits for it", () => {
    const { snap, walkTo, drive } = reach("pickups", true)
    const sgnape = at(PICKUPS.sgnape)
    walkTo([at(PICKUPS.frico)[0] - 3, 0, -2])
    walkTo([sgnape[0], 0, -2])
    walkTo(sgnape)
    expect(snap().pickups[PICKUPS.sgnape]).toBe("0")
    // Back around the gubane, to the frico.
    walkTo([sgnape[0], 0, -2])
    walkTo([at(PICKUPS.frico)[0] - 1, 0, -2])
    walkTo(at(PICKUPS.frico))
    const gubane = walkTo(at(PICKUPS.gubane))
    expect(steps(gubane)).toEqual(["gubane"])
    drive(4, () => ({}))
    expect(snap().training).toMatchObject({ station: "pickups", step: "sgnape", count: 0 })
    expect(snap().pickups[PICKUPS.sgnape]).toBe("1")
    // Back well before the pickup's own respawn time.
    const taken = walkTo(sgnape, 60 * 10)
    expect(steps(taken)).toEqual(["sgnape"])
  })

  test("each pickup in turn does what it does and completes its own step: gubane, sgnape, munizions", () => {
    const { snap, walkTo } = reach("pickups")
    walkTo(at(PICKUPS.frico))

    const gubane = walkTo(at(PICKUPS.gubane))
    expect(steps(gubane)).toEqual(["gubane"])
    expect(snap().you!.armor).toBeGreaterThan(0)

    const sgnape = walkTo(at(PICKUPS.sgnape))
    expect(steps(sgnape)).toEqual(["sgnape"])
    expect(snap().you!.arsenal.sgnape).toBeGreaterThan(0)

    const reserve = snap().you!.arsenal.ammo.cramar.reserve
    const munizions = walkTo(at(PICKUPS.munizions))
    expect(steps(munizions)).toEqual(["munizions"])
    expect(snap().you!.arsenal.ammo.cramar.reserve).toBeGreaterThan(reserve)
    expect(snap().you!.arsenal.bombs).toBeGreaterThan(0)
    expect(munizions).toContainEqual({ t: "training", a: "station", station: "pickups" })
  })
})

describe("station 9: the turret and the Lanciafrico", () => {
  const TURRET = SAGRE.turrets[SAGRE_STATIONS.turret.turret]
  const SEAT = turretRestSeat(TURRET)
  const LANCIAFRICO = at(SAGRE_STATIONS.turret.lanciafrico)
  /** Presses a button on every other tick, so that each press is a new one. */
  const tap = (button: number) => (i: number) => ({ yaw: TURRET.yaw, buttons: i % 2 === 0 ? button : 0 })

  test("mounted, overheated, dismounted: each completes only in its turn", () => {
    const { snap, drive, walkTo } = reach("turret")
    expect(snap().training).toMatchObject({ station: "turret", step: "mount" })
    walkTo(SEAT)
    const mounted = drive(10, tap(BUTTON.use))
    expect(mounted).toContainEqual(expect.objectContaining({ t: "turret", a: "on" }))
    expect(steps(mounted)).toEqual(["mount"])

    // Getting off before the mitraie overheats is not the dismount step.
    const early = drive(10, tap(BUTTON.use), (e) => e.some((x) => x.t === "turret" && x.a === "off"))
    expect(steps(early)).toEqual([])
    expect(snap().training).toMatchObject({ step: "overheat" })
    drive(10, tap(BUTTON.use), (e) => e.some((x) => x.t === "turret" && x.a === "on"))

    const hot = drive(60 * 10, () => ({ yaw: TURRET.yaw, buttons: BUTTON.fire }), (e) => e.some((x) => x.t === "turret" && x.a === "hot"))
    expect(hot).toContainEqual(expect.objectContaining({ t: "turret", a: "hot" }))
    expect(steps(hot)).toEqual(["overheat"])

    const off = drive(10, tap(BUTTON.use), (e) => e.some((x) => x.t === "turret" && x.a === "off"))
    expect(steps(off)).toEqual(["dismount"])
    expect(snap().training).toMatchObject({ step: "pickLanciafrico" })
  })

  test("the Lanciafrico: picked up, then fired", () => {
    const { snap, drive, walkTo } = reach("turret")
    walkTo(SEAT)
    drive(10, tap(BUTTON.use), (e) => e.some((x) => x.t === "turret" && x.a === "on"))
    drive(60 * 10, () => ({ yaw: TURRET.yaw, buttons: BUTTON.fire }), (e) => e.some((x) => x.t === "turret" && x.a === "hot"))
    drive(10, tap(BUTTON.use), (e) => e.some((x) => x.t === "turret" && x.a === "off"))
    expect(snap().you!.arsenal.launcher).toBe(false)

    const picked = walkTo(LANCIAFRICO)
    expect(picked).toContainEqual(expect.objectContaining({ t: "pick", k: "lanciafrico" }))
    expect(steps(picked)).toEqual(["pickLanciafrico"])
    expect(snap().you!.arsenal).toMatchObject({ launcher: true, current: "lanciafrico" })

    // One press, one frico: it is not automatic.
    const fired = drive(60 * 3, (i) => ({ ...tap(BUTTON.fire)(i), weapon: "lanciafrico" }), (e) => e.some((x) => x.t === "training" && x.a === "station"))
    expect(fired).toContainEqual(expect.objectContaining({ t: "launch", k: "frico" }))
    expect(steps(fired)).toEqual(["fireLanciafrico"])
    expect(fired).toContainEqual({ t: "training", a: "station", station: "turret" })
  })

  test("firing the weapon in hand before mounting completes nothing", () => {
    const { snap, drive } = reach("turret")
    expect(steps(drive(60 * 3, () => ({ buttons: BUTTON.fire })))).toEqual([])
    expect(snap().training).toMatchObject({ step: "mount", count: 0 })
  })
})

describe("the automatic player", () => {
  test("completes stations 8 and 9", () => {
    const { me, play, you } = reach("pickups")
    const trainee = new Trainee(you)
    const events: GameEvent[] = []
    for (let tick = 0; tick < 60 * 120; tick++) {
      for (const msg of trainee.think(me.last("snap"))) me.say(msg)
      const before = me.got.length
      play(1)
      for (const m of me.got.slice(before)) if (m.t === "snap") events.push(...m.ev.filter((e) => e.t === "training"))
      if (events.some((e) => e.t === "training" && e.a === "station" && e.station === "turret")) break
    }
    expect(steps(events)).toEqual(["frico", "gubane", "sgnape", "munizions", "mount", "overheat", "dismount", "pickLanciafrico", "fireLanciafrico"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "pickups" })
    expect(events).toContainEqual({ t: "training", a: "station", station: "turret" })
  })
})

describe("entering a station again", () => {
  test("restarting station 8 puts back the pickups already taken, and its first step from nothing", () => {
    const { me, snap, walkTo, drive } = reach("pickups", true)
    const hurt = snap().you!.hp
    walkTo(at(PICKUPS.frico))
    expect(snap().pickups[PICKUPS.frico]).toBe("0")
    expect(snap().training).toMatchObject({ step: "gubane" })
    me.say({ t: "goTo", station: "pickups" })
    drive(6, () => ({}))
    expect(snap().pickups[PICKUPS.frico]).toBe("1")
    expect(snap().training).toMatchObject({ station: "pickups", step: "frico", count: 0 })
    expect(snap().you!.hp).toBe(hurt)
    const again = walkTo(at(PICKUPS.frico))
    expect(steps(again)).toEqual(["frico"])
  })

  test("restarting station 9 puts the Lanciafrico back, and takes it out of the player's hands", () => {
    const LANCIAFRICO = at(SAGRE_STATIONS.turret.lanciafrico)
    const index = SAGRE_STATIONS.turret.lanciafrico
    const { me, snap, walkTo, drive } = reach("turret", true)
    walkTo(LANCIAFRICO)
    expect(snap().you!.arsenal.launcher).toBe(true)
    expect(snap().pickups[index]).toBe("0")
    me.say({ t: "goTo", station: "turret" })
    drive(6, () => ({}))
    expect(snap().pickups[index]).toBe("1")
    expect(snap().you!.arsenal.launcher).toBe(false)
    expect(snap().training).toMatchObject({ station: "turret", step: "mount", count: 0 })
  })
})
