/**
 * The casot's panel at Lagune di Maran, driven by inputs: tearing it off, the tear cancelled, the
 * Lanciafrico's slot, the strike, the slowdown, the shield (what it blocks from the front and lets
 * through from behind), its breaking, its fall when its carrier dies and who takes it from the
 * ground, and the panel back on the wall, whole, in the next match.
 * Players stand at fixed posts (the way the training places its bots), so no test walks the map.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { CASOT, LAND, MARAN } from "../shared/maps/maran.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { createSim, type Sim } from "../shared/sim/index.ts"
import { SHIELD_TICKS } from "../shared/sim/rules.ts"
import { PANEL_HP, PANEL_TEAR_TICKS, RAIBL_MINE, WEAPONS, type PrimaryId } from "../shared/weapons.ts"
import { turretRestSeat, type V3 } from "../shared/map.ts"
import { nearestNode, navGraph, route } from "../server/nav.ts"

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
    expect(sim.view().panels).toEqual([{ tag: "carried", by: "a", hp: PANEL_HP }])
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
    expect(sim.view().pickups[MARAN.pickups.findIndex((p) => p.kind === "lanciafrico")]).toBe("up")
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

  test("the carrier keeps it until they die; then it lies where they died and the wall stays open", () => {
    // Shot from behind (the enemy in the casot's far corner, the carrier facing the wall): no block.
    const sim = match([
      { id: "a", at: inside(), yaw: FACING, hp: 30 },
      { id: "b", team: "malandanti", at: [CASOT.maxX - 2, LAND, CASOT.maxZ - 2], yaw: 0 }
    ])
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
    const events: GameEvent[] = []
    let died = me(sim, "a").body
    for (let i = 0; i < 200 && !events.some((e) => e.t === "kill" && e.v === "a"); i++) {
      died = me(sim, "a").body
      sim.input("a", command(sim, "a", { yaw: FACING }))
      sim.input("b", command(sim, "b", { ...aimAt(sim, "b", "a"), buttons: BUTTON.fire }))
      events.push(...sim.step())
    }
    expect(events.some((e) => e.t === "kill" && e.v === "a")).toBe(true)
    expect(events.some((e) => e.t === "panel" && e.a === "blocked")).toBe(false)
    sim.input("b", command(sim, "b", {}))
    hold(sim, "a", 2, { yaw: FACING })
    expect(me(sim, "a").alive).toBe(false)
    expect(me(sim, "a").arsenal.power).toBeNull()
    const lying = sim.view().panels[0]
    if (lying.tag !== "lying") throw new Error(`the panel is ${lying.tag}`)
    expect(lying.hp).toBe(PANEL_HP)
    expect(Math.hypot(lying.at[0] - died.x, lying.at[2] - died.z)).toBeLessThan(0.5)
    expect(lying.at[1]).toBeCloseTo(LAND, 1)
    // Back at the post, where it fell: taken again, with nothing on the wall to tear.
    hold(sim, "a", 200, { yaw: FACING })
    expect(me(sim, "a").alive).toBe(true)
    expect(sim.view().panels[0].tag).toBe("carried")
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

/** Where the panel's carrier stands in the casot, clear of the pot and the step, to be hit from any side. */
const SPOT = [44, 27] as const
/** Yaw that faces from `from` towards `to`, seen from above (yaw 0 faces north, -z). */
const yawTo = (from: { readonly x: number; readonly z: number }, to: { readonly x: number; readonly z: number }) => Math.atan2(-(to.x - from.x), -(to.z - from.z))
/** A point `d` metres from the carrier's spot along `yaw` (yaw 0 is north). */
const around = (yaw: number, d: number): V3 => [SPOT[0] - Math.sin(yaw) * d, LAND, SPOT[1] - Math.cos(yaw) * d]
/** The look of `id` at the chest of `target`. */
function aimAt(sim: Sim, id: string, target: string) {
  const a = me(sim, id).body
  const b = me(sim, target).body
  return { yaw: yawTo(a, b), pitch: Math.atan2(b.y + 1 - (a.y + 1.6), Math.hypot(b.x - a.x, b.z - a.z)) }
}
const carried = (sim: Sim) => sim.view().panels[0]
/** The host ends the match (back to the Muster) and starts the next one. */
function nextMatch(sim: Sim) {
  sim.start(true)
  for (let i = 0; i < 10; i++) sim.step()
  expect(sim.view().phase.tag).toBe("Muster")
  sim.start(true)
  for (let i = 0; i < SHIELD_TICKS + 5; i++) sim.step()
  expect(sim.view().phase.tag).toBe("Live")
}
/**
 * "a" tears the panel off, walks to `SPOT` and stands there looking along `yaw`, with the panel in
 * hand (or `weapon`); `others` wait at their posts meanwhile.
 */
