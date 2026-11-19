/**
 * Classes: the primary decides its player's health and base speed, driven through the simulation's
 * inputs and read through its view and events.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { Predictor } from "../client/predict.ts"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { GLEMONE } from "../shared/maps/glemone.ts"
import { MOVE } from "../shared/movement.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { createSim, type Sim } from "../shared/sim/index.ts"
import { MAX_ARMOR, SHIELD_TICKS, speedScale } from "../shared/sim/rules.ts"
import { CLASSES, MEDIC_AURA, PRIMARIES, WEAPONS, type PrimaryId, type WeaponId } from "../shared/weapons.ts"

let physics: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  physics = createPhysicsWorld(GLEMONE)
})

/** A match under way, with players spawned and past their spawn protection. */
function match(players: [id: string, team: "benandanti" | "malandanti", primary: PrimaryId][]) {
  const sim = createSim({ mode: "bataie", minutes: 10, seed: 11, physics })
  for (const [id, team, primary] of players) sim.join(id, id, team, false, primary)
  sim.start(true)
  for (let i = 0; i < SHIELD_TICKS + 5; i++) sim.step()
  return sim
}

let seq = 0
const me = (sim: Sim, id: string) => sim.view().players.find((p) => p.session === id)!
/** A command heading towards (x, z); standing still once there. */
function toward(sim: Sim, id: string, x: number, z: number, extra: Partial<PlayerInput> = {}): PlayerInput {
  const p = me(sim, id)
  const close = Math.hypot(x - p.body.x, z - p.body.z) < 0.6
  return { ...IDLE_INPUT, seq: ++seq, mz: close ? 0 : 1, yaw: Math.atan2(-(x - p.body.x), -(z - p.body.z)), weapon: p.arsenal.current, view: sim.view().tick, ...extra }
}
const stand = (sim: Sim, id: string, extra: Partial<PlayerInput> = {}) => toward(sim, id, me(sim, id).body.x, me(sim, id).body.z, extra)
/** Walks the points in order until at the last one; the others stand still meanwhile. Returns the events. */
function walk(sim: Sim, id: string, route: [number, number][], others: string[] = [], maxTicks = 3000) {
  const events: GameEvent[] = []
  for (let i = 0; i < maxTicks; i++) {
    const p = me(sim, id)
    while (route.length > 1 && Math.hypot(route[0][0] - p.body.x, route[0][1] - p.body.z) < 1) route.shift()
    if (route.length === 1 && Math.hypot(route[0][0] - p.body.x, route[0][1] - p.body.z) < 0.6) return events
    sim.input(id, toward(sim, id, route[0][0], route[0][1]))
    for (const o of others) sim.input(o, stand(sim, o))
    events.push(...sim.step())
  }
  throw new Error(`${id} did not get to ${route[0]} (at ${me(sim, id).body.x.toFixed(1)}, ${me(sim, id).body.y.toFixed(1)}, ${me(sim, id).body.z.toFixed(1)})`)
}
/** Out of the Duomo, if spawned inside it, onto the sagrato at (15, -40), with a clear way south. */
const toSagrato = (sim: Sim, id: string): [number, number][] => {
  const b = me(sim, id).body
  return b.z < -62 && Math.abs(b.x) < 14 ? [[0, -70], [0, -58], [15, -40]] : [[15, -40]]
}
/** From the sagrato down to the frico on the east terrace. */
const TO_FRICO: [number, number][] = [[3, -36], [3, -4], [25, -4], [25, 0]]
/** From the sagrato to the lanciafrico, and back. */
const TO_LANCIAFRICO: [number, number][] = [[3, -36], [3, -2], [9, -2]]
const BACK_TO_SAGRATO: [number, number][] = [[3, -2], [3, -36], [15, -40]]
/** From the sagrato to both gubane, up the alleys beside Via Bini's porticoes. */
const TO_GUBANE: [number, number][] = [[3, -36], [3, -4], [25, -4], [25, -15], [25, -4], [-23, -4], [-23, -15]]

/** The player drops a bombe di sgnape at their own feet and waits for it: wounded, not dead. */
function wound(sim: Sim, id: string, others: string[] = []) {
  for (let i = 0; i < 200; i++) {
    sim.input(id, stand(sim, id, { pitch: -1.5, buttons: i === 0 ? BUTTON.bomb : 0 }))
    for (const o of others) sim.input(o, stand(sim, o))
    sim.step()
  }
  const hurt = me(sim, id)
  expect(hurt.alive).toBe(true)
  expect(hurt.hp).toBeLessThan(CLASSES[hurt.arsenal.primary].hp)
}

