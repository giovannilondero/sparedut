/**
 * Station 10 of the training, the medic, driven by protocol messages to the in-browser host as the
 * player's client drives it: the trainee is given the Cassele dal Miedi and heals a wounded
 * teammate to full health.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import { eyeHeight } from "../shared/movement.ts"
import { initPhysics } from "../shared/physics.ts"
import { FLAG_BIT, type SnapOther } from "../shared/protocol.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { MAX_HP } from "../shared/sim/rules.ts"
import { TO_RESTORE, WOUNDED_HP } from "../shared/training/stations/medic.ts"
import { harness } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"
import { alongTheStreet } from "./trainee/pickups.ts"

beforeAll(() => initPhysics())

const WOUNDED = SAGRE_STATIONS[9].wounded.at

/** A training on the in-browser host, played by the automatic player until the medic is the current station and the teammate is there. */
function atMedic() {
  const h = harness(createBrowserHost)
  const me = h.connect()
  me.say({ t: "training", primary: "cramar" })
  for (let i = 0; i < 120 && !me.last("snap")?.you?.alive; i++) h.play(1)
  const you = me.last("joined")!.you
  const auto = new Trainee(you)
  for (let tick = 0; tick < 60 * 600; tick++) {
    const now = me.last("snap")!.training
    if (now?.tag === "station" && now.station === "medic") break
    for (const msg of auto.think(me.last("snap"))) me.say(msg)
    h.play(1)
  }
  expect(me.last("snap")!.training).toMatchObject({ tag: "station", station: "medic" })
  const snap = () => me.last("snap")!
  /** The other player at the station: the wounded teammate, once alive. */
  const teammate = (): SnapOther | undefined => snap().players.find((p) => p.id !== you && p.f & FLAG_BIT.alive)
  for (let i = 0; i < 120 && !teammate(); i++) h.play(1)
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
  /** Walks along the street to `away` metres from the teammate, then holds the beam on their chest. */
  const heal = (away: number) => (): Partial<PlayerInput> => {
    const b = snap().you!.body
    const d = Math.hypot(WOUNDED[0] - b.x, WOUNDED[2] - b.z)
    if (d > away) return { ...alongTheStreet(b, WOUNDED), weapon: "miedi" }
    const yaw = Math.atan2(-(WOUNDED[0] - b.x), -(WOUNDED[2] - b.z))
    return { weapon: "miedi", yaw, pitch: Math.atan2(WOUNDED[1] + 1.1 - (b.y + eyeHeight(b)), d), buttons: BUTTON.fire }
  }
  return { ...h, me, you, snap, teammate, drive, heal }
}

const steps = (events: GameEvent[]) => events.flatMap((e) => (e.t === "training" && e.a === "step" ? [e.step] : []))

describe("station 10: the medic", () => {
  test("the player is given the Cassele dal Miedi and finds a wounded teammate at the station", () => {
    const { snap, teammate } = atMedic()
    const mate = teammate()
    expect(mate).toBeDefined()
    expect(mate!.hp).toBe(WOUNDED_HP)
    expect(Math.hypot(mate!.x - WOUNDED[0], mate!.z - WOUNDED[2])).toBeLessThan(0.5)
    expect(snap().you!.arsenal).toMatchObject({ primary: "miedi", current: "miedi" })
    // Lent for the station: the player's own primary (changed at the armoury) is still the one they come back with.
    expect(snap().you!.arsenal.nextPrimary).not.toBe("miedi")
    expect(snap().training).toMatchObject({ station: "medic", step: "heal", count: 0, target: TO_RESTORE })
  })

  test("the step shows how much health is left to restore as the beam heals the teammate", () => {
    const { snap, teammate, drive, heal, you } = atMedic()
    const counted = () => {
      const view = snap().training
      return view?.tag === "station" ? view.count : 0
    }
    const events = drive(60 * 10, heal(4), () => counted() >= 20)
    expect(events).toContainEqual(expect.objectContaining({ t: "heal", s: you }))
    const view = snap().training
    expect(view?.tag).toBe("station")
    if (view?.tag !== "station") return
    expect(view.step).toBe("heal")
    expect(view.count).toBeGreaterThan(0)
    expect(view.count).toBeLessThan(view.target)
    // What is left on the panel is what the teammate still lacks.
    expect(view.target - view.count).toBe(MAX_HP - teammate()!.hp)
    expect(steps(events)).toEqual([])
  })

  test("the step completes on the tick the teammate is back to full health", () => {
    const { snap, teammate, drive, heal } = atMedic()
    let hpAtStep = -1
    const events = drive(60 * 30, heal(4), (e) => {
      if (steps(e).length > 0 && hpAtStep < 0) hpAtStep = teammate()!.hp
      return hpAtStep >= 0
    })
    expect(steps(events)).toEqual(["heal"])
    expect(hpAtStep).toBe(MAX_HP)
    expect(events).toContainEqual({ t: "training", a: "station", station: "medic" })
    const restored = events.reduce((n, e) => n + (e.t === "heal" ? e.n : 0), 0)
    expect(restored).toBe(TO_RESTORE)
    expect(snap().training).not.toMatchObject({ station: "medic" })
  })

  test("nothing but the player's healing counts: standing away or firing elsewhere leaves the teammate hurt", () => {
    const { snap, teammate, drive } = atMedic()
    // Far from the teammate (beyond the medic's aura), the beam pointed at the street behind.
    const events = drive(60 * 5, () => ({ weapon: "miedi", yaw: Math.PI / 2, buttons: BUTTON.fire }))
    expect(events.filter((e) => e.t === "heal")).toEqual([])
    expect(steps(events)).toEqual([])
    expect(teammate()!.hp).toBe(WOUNDED_HP)
    expect(snap().training).toMatchObject({ station: "medic", step: "heal", count: 0 })
  })

  test("the teammate never fires", () => {
    const { snap, teammate, drive } = atMedic()
    const mate = teammate()!.id
    const events = drive(60 * 5, () => ({}))
    expect(events.filter((e) => (e.t === "shot" || e.t === "melee" || e.t === "launch") && e.s === mate)).toEqual([])
    expect(snap().you!.hp).toBe(MAX_HP)
  })
})

describe("the automatic player", () => {
  test("completes station 10", () => {
    const { me, play, you } = atMedic()
    const trainee = new Trainee(you)
    const events: GameEvent[] = []
    for (let tick = 0; tick < 60 * 60; tick++) {
      for (const msg of trainee.think(me.last("snap"))) me.say(msg)
      const before = me.got.length
      play(1)
      for (const m of me.got.slice(before)) if (m.t === "snap") events.push(...m.ev.filter((e) => e.t === "training"))
      if (events.some((e) => e.t === "training" && e.a === "station" && e.station === "medic")) break
    }
    expect(steps(events)).toEqual(["heal"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "medic" })
  })
})
