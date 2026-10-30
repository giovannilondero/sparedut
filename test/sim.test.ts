import { beforeAll, describe, expect, test } from "bun:test"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { CAMPANILE, COMUNE, GLEMONE } from "../shared/maps/glemone.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import { createSim } from "../shared/sim/index.ts"
import { WARMUP_TICKS } from "../shared/sim/rules.ts"

let physics: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  physics = createPhysicsWorld(GLEMONE)
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
    const pad = GLEMONE.jumpPads[0]
    const { b, maxY } = run(at(pad.at[0], pad.at[1] + 0.1, pad.at[2]), IDLE_INPUT, 60 * 4)
    console.log("campanile", b, maxY)
    expect(b.y).toBeCloseTo(CAMPANILE.balcony, 0)
  })

  test("il cjar di fen del Comun porta sul tetto", () => {
    const pad = GLEMONE.jumpPads[1]
    const { b, maxY } = run(at(pad.at[0], pad.at[1] + 0.1, pad.at[2]), IDLE_INPUT, 60 * 4)
    console.log("comun", b, maxY)
    expect(b.y).toBeCloseTo(COMUNE.roof, 0)
  })
})

describe("simulazione", () => {
  test("ogni comando è un passo: due in un tick, zero nel successivo, stesso risultato", () => {
    const run = (deliver: (send: () => void, i: number) => void) => {
      const sim = createSim({ mode: "bataie", minutes: 5, seed: 3, physics })
      sim.join("a", "Toni", "benandanti", false, "cramar")
      sim.start()
      for (let i = 0; i < 5; i++) sim.step()
      let seq = 1
      const send = () => sim.input("a", { ...IDLE_INPUT, seq: seq++, mz: 1, yaw: Math.PI, view: 0 })
      for (let i = 0; i < 60; i++) {
        deliver(send, i)
        sim.step()
      }
      // Gli ultimi comandi in ritardo arrivano dopo.
      sim.step()
      return sim.view().players[0].body
    }
    const steady = run((send) => send())
    const bursty = run((send, i) => {
      if (i % 2 === 0) {
        send()
        send()
      }
    })
    expect(bursty.z).toBeCloseTo(steady.z, 3)
    expect(bursty.x).toBeCloseTo(steady.x, 3)
  })

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
    // Il percorso si ferma entro 0.8 m dal punto, poi il corpo frena: qualche decimetro di margine.
    expect(Math.abs(a.body.z - 22)).toBeLessThan(1.5)
    expect(Math.abs(b.body.z - 48)).toBeLessThan(1.5)
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

  test("il lanciafrico raccolto resta in mano anche con i comandi già in viaggio", () => {
    const sim = createSim({ mode: "bataie", minutes: 5, seed: 5, physics })
    sim.join("a", "Toni", "benandanti", false, "cramar")
    sim.start()
    for (let i = 0; i < 30; i++) sim.step()
    const route: [number, number][] = [[3, -36], [3, -2], [9, -2]]
    let seq = 1
    let picked = -1
    for (let i = 0; i < 60 * 20 && picked < 0; i++) {
      const p = sim.view().players[0]
      while (route.length > 1 && Math.hypot(route[0][0] - p.body.x, route[0][1] - p.body.z) < 0.8) route.shift()
      const [tx, tz] = route[0]
      // Il client chiede sempre il mitra: è il comando che era già partito prima della raccolta.
      sim.input("a", { ...IDLE_INPUT, seq: seq++, mz: 1, yaw: Math.atan2(-(tx - p.body.x), -(tz - p.body.z)), weapon: "cramar", view: sim.view().tick })
      if (sim.step().some((e) => e.t === "pick" && e.k === "lanciafrico")) picked = i
    }
    expect(picked).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < 30; i++) {
      sim.input("a", { ...IDLE_INPUT, seq: seq++, weapon: "cramar", view: sim.view().tick })
      sim.step()
    }
    expect(sim.view().players[0].arsenal.current).toBe("lanciafrico")
    // Un cambio vero, invece, passa.
    sim.input("a", { ...IDLE_INPUT, seq: seq++, weapon: "mandi", view: sim.view().tick })
    sim.step()
    expect(sim.view().players[0].arsenal.current).toBe("mandi")
  })

  test("la nuova arma principale dall'armeria arriva subito", () => {
    const sim = createSim({ mode: "bataie", minutes: 5, seed: 5, physics })
    sim.join("a", "Toni", "benandanti", false, "cramar")
    sim.start()
    for (let i = 0; i < 30; i++) sim.step()
    expect(sim.view().players[0].arsenal.current).toBe("cramar")
    sim.primary("a", "doplete")
    sim.step()
    const a = sim.view().players[0].arsenal
    expect(a.primary).toBe("doplete")
    expect(a.current).toBe("doplete")
  })

  test("il riscaldamento finisce da solo e poi i punti contano", () => {
    const sim = createSim({ mode: "bataie", minutes: 5, seed: 2, physics })
    sim.join("a", "Toni", "benandanti", false, "cramar")
    for (let i = 0; i < WARMUP_TICKS - 5; i++) sim.step()
    expect(sim.view().phase.tag).toBe("Warmup")
    for (let i = 0; i < 10; i++) sim.step()
    expect(sim.view().phase.tag).toBe("Live")
  })
})