/** Horizontal speed (m/s) walking south from the sagrato with `weapon` in hand, once up to speed. */
function measuredSpeed(sim: Sim, id: string, weapon: WeaponId) {
  walk(sim, id, toSagrato(sim, id))
  const go = () => {
    sim.input(id, { ...IDLE_INPUT, seq: ++seq, mz: 1, yaw: Math.PI, weapon, view: sim.view().tick })
    sim.step()
  }
  for (let i = 0; i < 45; i++) go()
  const from = me(sim, id).body
  for (let i = 0; i < 30; i++) go()
  const to = me(sim, id).body
  expect(me(sim, id).arsenal.current).toBe(weapon)
  return Math.hypot(to.x - from.x, to.z - from.z) * 2
}

describe("health", () => {
  for (const primary of PRIMARIES)
    test(`a ${primary} player spawns, and respawns, with the ${primary}'s health`, () => {
      const sim = match([["a", "benandanti", primary]])
      expect(me(sim, "a").hp).toBe(CLASSES[primary].hp)
      // Changing team costs a life: the respawn on the other side comes back whole.
      sim.team("a", "malandanti")
      sim.step()
      expect(me(sim, "a").alive).toBe(false)
      for (let i = 0; i < 120 && !me(sim, "a").alive; i++) sim.step()
      expect(me(sim, "a").hp).toBe(CLASSES[primary].hp)
    })

  test("the classes' health is not all the same: the Mulin has the most, the Cjampanili the least", () => {
    const hp = PRIMARIES.map((p) => CLASSES[p].hp)
    expect(Math.max(...hp)).toBe(CLASSES.mulin.hp)
    expect(Math.min(...hp)).toBe(CLASSES.cjampanili.hp)
    expect(CLASSES.mulin.hp).toBeGreaterThan(CLASSES.cramar.hp)
  })

  test("a frico pickup heals a Mulin above a Cramâr's health, and up to the Mulin's and no further", () => {
    const sim = match([["a", "benandanti", "mulin"]])
    walk(sim, "a", toSagrato(sim, "a"))
    wound(sim, "a")
    const wounded = me(sim, "a").hp
    const events = walk(sim, "a", [...TO_FRICO])
    expect(events.some((e) => e.t === "pick" && e.s === "a" && e.k === "frico")).toBe(true)
    expect(me(sim, "a").hp).toBe(Math.min(CLASSES.mulin.hp, wounded + 40))
    expect(me(sim, "a").hp).toBeGreaterThan(CLASSES.cramar.hp)
  })

  test("a Miedi at its own full health leaves a frico pickup where it is", () => {
    const sim = match([["a", "benandanti", "miedi"]])
    walk(sim, "a", toSagrato(sim, "a"))
    expect(me(sim, "a").hp).toBe(CLASSES.miedi.hp)
    const events = walk(sim, "a", [...TO_FRICO])
    expect(events.some((e) => e.t === "pick" && e.k === "frico")).toBe(false)
    expect(me(sim, "a").hp).toBe(CLASSES.miedi.hp)
  })

  test("the medic's aura heals the Miedi up to its own health and stops there, at the same rate as before", () => {
    const sim = match([["medi", "benandanti", "miedi"]])
    walk(sim, "medi", toSagrato(sim, "medi"))
    wound(sim, "medi")
    const from = me(sim, "medi").hp
    const heals: number[] = []
    for (let i = 0; i < 60 * 60; i++) {
      sim.input("medi", stand(sim, "medi"))
      for (const e of sim.step()) if (e.t === "heal" && e.v === "medi") heals.push(e.n)
    }
    expect(me(sim, "medi").hp).toBe(CLASSES.miedi.hp)
    // Self-heals are not announced; health rises one point every `everyTicks`, so a minute heals at most this.
    expect(CLASSES.miedi.hp - from).toBeLessThanOrEqual((60 * 60) / MEDIC_AURA.everyTicks)
    expect(MEDIC_AURA).toEqual({ radius: 6, everyTicks: 30, amount: 1 })
  })

  test("the Miedi's beam and aura heal a Mulin teammate past a Cramâr's health, up to the Mulin's and no further", () => {
    const sim = match([["medi", "benandanti", "miedi"], ["feri", "benandanti", "mulin"]])
    walk(sim, "feri", toSagrato(sim, "feri"), ["medi"])
    wound(sim, "feri", ["medi"])
    const target = me(sim, "feri").body
    walk(sim, "medi", [...toSagrato(sim, "medi").slice(0, -1), [target.x, target.z + 3]], ["feri"])
    const healed: number[] = []
    for (let i = 0; i < 60 * 20; i++) {
      const a = me(sim, "medi").body
      const b = me(sim, "feri").body
      const aim = { yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)), pitch: Math.atan2(b.y + 1.1 - (a.y + 1.6), Math.hypot(b.x - a.x, b.z - a.z)) }
      sim.input("medi", stand(sim, "medi", { ...aim, weapon: "miedi", buttons: BUTTON.fire }))
      sim.input("feri", stand(sim, "feri"))
      for (const e of sim.step()) if (e.t === "heal" && e.v === "feri") healed.push(i)
    }
    expect(healed.length).toBeGreaterThan(0)
    expect(me(sim, "feri").hp).toBe(CLASSES.mulin.hp)
    // Whole again, the heals stop: the last one came well before the end.
    expect(healed.at(-1)!).toBeLessThan(60 * 20 - 60)
  })

  test("armour stops at 100 for the Mulin too", () => {
    const sim = match([["a", "benandanti", "mulin"]])
    walk(sim, "a", toSagrato(sim, "a"))
    const events = walk(sim, "a", [...TO_GUBANE])
    expect(events.filter((e) => e.t === "pick" && e.k === "gubane").length).toBe(2)
    expect(me(sim, "a").armor).toBe(MAX_ARMOR)
    expect(MAX_ARMOR).toBe(100)
  })
})