function carrying(others: Member[], yaw: number, weapon: "panel" | "mandi" = "panel") {
  const sim = match([{ id: "a", at: inside(), yaw: FACING }, ...others])
  expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
  hold(sim, "a", 150, { to: SPOT })
  hold(sim, "a", 40, { yaw, weapon })
  expect(me(sim, "a").arsenal.current).toBe(weapon)
  return sim
}
/** Every member sends `each(id)` for `ticks` ticks; returns the events. */
function all(sim: Sim, ticks: number, each: (id: string) => Partial<PlayerInput>) {
  const events: GameEvent[] = []
  for (let i = 0; i < ticks; i++) {
    for (const p of sim.view().players) sim.input(p.session, command(sim, p.session, each(p.session)))
    events.push(...sim.step())
  }
  return events
}

type Attack = "shot" | "melee" | "explosion"
/**
 * An enemy hits the carrier once, from `side` (an angle from the carrier's look: 0 is straight
 * ahead) with `attack`: a Cramar shot, a Mescul strike, or a Raibl mine dropped between them that
 * goes off once armed. Returns how much the carrier and the panel each lost.
 */
function attackFrom(side: number, attack: Attack, weapon: "panel" | "mandi" = "panel") {
  const look = 0.3
  const d = attack === "shot" ? 3.5 : attack === "melee" ? 1.4 : 2.6
  const sim = carrying([{ id: "b", team: "malandanti", at: around(look + side, d), yaw: look + side + Math.PI }], look, weapon)
  const hp = me(sim, "a").hp
  const panelHp = () => {
    const p = carried(sim)
    return p.tag === "carried" || p.tag === "lying" ? p.hp : 0
  }
  const still = { yaw: look, weapon }
  const events: GameEvent[] = []
  if (attack === "shot") events.push(...all(sim, 1, (id) => (id === "b" ? { ...aimAt(sim, "b", "a"), buttons: BUTTON.fire } : still)))
  if (attack === "melee") {
    all(sim, 30, (id) => (id === "b" ? { ...aimAt(sim, "b", "a"), weapon: "mescul" } : still))
    events.push(...all(sim, 1, (id) => (id === "b" ? { ...aimAt(sim, "b", "a"), weapon: "mescul", buttons: BUTTON.fire } : still)))
  }
  if (attack === "explosion") {
    events.push(...all(sim, 1, (id) => (id === "b" ? { ...aimAt(sim, "b", "a"), buttons: BUTTON.mine } : still)))
    for (let i = 0; i < RAIBL_MINE.armTicks + 30 && !events.some((e) => e.t === "boom"); i++) events.push(...all(sim, 1, (id) => (id === "b" ? aimAt(sim, "b", "a") : still)))
    expect(events.some((e) => e.t === "boom" && e.k === "mine")).toBe(true)
  }
  events.push(...all(sim, 2, (id) => (id === "b" ? aimAt(sim, "b", "a") : still)))
  expect(events.some((e) => (e.t === "hit" && e.v === "a") || (e.t === "panel" && e.a === "blocked"))).toBe(true)
  return { carrier: hp - me(sim, "a").hp, panel: PANEL_HP - panelHp() }
}

