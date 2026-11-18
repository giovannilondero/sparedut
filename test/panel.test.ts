/**
 * The casot's panel at Lagune di Maran, driven by inputs: tearing it off, the tear cancelled, the
 * Lanciafrico's slot, the strike, the slowdown and the panel back on the wall in the next match.
 * Players stand at fixed posts (the way the training places its bots), so no test walks the map.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import type { V3 } from "../shared/map.ts"
import { CASOT, LAND, MARAN } from "../shared/maps/maran.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { createSim, type Sim } from "../shared/sim/index.ts"
import { SHIELD_TICKS } from "../shared/sim/rules.ts"
import { PANEL_TEAR_TICKS, WEAPONS, type PrimaryId } from "../shared/weapons.ts"

let maran: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  maran = createPhysicsWorld(MARAN)
})

const panel = () => MARAN.panels![0]
const centre = () => {
  const p = panel()
  return { x: (p.min[0] + p.max[0]) / 2, z: (p.min[2] + p.max[2]) / 2 }
}
/** Facing the panel from inside the casot, a step from it. */
const FACING = 0
const inside = (d = 1.2): V3 => [centre().x, LAND, centre().z + d]
const outside = (d = 1.2): V3 => [centre().x, LAND, centre().z - d]

interface Member {
  readonly id: string
  readonly team?: "benandanti" | "malandanti"
  readonly primary?: PrimaryId
  readonly at: V3
  readonly yaw: number
  readonly hp?: number
  readonly bot?: boolean
}

/** A live match at Lagune di Maran with each member at its post, past the respawn shield. */
function match(members: Member[]) {
  const sim = createSim({ mode: "bataie", minutes: 5, seed: 3, physics: maran })
  for (const m of members) sim.join(m.id, m.id, m.team ?? "benandanti", m.bot ?? false, m.primary ?? "cramar", { at: m.at, yaw: m.yaw, hp: m.hp ?? 100 })
  sim.start(true)
  for (let i = 0; i < SHIELD_TICKS + 5; i++) sim.step()
  return sim
}

const me = (sim: Sim, id: string) => sim.view().players.find((p) => p.session === id)!
const seqs = new Map<string, number>()
/** One tick's command: standing (or walking towards `to`) with the given buttons and look. */
function command(sim: Sim, id: string, extra: Partial<PlayerInput> & { to?: readonly [number, number] } = {}): PlayerInput {
  const p = me(sim, id)
  const seq = (seqs.get(id) ?? 0) + 1
  seqs.set(id, seq)
  const { to, ...rest } = extra
  const walking = to !== undefined && Math.hypot(to[0] - p.body.x, to[1] - p.body.z) > 0.3
  return { ...IDLE_INPUT, seq, yaw: p.yaw, mz: 0, weapon: p.arsenal.current, view: sim.view().tick, ...(walking ? { mz: 1, yaw: Math.atan2(-(to[0] - p.body.x), -(to[1] - p.body.z)) } : {}), ...rest }
}
/** Runs `ticks` ticks with `id` sending `extra` each tick; returns the events. */
function hold(sim: Sim, id: string, ticks: number, extra: Partial<PlayerInput> & { to?: readonly [number, number] } = {}) {
  const events: GameEvent[] = []
  for (let i = 0; i < ticks; i++) {
    sim.input(id, command(sim, id, extra))
    events.push(...sim.step())
  }
  return events
}
const useHeld = { buttons: BUTTON.use, yaw: FACING }
const torn = (events: GameEvent[], id: string) => events.some((e) => e.t === "panel" && e.a === "torn" && e.s === id)

