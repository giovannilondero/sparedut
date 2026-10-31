import { beforeAll, describe, expect, test } from "bun:test"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { trackLength, trackPoint } from "../shared/map.ts"
import { GLEMONE } from "../shared/maps/glemone.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { createSim, type Sim } from "../shared/sim/index.ts"
import { CART, MAX_HP, RAISE_TICKS, SHIELD_TICKS } from "../shared/sim/rules.ts"
import type { ModeId } from "../shared/folklore.ts"
import { WEAPONS, type PrimaryId } from "../shared/weapons.ts"

let physics: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  physics = createPhysicsWorld(GLEMONE)
})

/** A match already under way, with players spawned and past their spawn protection. */
function match(mode: ModeId, players: [id: string, team: "benandanti" | "malandanti", primary: PrimaryId][], o: { minutes?: number; ff?: boolean } = {}) {
  const sim = createSim({ mode, minutes: o.minutes ?? 5, seed: 11, physics, friendlyFire: o.ff ?? false })
  for (const [id, team, primary] of players) sim.join(id, id, team, false, primary)
  sim.start()
  for (let i = 0; i < SHIELD_TICKS + 5; i++) sim.step()
  return sim
}

const seqs = new Map<string, number>()
const me = (sim: Sim, id: string) => sim.view().players.find((p) => p.session === id)!
/** A command heading towards (x, z) with the given buttons; standing still if already there. */
function toward(sim: Sim, id: string, x: number, z: number, extra: Partial<PlayerInput> = {}): PlayerInput {
  const p = me(sim, id)
  const seq = (seqs.get(id) ?? 0) + 1
  seqs.set(id, seq)
  const close = Math.hypot(x - p.body.x, z - p.body.z) < 0.6
  return { ...IDLE_INPUT, seq, mz: close ? 0 : 1, yaw: Math.atan2(-(x - p.body.x), -(z - p.body.z)), weapon: p.arsenal.primary, view: sim.view().tick, ...extra }
}
/** Follows a list of points (dropping the first one once reached). */
function follow(sim: Sim, id: string, route: [number, number][], extra: Partial<PlayerInput> = {}) {
  const p = me(sim, id)
  while (route.length > 1 && Math.hypot(route[0][0] - p.body.x, route[0][1] - p.body.z) < 1) route.shift()
  return toward(sim, id, route[0][0], route[0][1], extra)
}
/** The route to (x, z) on the sagrato: leaves the Duomo if spawned inside it. */
const fromSagrato = (sim: Sim, id: string, x: number, z: number): [number, number][] => {
  const b = me(sim, id).body
  return b.z < -62 && Math.abs(b.x) < 14 ? [[0, -70], [0, -58], [x, z]] : [[x, z]]
}
/** From wherever you are down to the piazza, along Vie Bini around the fountain. */
const toPiazza = (sim: Sim, id: string, x: number, z: number): [number, number][] => [
  ...fromSagrato(sim, id, 0, -40).slice(0, -1),
  [0, -32],
  [0, -18],
  [-3.6, -4],
  [-3.6, 8],
  [0, 22],
  [x, z]
]
const aimAt = (sim: Sim, from: string, to: string) => {
  const a = me(sim, from).body
  const b = me(sim, to).body
  const dx = b.x - a.x
  const dz = b.z - a.z
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(b.y + 1.1 - (a.y + 1.6), Math.hypot(dx, dz)) }
}