describe("the panel as a shield", () => {
  test("a shot from the front takes health from the panel and none from its carrier", () => {
    const sim = carrying([{ id: "b", team: "malandanti", at: around(0, 3.5), yaw: Math.PI }], 0)
    const hp = me(sim, "a").hp
    expect(carried(sim)).toEqual({ tag: "carried", by: "a", hp: PANEL_HP })
    all(sim, 1, (id) => (id === "b" ? { ...aimAt(sim, "b", "a"), buttons: BUTTON.fire } : { yaw: 0 }))
    all(sim, 2, (id) => (id === "b" ? aimAt(sim, "b", "a") : { yaw: 0 }))
    expect(me(sim, "a").hp).toBe(hp)
    expect(carried(sim)).toEqual({ tag: "carried", by: "a", hp: PANEL_HP - WEAPONS.cramar.damage })
  })

  test("the Motosee's teeth: from the front the panel takes them, from behind its carrier does", () => {
    const cut = (side: number) => {
      const look = 0.3
      const sim = carrying([{ id: "b", team: "malandanti", primary: "motosee", at: around(look + side, 1.4), yaw: look + side + Math.PI }], look)
      const hp = me(sim, "a").hp
      all(sim, WEAPONS.motosee.spinTicks + 20, (id) => (id === "b" ? { ...aimAt(sim, "b", "a"), weapon: "motosee", buttons: BUTTON.fire } : { yaw: look, weapon: "panel" }))
      const p = carried(sim)
      // Cut down from behind, the carrier drops the panel with the health it had.
      return { carrier: hp - me(sim, "a").hp, panel: PANEL_HP - (p.tag === "carried" || p.tag === "lying" ? p.hp : 0) }
    }
    const front = cut(0)
    expect(front.carrier).toBe(0)
    expect(front.panel).toBeGreaterThan(0)
    const behind = cut(Math.PI)
    expect(behind.carrier).toBeGreaterThan(0)
    expect(behind.panel).toBe(0)
  })

  for (const attack of ["shot", "melee", "explosion"] as const) {
    test(`${attack}: from the front, and a little to either side, the panel takes it all`, () => {
      for (const side of [0, 0.6, -0.6]) {
        const lost = attackFrom(side, attack)
        expect(lost.carrier).toBe(0)
        expect(lost.panel).toBeGreaterThan(0)
      }
    })

    test(`${attack}: from behind or from the side the carrier is hurt and the panel is not`, () => {
      for (const side of [Math.PI, Math.PI / 2, -Math.PI / 2, 2.4]) {
        const lost = attackFrom(side, attack)
        expect(lost.carrier).toBeGreaterThan(0)
        expect(lost.panel).toBe(0)
      }
    })

    test(`${attack}: with another weapon in hand the panel blocks nothing, even from the front`, () => {
      const lost = attackFrom(0, attack, "mandi")
      expect(lost.carrier).toBeGreaterThan(0)
      expect(lost.panel).toBe(0)
    })
  }
})

describe("the panel at a turret", () => {
  /** The village turret, out on the land: its seat, and a point in front of its gun. */
  const TURRET_SPOT = MARAN.turrets[1]
  const SEAT = turretRestSeat(TURRET_SPOT)
  const AHEAD: V3 = [TURRET_SPOT.at[0] - Math.sin(TURRET_SPOT.yaw) * 4, LAND, TURRET_SPOT.at[2] - Math.cos(TURRET_SPOT.yaw) * 4]

  test("seated at a turret its carrier fires the mitraie, and the panel blocks nothing, even from the front", () => {
    // "c" cuts the casot's door down from outside; "b" waits in front of the turret's gun.
    const sim = match([
      { id: "a", at: inside(), yaw: FACING },
      { id: "c", primary: "motosee", at: [CASOT.minX - 1, LAND, 27], yaw: -Math.PI / 2 },
      { id: "b", team: "malandanti", at: AHEAD, yaw: TURRET_SPOT.yaw + Math.PI }
    ])
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
    for (let i = 0; i < 600 && sim.view().doors[0] > 0; i++) all(sim, 1, (id) => (id === "c" ? { yaw: -Math.PI / 2, weapon: "motosee", buttons: BUTTON.fire } : {}))
    expect(sim.view().doors[0]).toBeLessThanOrEqual(0)
    // Out of the door and along the bots' paths to the turret's seat.
    const graph = navGraph(maran)
    const doorway: V3 = [CASOT.minX - 2, LAND, 27]
    hold(sim, "a", 120, { to: [CASOT.minX + 1.2, 27] })
    hold(sim, "a", 120, { to: [doorway[0], doorway[2]] })
    const from = nearestNode(graph, { x: doorway[0], y: doorway[1], z: doorway[2] })
    const path = route(graph, from, nearestNode(graph, { x: SEAT[0], y: SEAT[1], z: SEAT[2] }))
    for (const n of path) hold(sim, "a", 300, { to: [graph.points[n][0], graph.points[n][2]] })
    hold(sim, "a", 120, { to: [SEAT[0], SEAT[2]] })
    hold(sim, "a", 1, { buttons: BUTTON.use })
    expect(sim.view().turrets[1].gunner).toBe("a")
    expect(me(sim, "a").arsenal.current).toBe("panel")
    hold(sim, "a", 30, { yaw: TURRET_SPOT.yaw })
    const hp = me(sim, "a").hp
    const panelHp = carried(sim)
    all(sim, 1, (id) => (id === "b" ? { ...aimAt(sim, "b", "a"), buttons: BUTTON.fire } : id === "a" ? { yaw: TURRET_SPOT.yaw } : {}))
    all(sim, 2, (id) => (id === "b" ? aimAt(sim, "b", "a") : id === "a" ? { yaw: TURRET_SPOT.yaw } : {}))
    expect(me(sim, "a").hp).toBeLessThan(hp)
    expect(carried(sim)).toEqual(panelHp)
  })
})