describe("tearing off the panel", () => {
  test("the panel is on the wall when a match starts", () => {
    const sim = match([{ id: "a", at: inside(), yaw: FACING }])
    expect(sim.view().panels).toEqual([{ tag: "wall" }])
  })

  test("holding use for about two seconds inside, close and facing it, tears it off and puts it in hand", () => {
    const sim = match([{ id: "a", at: inside(), yaw: FACING }])
    const early = hold(sim, "a", 90, useHeld)
    expect(torn(early, "a")).toBe(false)
    expect(sim.view().panels[0].tag).toBe("tearing")
    const late = hold(sim, "a", 60, useHeld)
    expect(torn(late, "a")).toBe(true)
    expect(sim.view().panels).toEqual([{ tag: "off" }])
    const a = me(sim, "a").arsenal
    expect(a.power).toBe("panel")
    expect(a.current).toBe("panel")
    expect(PANEL_TEAR_TICKS).toBeGreaterThanOrEqual(90)
    expect(PANEL_TEAR_TICKS).toBeLessThanOrEqual(150)
  })

  test("from outside the casot, from far inside, or looking away, holding use does nothing", () => {
    for (const [at, yaw] of [[outside(), Math.PI], [inside(4.5), FACING], [inside(), Math.PI]] as const) {
      const sim = match([{ id: "a", at, yaw }])
      const events = hold(sim, "a", 240, { buttons: BUTTON.use, yaw })
      expect(torn(events, "a")).toBe(false)
      expect(sim.view().panels).toEqual([{ tag: "wall" }])
      expect(me(sim, "a").arsenal.power).toBeNull()
    }
  })

  test("a tap does not tear it, however many times", () => {
    const sim = match([{ id: "a", at: inside(), yaw: FACING }])
    const events: GameEvent[] = []
    for (let i = 0; i < 20; i++) {
      events.push(...hold(sim, "a", 8, useHeld))
      events.push(...hold(sim, "a", 4, { yaw: FACING }))
    }
    expect(torn(events, "a")).toBe(false)
    expect(sim.view().panels).toEqual([{ tag: "wall" }])
  })

  test("letting go before the time is up cancels the tear, and it starts over", () => {
    const sim = match([{ id: "a", at: inside(), yaw: FACING }])
    hold(sim, "a", PANEL_TEAR_TICKS - 20, useHeld)
    hold(sim, "a", 1, { yaw: FACING })
    expect(sim.view().panels).toEqual([{ tag: "wall" }])
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS - 20, useHeld), "a")).toBe(false)
    expect(torn(hold(sim, "a", 30, useHeld), "a")).toBe(true)
  })

  test("moving away before the time is up cancels the tear, and it starts over", () => {
    const sim = match([{ id: "a", at: inside(), yaw: FACING }])
    hold(sim, "a", PANEL_TEAR_TICKS - 20, useHeld)
    const away = inside(4.5)
    hold(sim, "a", 90, { buttons: BUTTON.use, to: [away[0], away[2]] })
    expect(sim.view().panels).toEqual([{ tag: "wall" }])
    const back = inside()
    hold(sim, "a", 90, { to: [back[0], back[2]] })
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS - 20, useHeld), "a")).toBe(false)
    expect(torn(hold(sim, "a", 30, useHeld), "a")).toBe(true)
  })

  test("dying before the time is up cancels the tear, and it starts over", () => {
    // An enemy in the casot's far corner shoots the one tearing it.
    const sim = match([
      { id: "a", at: inside(), yaw: FACING, hp: 30 },
      { id: "b", team: "malandanti", at: [CASOT.maxX - 2, LAND, CASOT.maxZ - 2], yaw: 0 }
    ])
    hold(sim, "a", 60, useHeld)
    expect(sim.view().panels[0].tag).toBe("tearing")
    const events: GameEvent[] = []
    for (let i = 0; i < 120 && !events.some((e) => e.t === "kill" && e.v === "a"); i++) {
      const a = me(sim, "a").body
      const b = me(sim, "b").body
      sim.input("a", command(sim, "a", useHeld))
      sim.input("b", command(sim, "b", { yaw: Math.atan2(-(a.x - b.x), -(a.z - b.z)), pitch: -0.05, buttons: BUTTON.fire }))
      events.push(...sim.step())
    }
    expect(events.some((e) => e.t === "kill" && e.v === "a")).toBe(true)
    // The enemy lets go of the trigger (its last command would go on firing).
    sim.input("b", command(sim, "b", {}))
    hold(sim, "a", 1, useHeld)
    expect(sim.view().panels).toEqual([{ tag: "wall" }])
    // Back at the post: the tear starts from nothing.
    hold(sim, "a", 200, { yaw: FACING })
    expect(me(sim, "a").alive).toBe(true)
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS - 20, useHeld), "a")).toBe(false)
    expect(torn(hold(sim, "a", 30, useHeld), "a")).toBe(true)
  })

  test("a bot never tears it off", () => {
    const sim = match([{ id: "bot", at: inside(), yaw: FACING, bot: true }])
    const events = hold(sim, "bot", 300, useHeld)
    expect(torn(events, "bot")).toBe(false)
    expect(sim.view().panels).toEqual([{ tag: "wall" }])
  })
})

describe("the panel in the Lanciafrico's slot", () => {
  const LANCIAFRICO = MARAN.pickups.find((p) => p.kind === "lanciafrico")!.at

  test("a player holding the Lanciafrico cannot tear it off", () => {
    const sim = match([{ id: "a", at: [LANCIAFRICO[0], LAND, LANCIAFRICO[2]], yaw: FACING }])
    hold(sim, "a", 2)
    expect(me(sim, "a").arsenal.power).toBe("lanciafrico")
    const spot = inside()
    hold(sim, "a", 240, { to: [spot[0], spot[2]] })
    const events = hold(sim, "a", 240, useHeld)
    expect(torn(events, "a")).toBe(false)
    expect(sim.view().panels).toEqual([{ tag: "wall" }])
  })

  test("a player holding the panel does not take the Lanciafrico", () => {
    const sim = match([{ id: "a", at: inside(), yaw: FACING }])
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
    const events = hold(sim, "a", 300, { to: [LANCIAFRICO[0], LANCIAFRICO[2]] })
    expect(Math.hypot(me(sim, "a").body.x - LANCIAFRICO[0], me(sim, "a").body.z - LANCIAFRICO[2])).toBeLessThan(0.5)
    expect(events.some((e) => e.t === "pick" && e.k === "lanciafrico")).toBe(false)
    expect(me(sim, "a").arsenal.power).toBe("panel")
    expect(sim.view().pickups[MARAN.pickups.findIndex((p) => p.kind === "lanciafrico")]).toBe(true)
  })
})

