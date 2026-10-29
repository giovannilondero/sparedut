import { beforeAll, describe, expect, test } from "bun:test"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { CAMPANILE, COMUNE, JUMP_PADS } from "../shared/map.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import { createSim } from "../shared/sim/index.ts"

let physics: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  physics = createPhysicsWorld()
})

const at = (x: number, y: number, z: number): Body => ({ x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, crouch: false })
const run = (body: Body, input: PlayerInput, ticks: number) => {
  let b = body
  let maxY = b.y
  for (let i = 0; i < ticks; i++) {
    b = stepBody(b, input, physics, 1).body
    maxY = Math.max(maxY, b.y)
  }
  return { b, maxY }
}

describe("movimento", () => {
  test("si sta in piedi sul sagrato", () => {
    const { b } = run(at(0, 6.5, -45), IDLE_INPUT, 60)
    expect(b.y).toBeCloseTo(6, 1)
    expect(b.grounded).toBe(true)
  })

  test("si scende la rampa di Via Bini fino in piazza", () => {
    // yaw π guarda verso sud (+z)
    const { b } = run(at(3, 6, -32), { ...IDLE_INPUT, mz: 1, yaw: Math.PI }, 60 * 14)
    expect(b.z).toBeGreaterThan(30)
    expect(b.y).toBeCloseTo(0, 0)
  })

  test("si risale la rampa", () => {
    const { b } = run(at(3, 0, 25), { ...IDLE_INPUT, mz: 1, yaw: 0 }, 60 * 14)
    expect(b.y).toBeCloseTo(6, 0)
  })

  test("il cjar di fen del campanile porta sul ballatoio", () => {
    const pad = JUMP_PADS[0]
    const { b, maxY } = run(at(pad.at[0], pad.at[1] + 0.1, pad.at[2]), IDLE_INPUT, 60 * 4)
    console.log("campanile", b, maxY)
    expect(b.y).toBeCloseTo(CAMPANILE.balcony, 0)
  })

  test("il cjar di fen del Comun porta sul tetto", () => {
    const pad = JUMP_PADS[1]
    const { b, maxY } = run(at(pad.at[0], pad.at[1] + 0.1, pad.at[2]), IDLE_INPUT, 60 * 4)
    console.log("comun", b, maxY)
    expect(b.y).toBeCloseTo(COMUNE.roof, 0)
  })
})

describe("simulazione", () => {
  test("un benandant colpisce e abbatte un malandant", () => {
    const sim = createSim({ mode: "bataie", minutes: 5, seed: 7, physics })
    sim.join("a", "Toni", "benandanti", false, "cramar")
    sim.join("b", "Strie", "malandanti", false, "cramar")
    sim.start()
    for (let i = 0; i < 10; i++) sim.step()
    const routes: Record<string, [number, number][]> = { a: [[3, -36], [3, 22]], b: [[3, 48]] }
    let seq = 1
    const steer = (id: string) => {
      const p = sim.view().players.find((q) => q.session === id)!
      const route = routes[id]
      while (route.length && Math.hypot(route[0][0] - p.body.x, route[0][1] - p.body.z) < 0.8) route.shift()
      if (!route.length) return { ...IDLE_INPUT, seq: seq++, yaw: p.yaw, view: sim.view().tick }
      const [tx, tz] = route[0]
      return { ...IDLE_INPUT, seq: seq++, mz: 1, yaw: Math.atan2(-(tx - p.body.x), -(tz - p.body.z)), view: sim.view().tick }
    }
    for (let i = 0; i < 60 * 15; i++) {
      sim.input("a", steer("a"))
      sim.input("b", steer("b"))
      sim.step()
    }
    let v = sim.view()
    const a = v.players.find((p) => p.session === "a")!
    const b = v.players.find((p) => p.session === "b")!
    expect(a.body.z).toBeCloseTo(22, 0)
    expect(b.body.z).toBeCloseTo(48, 0)
    const dx = b.body.x - a.body.x
    const dz = b.body.z - a.body.z
    const dy = b.body.y + 1.0 - (a.body.y + 1.6)
    const yaw = Math.atan2(-dx, -dz)
    const pitch = Math.atan2(dy, Math.hypot(dx, dz))
    const events: string[] = []
    for (let i = 0; i < 300; i++) {
      sim.input("a", { ...IDLE_INPUT, seq: seq++, yaw, pitch, weapon: "cramar", buttons: BUTTON.fire | BUTTON.aim, view: sim.view().tick })
      for (const e of sim.step()) events.push(e.t)
    }
    v = sim.view()
    expect(events).toContain("hit")
    expect(events).toContain("kill")
    expect(v.score.benandanti).toBeGreaterThan(0)
  })
})