describe("the panel breaks", () => {
  test("at zero it breaks: its carrier no longer has it, is told, and is not hurt by what broke it", () => {
    const sim = carrying([{ id: "b", team: "malandanti", at: around(0, 3.5), yaw: Math.PI }], 0)
    const hp = me(sim, "a").hp
    const events: GameEvent[] = []
    for (let i = 0; i < 600 && !events.some((e) => e.t === "panel" && e.a === "broken"); i++) {
      events.push(...all(sim, 1, (id) => (id === "b" ? { ...aimAt(sim, "b", "a"), buttons: BUTTON.fire } : { yaw: 0 })))
    }
    expect(events.filter((e) => e.t === "panel" && e.a === "broken")).toEqual([{ t: "panel", i: 0, s: "a", a: "broken" }])
    // As many shots as 300 takes, all of them on the panel.
    expect(events.filter((e) => e.t === "shot").length).toBe(Math.ceil(PANEL_HP / WEAPONS.cramar.damage))
    expect(me(sim, "a").hp).toBe(hp)
    expect(sim.view().panels).toEqual([{ tag: "broken" }])
    // Slot 3 is free again (standing by the Lanciafrico, the carrier may already have taken it).
    const a = me(sim, "a").arsenal
    expect(a.power).not.toBe("panel")
    expect(a.current).not.toBe("panel")
  })

  test("a broken panel does not come back in that match, not even after its carrier dies", () => {
    const sim = carrying([{ id: "b", team: "malandanti", at: around(0, 3.5), yaw: Math.PI }], 0)
    const events: GameEvent[] = []
    // Broken, then the carrier shot down.
    for (let i = 0; i < 900 && !events.some((e) => e.t === "kill" && e.v === "a"); i++) {
      events.push(...all(sim, 1, (id) => (id === "b" ? { ...aimAt(sim, "b", "a"), buttons: BUTTON.fire } : { yaw: 0, weapon: me(sim, "a").arsenal.current })))
    }
    expect(events.some((e) => e.t === "panel" && e.a === "broken")).toBe(true)
    expect(events.some((e) => e.t === "kill" && e.v === "a")).toBe(true)
    all(sim, 240, (id) => (id === "a" ? useHeld : {}))
    expect(me(sim, "a").alive).toBe(true)
    expect(sim.view().panels).toEqual([{ tag: "broken" }])
    expect(me(sim, "a").arsenal.power).toBeNull()
  })

  test("the next match puts a broken panel back on the wall, whole", () => {
    const sim = carrying([{ id: "b", team: "malandanti", at: around(0, 3.5), yaw: Math.PI }], 0)
    const events: GameEvent[] = []
    for (let i = 0; i < 600 && !events.some((e) => e.t === "panel" && e.a === "broken"); i++) {
      events.push(...all(sim, 1, (id) => (id === "b" ? { ...aimAt(sim, "b", "a"), buttons: BUTTON.fire } : { yaw: 0 })))
    }
    expect(sim.view().panels).toEqual([{ tag: "broken" }])
    nextMatch(sim)
    expect(sim.view().panels).toEqual([{ tag: "wall" }])
    hold(sim, "a", 200, { to: [inside()[0], inside()[2]] })
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
    expect(carried(sim)).toEqual({ tag: "carried", by: "a", hp: PANEL_HP })
  })

  test("the starting value: 300", () => {
    expect(PANEL_HP).toBe(300)
  })
})