describe("carrying the panel", () => {
  test("a strike deals the panel's damage, no faster than its rhythm, and a kill shows the panel as its cause", () => {
    const sim = match([
      { id: "a", at: inside(), yaw: FACING },
      { id: "b", team: "malandanti", at: inside(2.6), yaw: Math.PI, hp: 100 }
    ])
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
    hold(sim, "a", 30, { yaw: Math.PI })
    const strike = { yaw: Math.PI, pitch: -0.1, buttons: BUTTON.fire }
    const first = hold(sim, "a", 1, strike)
    expect(first.filter((e) => e.t === "hit" && e.a === "a" && e.v === "b").map((e) => e.t === "hit" && e.d)).toEqual([WEAPONS.panel.damage])
    expect(me(sim, "b").hp).toBe(100 - WEAPONS.panel.damage)
    // Pressing again and again before the rhythm allows: nothing more lands.
    const rushed: GameEvent[] = []
    for (let i = 0; i < WEAPONS.panel.cooldownTicks - 2; i++) rushed.push(...hold(sim, "a", 1, i % 2 === 0 ? strike : { yaw: Math.PI }))
    expect(rushed.some((e) => e.t === "hit" && e.a === "a")).toBe(false)
    hold(sim, "a", 3, { yaw: Math.PI })
    const second = hold(sim, "a", 1, strike)
    expect(second.some((e) => e.t === "kill" && e.k === "a" && e.v === "b" && e.w === "panel")).toBe(true)
  })

  test("the starting values: 70 damage, 45 ticks between strikes, 0.85 speed in hand", () => {
    expect(WEAPONS.panel.damage).toBe(70)
    expect(WEAPONS.panel.cooldownTicks).toBe(45)
    expect(WEAPONS.panel.moveScale).toBe(0.85)
    expect(WEAPONS.panel.cooldownTicks).toBeGreaterThan(WEAPONS.mescul.cooldownTicks)
    expect(WEAPONS.panel.damage).toBeGreaterThan(WEAPONS.mescul.damage)
  })

  test("its carrier is slower with it in hand than with the pistol", () => {
    const sim = match([{ id: "a", at: inside(), yaw: FACING }])
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
    const run = (weapon: "panel" | "mandi") => {
      hold(sim, "a", 40, { weapon, to: [44, 24] })
      const from = me(sim, "a").body
      hold(sim, "a", 1, { weapon, yaw: -Math.PI / 2, mz: 0 })
      const start = me(sim, "a").body
      hold(sim, "a", 30, { weapon, yaw: -Math.PI / 2, mz: 1 })
      const end = me(sim, "a").body
      hold(sim, "a", 30, { weapon, to: [from.x, from.z] })
      return Math.hypot(end.x - start.x, end.z - start.z)
    }
    const withPanel = run("panel")
    const withPistol = run("mandi")
    expect(withPanel / withPistol).toBeCloseTo(WEAPONS.panel.moveScale / WEAPONS.mandi.moveScale, 1)
    expect(withPanel).toBeLessThan(withPistol)
  })

  test("the carrier keeps it until they die; then it is gone for the match", () => {
    const sim = match([
      { id: "a", at: inside(), yaw: FACING, hp: 30 },
      { id: "b", team: "malandanti", at: [CASOT.maxX - 2, LAND, CASOT.maxZ - 2], yaw: 0 }
    ])
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
    const events: GameEvent[] = []
    for (let i = 0; i < 200 && !events.some((e) => e.t === "kill" && e.v === "a"); i++) {
      const a = me(sim, "a").body
      const b = me(sim, "b").body
      sim.input("a", command(sim, "a", { yaw: FACING }))
      sim.input("b", command(sim, "b", { yaw: Math.atan2(-(a.x - b.x), -(a.z - b.z)), pitch: -0.05, buttons: BUTTON.fire }))
      events.push(...sim.step())
    }
    expect(events.some((e) => e.t === "kill" && e.v === "a")).toBe(true)
    sim.input("b", command(sim, "b", {}))
    hold(sim, "a", 200, { yaw: FACING })
    expect(me(sim, "a").alive).toBe(true)
    expect(me(sim, "a").arsenal.power).toBeNull()
    expect(sim.view().panels).toEqual([{ tag: "off" }])
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 30, useHeld), "a")).toBe(false)
  })

  test("the next match puts the panel back on the wall and takes it from its carrier", () => {
    const sim = match([{ id: "a", at: inside(), yaw: FACING }])
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
    // The host ends the match (back to the Muster), then starts the next one.
    sim.start(true)
    hold(sim, "a", 10, { yaw: FACING })
    expect(sim.view().phase.tag).toBe("Muster")
    sim.start(true)
    hold(sim, "a", 10, { yaw: FACING })
    expect(sim.view().phase.tag).toBe("Live")
    expect(sim.view().panels).toEqual([{ tag: "wall" }])
    expect(me(sim, "a").arsenal.power).toBeNull()
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
  })
})