describe("weapons", () => {
  test("no firing while sprinting; once the sprint ends the weapon comes back up and fires", () => {
    const sim = match("bataie", [["a", "benandanti", "cramar"]])
    const route = fromSagrato(sim, "a", 0, -40)
    for (let i = 0; i < 240; i++) {
      sim.input("a", follow(sim, "a", route))
      sim.step()
    }
    const shots: number[] = []
    let i = 0
    // Sprints with the trigger held: no shots.
    for (; i < 90; i++) {
      sim.input("a", { ...IDLE_INPUT, seq: 1000 + i, mz: 1, yaw: Math.PI, weapon: "cramar", buttons: BUTTON.sprint | BUTTON.fire, view: sim.view().tick })
      if (sim.step().some((e) => e.t === "shot")) shots.push(i)
    }
    expect(shots).toEqual([])
    // Releases sprint and holds the trigger: the first shot comes after the weapon is raised again.
    const released = i
    for (; i < 150; i++) {
      sim.input("a", { ...IDLE_INPUT, seq: 1000 + i, mz: 1, yaw: Math.PI, weapon: "cramar", buttons: BUTTON.fire, view: sim.view().tick })
      if (sim.step().some((e) => e.t === "shot")) shots.push(i)
    }
    expect(shots.length).toBeGreaterThan(3)
    expect(shots[0] - released).toBeGreaterThanOrEqual(RAISE_TICKS - 1)
  })

  test("the Mulin fires only after spinning up", () => {
    const sim = match("bataie", [["a", "benandanti", "mulin"]])
    const shots: number[] = []
    for (let i = 0; i < 120; i++) {
      sim.input("a", { ...IDLE_INPUT, seq: i + 1, yaw: Math.PI, weapon: "mulin", buttons: BUTTON.fire, view: sim.view().tick })
      if (sim.step().some((e) => e.t === "shot")) shots.push(i)
    }
    expect(shots[0]).toBeGreaterThanOrEqual(WEAPONS.mulin.spinTicks - 1)
    // Then it fires in bursts: one shot every `cooldownTicks`.
    expect(shots.length).toBeGreaterThan(((120 - WEAPONS.mulin.spinTicks) / WEAPONS.mulin.cooldownTicks) * 0.8)
  })

  test("the miedi heals a teammate with the stream and, when close, even without firing", () => {
    const sim = match("bataie", [["medi", "benandanti", "miedi"], ["feri", "benandanti", "cramar"]])
    // The wounded one drops a bombe di sgnape at their own feet.
    for (let i = 0; i < 200; i++) {
      const bomb = i === 0 ? BUTTON.bomb : 0
      sim.input("feri", { ...toward(sim, "feri", me(sim, "feri").body.x, me(sim, "feri").body.z), pitch: -1.5, buttons: bomb })
      sim.input("medi", { ...IDLE_INPUT, seq: 5000 + i, view: sim.view().tick, weapon: "miedi" })
      sim.step()
    }
    const hurt = me(sim, "feri")
    expect(hurt.alive).toBe(true)
    expect(hurt.hp).toBeLessThan(MAX_HP - 20)
    // The medic goes next to the wounded one (passive).
    const target = hurt.body
    const medRoute = fromSagrato(sim, "medi", target.x, target.z)
    for (let i = 0; i < 600 && Math.hypot(me(sim, "medi").body.x - target.x, me(sim, "medi").body.z - target.z) > 3; i++) {
      sim.input("medi", follow(sim, "medi", medRoute))
      sim.input("feri", toward(sim, "feri", target.x, target.z))
      sim.step()
    }
    const before = me(sim, "feri").hp
    for (let i = 0; i < 120; i++) {
      sim.input("medi", toward(sim, "medi", me(sim, "medi").body.x, me(sim, "medi").body.z))
      sim.input("feri", toward(sim, "feri", target.x, target.z))
      sim.step()
    }
    const passive = me(sim, "feri").hp - before
    expect(passive).toBeGreaterThan(1)
    // The stream heals much more.
    const events: GameEvent[] = []
    for (let i = 0; i < 120; i++) {
      sim.input("medi", { ...toward(sim, "medi", me(sim, "medi").body.x, me(sim, "medi").body.z), ...aimAt(sim, "medi", "feri"), buttons: BUTTON.fire })
      sim.input("feri", toward(sim, "feri", target.x, target.z))
      events.push(...sim.step())
    }
    expect(events.some((e) => e.t === "heal" && e.s === "medi" && e.v === "feri")).toBe(true)
    expect(me(sim, "feri").hp - before - passive).toBeGreaterThan(passive * 3)
  })

  for (const ff of [false, true]) {
    test(`a mine di Raibl ${ff ? "goes off under a teammate with friendly fire" : "doesn't go off under a teammate"}`, () => {
      const sim = match("bataie", [["a", "benandanti", "cramar"], ["b", "benandanti", "cramar"]], { ff })
      const spot: [number, number] = [0, -44]
      // A goes to the spot, looks down and plants the mine; then moves away.
      const routeA = fromSagrato(sim, "a", spot[0], spot[1])
      for (let i = 0; i < 700 && Math.hypot(me(sim, "a").body.x - spot[0], me(sim, "a").body.z - spot[1]) > 0.8; i++) {
        sim.input("a", follow(sim, "a", routeA))
        sim.input("b", toward(sim, "b", me(sim, "b").body.x, me(sim, "b").body.z))
        sim.step()
      }
      const events: GameEvent[] = []
      sim.input("a", { ...toward(sim, "a", spot[0], spot[1]), pitch: -1.4, buttons: BUTTON.mine })
      events.push(...sim.step())
      expect(events.some((e) => e.t === "launch" && e.k === "mine")).toBe(true)
      for (let i = 0; i < 200; i++) {
        sim.input("a", toward(sim, "a", spot[0] + 12, spot[1]))
        sim.input("b", toward(sim, "b", me(sim, "b").body.x, me(sim, "b").body.z))
        events.push(...sim.step())
      }
      expect(sim.view().projectiles.filter((p) => p.kind === "mine").length).toBe(1)
      // B walks over it.
      const routeB = fromSagrato(sim, "b", spot[0], spot[1] + 6)
      for (let i = 0; i < 900; i++) {
        const done = Math.hypot(me(sim, "b").body.x - spot[0], me(sim, "b").body.z - (spot[1] + 6)) < 1
        sim.input("b", done ? toward(sim, "b", spot[0], spot[1] - 6) : follow(sim, "b", routeB))
        sim.input("a", toward(sim, "a", spot[0] + 12, spot[1]))
        events.push(...sim.step())
        if (done && me(sim, "b").body.z < spot[1] - 4) break
      }
      expect(events.some((e) => e.t === "boom" && e.k === "mine")).toBe(ff)
    })
  }
})