describe("the panel falls when its carrier dies", () => {
  /** Where the panel is torn off and its carrier dies. */
  const DEATH = inside()
  /** The enemy, in the casot's north-east corner. */
  const ENEMY: V3 = [49, LAND, 23]
  /**
   * "a" tears the panel off and faces the enemy, which shoots it on the panel for a while; then "a"
   * turns its back and is shot down. `others` wait at their posts. Returns the sim two ticks after
   * the death, with the panel's health just before it.
   */
  function fallen(others: Member[]) {
    const sim = match([{ id: "a", at: DEATH, yaw: FACING, hp: 40 }, { id: "b", team: "malandanti", at: ENEMY, yaw: 0 }, ...others])
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
    const facing = (id: string) => (id === "b" ? { ...aimAt(sim, "b", "a"), buttons: BUTTON.fire } : id === "a" ? { ...aimAt(sim, "a", "b"), pitch: 0 } : {})
    all(sim, 40, facing)
    all(sim, 5, (id) => (id === "b" ? aimAt(sim, "b", "a") : id === "a" ? { ...aimAt(sim, "a", "b"), pitch: 0 } : {}))
    const before = carried(sim)
    if (before.tag !== "carried") throw new Error(`the panel is ${before.tag}`)
    expect(before.hp).toBeLessThan(PANEL_HP)
    const away = aimAt(sim, "a", "b").yaw + Math.PI
    const events: GameEvent[] = []
    for (let i = 0; i < 300 && !events.some((e) => e.t === "kill" && e.v === "a"); i++) events.push(...all(sim, 1, (id) => (id === "b" ? { ...aimAt(sim, "b", "a"), buttons: BUTTON.fire } : id === "a" ? { yaw: away } : {})))
    expect(events.some((e) => e.t === "kill" && e.v === "a")).toBe(true)
    all(sim, 2, () => ({}))
    return { sim, hp: before.hp }
  }
  /** `id` walks onto the fallen panel and stays there a while; returns the events. */
  const walkOver = (sim: Sim, id: string) => hold(sim, id, 90, { to: [DEATH[0], DEATH[2]] })

  test("it lies where its carrier died, with the health it had", () => {
    const { sim, hp } = fallen([])
    const lying = carried(sim)
    if (lying.tag !== "lying") throw new Error(`the panel is ${lying.tag}`)
    expect(lying.hp).toBe(hp)
    expect(Math.hypot(lying.at[0] - DEATH[0], lying.at[2] - DEATH[2])).toBeLessThan(0.6)
    expect(me(sim, "a").arsenal.power).toBeNull()
  })

  test("the first player to walk over it with slot 3 free takes it, with that health, in hand", () => {
    const { sim, hp } = fallen([{ id: "c", at: [43, LAND, 29], yaw: 0 }])
    const events = walkOver(sim, "c")
    expect(events.filter((e) => e.t === "panel" && e.a === "taken")).toEqual([{ t: "panel", i: 0, s: "c", a: "taken" }])
    expect(carried(sim)).toEqual({ tag: "carried", by: "c", hp })
    expect(me(sim, "c").arsenal.power).toBe("panel")
    expect(me(sim, "c").arsenal.current).toBe("panel")
  })

  test("a player who has the Lanciafrico walks over it and leaves it", () => {
    const LANCIAFRICO = MARAN.pickups.find((p) => p.kind === "lanciafrico")!.at
    const { sim } = fallen([{ id: "d", at: [LANCIAFRICO[0], LAND, LANCIAFRICO[2]], yaw: 0 }])
    expect(me(sim, "d").arsenal.power).toBe("lanciafrico")
    const events = walkOver(sim, "d")
    expect(Math.hypot(me(sim, "d").body.x - DEATH[0], me(sim, "d").body.z - DEATH[2])).toBeLessThan(0.5)
    expect(events.some((e) => e.t === "panel" && e.a === "taken")).toBe(false)
    expect(carried(sim).tag).toBe("lying")
    expect(me(sim, "d").arsenal.power).toBe("lanciafrico")
  })

  test("the next match puts a fallen panel back on the wall, whole", () => {
    const { sim } = fallen([])
    expect(carried(sim).tag).toBe("lying")
    nextMatch(sim)
    expect(sim.view().panels).toEqual([{ tag: "wall" }])
    hold(sim, "a", 200, { yaw: FACING })
    expect(torn(hold(sim, "a", PANEL_TEAR_TICKS + 5, useHeld), "a")).toBe(true)
    expect(carried(sim)).toEqual({ tag: "carried", by: "a", hp: PANEL_HP })
  })

  test("a bot walks over it and leaves it", () => {
    const { sim } = fallen([{ id: "bot", at: [43, LAND, 29], yaw: 0, bot: true }])
    const events = walkOver(sim, "bot")
    expect(Math.hypot(me(sim, "bot").body.x - DEATH[0], me(sim, "bot").body.z - DEATH[2])).toBeLessThan(0.5)
    expect(events.some((e) => e.t === "panel" && e.a === "taken")).toBe(false)
    expect(carried(sim).tag).toBe("lying")
    expect(me(sim, "bot").arsenal.power).toBeNull()
  })
})