describe("speed", () => {
  for (const primary of PRIMARIES)
    test(`a ${primary} player walks at the class's base speed with the ${primary} in hand, and at base times the multiplier with the pistol, the Mescul or the lanciafrico`, () => {
      const base = CLASSES[primary].speed
      for (const weapon of [primary, "mandi", "mescul"] as const) {
        const sim = match([["a", "benandanti", primary]])
        expect(measuredSpeed(sim, "a", weapon)).toBeCloseTo(MOVE.walk * base * (weapon === primary ? 1 : WEAPONS[weapon].moveScale), 2)
      }
      const sim = match([["a", "benandanti", primary]])
      walk(sim, "a", toSagrato(sim, "a"))
      const events = walk(sim, "a", [...TO_LANCIAFRICO])
      expect(events.some((e) => e.t === "pick" && e.k === "lanciafrico")).toBe(true)
      walk(sim, "a", [...BACK_TO_SAGRATO])
      expect(measuredSpeed(sim, "a", "lanciafrico")).toBeCloseTo(MOVE.walk * base * WEAPONS.lanciafrico.moveScale, 2)
    })

  test("a Mulin player with the Mescul in hand is still slower than any other class with its primary in hand", () => {
    const mulin = measuredSpeed(match([["a", "benandanti", "mulin"]]), "a", "mescul")
    for (const primary of PRIMARIES.filter((p) => p !== "mulin")) expect(measuredSpeed(match([["a", "benandanti", primary]]), "a", primary)).toBeGreaterThan(mulin)
  })

  test("every primary weighs the same in hand: what makes a class slow or quick is its base speed", () => {
    for (const primary of PRIMARIES) expect(WEAPONS[primary].moveScale).toBe(1)
    expect([WEAPONS.mandi.moveScale, WEAPONS.mescul.moveScale, WEAPONS.lanciafrico.moveScale]).toEqual([1.05, 1.12, 0.92])
  })

  test("the client's prediction, with the same speed function, lands where the simulation does", () => {
    for (const primary of ["mulin", "doplete"] as const) {
      const sim = match([["a", "benandanti", primary]])
      walk(sim, "a", toSagrato(sim, "a"))
      const predictor = new Predictor(physics)
      predictor.body = me(sim, "a").body
      // Walks south changing weapon every half second: the primary, the pistol, the Mescul.
      const weapons: WeaponId[] = [primary, "mandi", "mescul", primary]
      for (let i = 0; i < 120; i++) {
        const input: PlayerInput = { ...IDLE_INPUT, seq: ++seq, mz: 1, mx: i % 40 < 20 ? 0.5 : 0, yaw: Math.PI, weapon: weapons[Math.floor(i / 30)], view: sim.view().tick }
        const you = me(sim, "a")
        predictor.apply(input, speedScale(you.arsenal, input.weapon, false))
        sim.input("a", input)
        sim.step()
      }
      const server = me(sim, "a").body
      expect(predictor.body!.x).toBeCloseTo(server.x, 5)
      expect(predictor.body!.z).toBeCloseTo(server.z, 5)
      expect(Math.hypot(server.z - -40, server.x - 15)).toBeGreaterThan(5)
    }
  })
})