describe("modes", () => {
  test("La Tampieste: whoever stays outside the storm dies and doesn't respawn, the last one standing wins", () => {
    const sim = match("tampieste", [["a", "benandanti", "cramar"], ["b", "malandanti", "cramar"], ["c", "benandanti", "cramar"]], { minutes: 1 })
    const kills: GameEvent[] = []
    let deadSeen = new Set<string>()
    for (let i = 0; i < 60 * 70 && sim.view().phase.tag === "Live"; i++) {
      for (const id of ["a", "b", "c"]) sim.input(id, toward(sim, id, me(sim, id).body.x, me(sim, id).body.z))
      for (const e of sim.step()) if (e.t === "kill") kills.push(e)
      const v = sim.view()
      for (const p of v.players) {
        if (!p.alive) deadSeen.add(p.session)
        // Whoever has died stays dead while the match is under way.
        else if (v.phase.tag === "Live") expect(deadSeen.has(p.session)).toBe(false)
      }
    }
    const phase = sim.view().phase
    expect(phase.tag).toBe("Over")
    expect(kills.some((e) => e.t === "kill" && e.w === "tampieste")).toBe(true)
    if (phase.tag !== "Over") return
    expect(typeof phase.winner).toBe("object")
    void deadSeen
  }, 30000)

  test("La Tampieste: teammates hurt each other", () => {
    const sim = match("tampieste", [["a", "benandanti", "cramar"], ["b", "benandanti", "cramar"]])
    const events: GameEvent[] = []
    // A reaches B and shoots them.
    const b0 = me(sim, "b").body
    const routeA = b0.z > 10 ? toPiazza(sim, "a", b0.x, b0.z - 4) : fromSagrato(sim, "a", b0.x, b0.z - 4)
    for (let i = 0; i < 3000 && !events.some((e) => e.t === "hit" && e.v === "b"); i++) {
      const b = me(sim, "b").body
      const far = Math.hypot(me(sim, "a").body.x - b.x, me(sim, "a").body.z - b.z) > 6
      sim.input("a", far ? follow(sim, "a", routeA) : { ...toward(sim, "a", me(sim, "a").body.x, me(sim, "a").body.z), ...aimAt(sim, "a", "b"), buttons: i % 2 ? BUTTON.fire : 0 })
      sim.input("b", toward(sim, "b", b.x, b.z))
      events.push(...sim.step())
    }
    expect(events.some((e) => e.t === "hit" && e.a === "a" && e.v === "b")).toBe(true)
  })

  /** The point on the track just ahead of the cjar. */
  const ahead = (sim: Sim, by: number): [number, number] => {
    const c = sim.view().cart!
    const d = c.progress * trackLength(GLEMONE.track) + by
    const p = trackPoint(GLEMONE.track, d).at
    return [p[0], p[2]]
  }

  test("Spingi il Cjar: the Benandant pushes it all the way and wins", () => {
    const sim = match("cjar", [["a", "benandanti", "cramar"]], { minutes: 10 })
    const start = GLEMONE.track[0]
    const route = fromSagrato(sim, "a", start[0], start[2])
    for (let i = 0; i < 600 && sim.view().cart!.progress === 0; i++) {
      sim.input("a", follow(sim, "a", route))
      sim.step()
    }
    expect(sim.view().cart!.progress).toBeGreaterThan(0)
    const events: GameEvent[] = []
    for (let i = 0; i < 60 * 200 && sim.view().phase.tag === "Live"; i++) {
      const [x, z] = ahead(sim, 1.5)
      sim.input("a", toward(sim, "a", x, z))
      events.push(...sim.step())
    }
    expect(events.some((e) => e.t === "cart" && e.a === "arrived")).toBe(true)
    const phase = sim.view().phase
    expect(phase.tag === "Over" && phase.winner).toBe("benandanti")
  }, 60000)

  test("Spingi il Cjar: left alone it rolls back, when contested it stops", () => {
    const sim = match("cjar", [["a", "benandanti", "cramar"], ["b", "malandanti", "cramar"]], { minutes: 10 })
    const start = GLEMONE.track[0]
    const route = fromSagrato(sim, "a", start[0], start[2])
    const routeB: [number, number][] = [[0, 46], [-3.6, 8], [-3.6, -4], [0, -18], [0, -36]]
    const hold = () => sim.input("b", follow(sim, "b", routeB))
    for (let i = 0; i < 600 && sim.view().cart!.progress === 0; i++) {
      sim.input("a", follow(sim, "a", route))
      hold()
      sim.step()
    }
    for (let i = 0; i < 400; i++) {
      const [x, z] = ahead(sim, 1.5)
      sim.input("a", toward(sim, "a", x, z))
      hold()
      sim.step()
    }
    const pushed = sim.view().cart!.progress
    expect(pushed).toBeGreaterThan(0)
    // A walks away: after the idle time the cjar rolls back.
    for (let i = 0; i < CART.idleTicks + 240; i++) {
      sim.input("a", toward(sim, "a", 25, -45))
      hold()
      sim.step()
    }
    expect(sim.view().cart!.progress).toBeLessThan(pushed)
    // Both at the cjar: contested, stopped.
    for (let i = 0; i < 900 && !sim.view().cart!.contested; i++) {
      const c = sim.view().cart!.at
      sim.input("a", toward(sim, "a", c[0], c[2] - 1))
      sim.input("b", follow(sim, "b", [...routeB.slice(-1), [c[0], c[2] + 1.5]]))
      sim.step()
    }
    expect(sim.view().cart!.contested).toBe(true)
    const stuck = sim.view().cart!.progress
    for (let i = 0; i < 60; i++) {
      const c = sim.view().cart!.at
      sim.input("a", toward(sim, "a", c[0], c[2] - 1))
      sim.input("b", toward(sim, "b", c[0], c[2] + 1.5))
      sim.step()
    }
    expect(sim.view().cart!.progress).toBeCloseTo(stuck, 5)
  }, 60000)

  test("Spingi il Cjar: when time runs out the Malandants win", () => {
    const sim = match("cjar", [["a", "benandanti", "cramar"], ["b", "malandanti", "cramar"]], { minutes: 0.1 })
    for (let i = 0; i < 60 * 8 && sim.view().phase.tag === "Live"; i++) sim.step()
    const phase = sim.view().phase
    expect(phase.tag === "Over" && phase.winner).toBe("malandanti")
  })
})

