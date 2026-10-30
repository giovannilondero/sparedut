import { beforeAll, describe, expect, test } from "bun:test"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { turretSeat } from "../shared/map.ts"
import { MAP_IDS, MAPS } from "../shared/maps/index.ts"
import { CASOT, MARAN } from "../shared/maps/maran.ts"
import { GLEMONE } from "../shared/maps/glemone.ts"
import { eyeHeight, lookDir, stepBody, type Body } from "../shared/movement.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { createSim, type Sim } from "../shared/sim/index.ts"
import { SHIELD_TICKS } from "../shared/sim/rules.ts"
import type { ModeId } from "../shared/folklore.ts"
import { TURRET, type PrimaryId } from "../shared/weapons.ts"

let maran: PhysicsWorld
let glemone: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  maran = createPhysicsWorld(MARAN)
  glemone = createPhysicsWorld(GLEMONE)
})

function match(physics: PhysicsWorld, players: [id: string, team: "benandanti" | "malandanti", primary: PrimaryId][], o: { ff?: boolean; mode?: ModeId } = {}) {
  const sim = createSim({ mode: o.mode ?? "bataie", minutes: 5, seed: 3, physics, friendlyFire: o.ff ?? false })
  for (const [id, team, primary] of players) sim.join(id, id, team, false, primary)
  sim.start()
  for (let i = 0; i < SHIELD_TICKS + 5; i++) sim.step()
  return sim
}

const seqs = new Map<string, number>()
const me = (sim: Sim, id: string) => sim.view().players.find((p) => p.session === id)!
function toward(sim: Sim, id: string, x: number, z: number, extra: Partial<PlayerInput> = {}): PlayerInput {
  const p = me(sim, id)
  const seq = (seqs.get(id) ?? 0) + 1
  seqs.set(id, seq)
  const close = Math.hypot(x - p.body.x, z - p.body.z) < 0.4
  return { ...IDLE_INPUT, seq, mz: close ? 0 : 1, yaw: Math.atan2(-(x - p.body.x), -(z - p.body.z)), weapon: p.arsenal.current, view: sim.view().tick, ...extra }
}
/** Cammina lungo i punti finché arriva all'ultimo (o finiscono i tick). */
function walk(sim: Sim, id: string, route: [number, number][], others: string[] = [], maxTicks = 3000) {
  for (let i = 0; i < maxTicks; i++) {
    const p = me(sim, id)
    while (route.length > 1 && Math.hypot(route[0][0] - p.body.x, route[0][1] - p.body.z) < 0.5) route.shift()
    if (route.length === 1 && Math.hypot(route[0][0] - p.body.x, route[0][1] - p.body.z) < 0.3) return true
    sim.input(id, toward(sim, id, route[0][0], route[0][1]))
    for (const o of others) sim.input(o, toward(sim, o, me(sim, o).body.x, me(sim, o).body.z))
    sim.step()
  }
  return false
}
/** Un comando "fermo" con i pulsanti e lo sguardo dati. */
function still(sim: Sim, id: string, extra: Partial<PlayerInput>): PlayerInput {
  const p = me(sim, id)
  return toward(sim, id, p.body.x, p.body.z, extra)
}

describe("torretis", () => {
  for (const id of MAP_IDS) {
    test(`a ${id} ogni torretta ha un posto dove si sta in piedi e spara libera davanti`, () => {
      const map = MAPS[id]
      const physics = createPhysicsWorld(map)
      expect(map.turrets.length).toBeGreaterThan(0)
      for (const spot of map.turrets) {
        const [x, y, z] = turretSeat(spot)
        // Il posto: appoggiato sul pavimento, senza cadere né incastrarsi.
        let body: Body = { x, y: y + 0.05, z, vx: 0, vy: 0, vz: 0, grounded: false, crouch: false }
        for (let i = 0; i < 30; i++) body = stepBody(body, IDLE_INPUT, physics, 1).body
        expect(Math.abs(body.y - y)).toBeLessThan(0.2)
        expect(Math.hypot(body.x - x, body.z - z)).toBeLessThan(0.1)
        expect(physics.canStand(body)).toBe(true)
        // Davanti, all'altezza degli occhi: almeno 10 m liberi.
        const eye = { x, y: y + eyeHeight(body), z }
        const hit = physics.raycast(eye, lookDir(spot.yaw, 0), 10)
        expect(hit).toBeNull()
      }
    })
  }

  test("si monta, si sta fermi, scalda fino a fermarsi, si raffredda e si smonta", () => {
    const sim = match(maran, [["a", "malandanti", "cramar"]])
    const spot = MARAN.turrets[1]
    const [sx, , sz] = turretSeat(spot)
    const start = me(sim, "a").body
    const route: [number, number][] =
      start.z < 73 ? [[start.x, 66], [sx, 66], [sx, sz]] : [[start.x, 82], [-22, 82], [-22, 66], [sx, 66], [sx, sz]]
    expect(walk(sim, "a", route)).toBe(true)

    const events: GameEvent[] = []
    sim.input("a", still(sim, "a", { buttons: BUTTON.use }))
    events.push(...sim.step())
    expect(events.some((e) => e.t === "turret" && e.a === "on" && e.s === "a")).toBe(true)
    expect(sim.view().turrets[1].gunner).toBe("a")

    // Si spinge avanti e si spara: il corpo resta al posto, lo sguardo dentro l'arco.
    const shots: number[] = []
    let hotAt = -1
    for (let i = 0; i < 600 && (hotAt < 0 || i < hotAt + 120); i++) {
      sim.input("a", { ...still(sim, "a", { buttons: BUTTON.fire, yaw: spot.yaw + 2.5 }), mz: 1, mx: 1 })
      for (const e of sim.step()) {
        if (e.t === "shot" && e.s === "a") {
          expect(e.w).toBe("mitraie")
          shots.push(i)
        }
        if (e.t === "turret" && e.a === "hot" && hotAt < 0) hotAt = i
      }
    }
    const b = me(sim, "a").body
    expect(Math.hypot(b.x - sx, b.z - sz)).toBeLessThan(0.01)
    expect(Math.abs(me(sim, "a").yaw - spot.yaw)).toBeLessThanOrEqual(TURRET.arc + 1e-6)
    // Scalda dopo 2-5 secondi di fuoco continuo, poi tace finché non si è raffreddata.
    expect(hotAt).toBeGreaterThan(120)
    expect(hotAt).toBeLessThan(300)
    expect(shots.filter((t) => t > hotAt)).toEqual([])
    expect(sim.view().turrets[1].jammed).toBe(true)

    let cooled = false
    for (let i = 0; i < 400 && !cooled; i++) {
      sim.input("a", still(sim, "a", {}))
      cooled = sim.step().some((e) => e.t === "turret" && e.a === "cool")
    }
    expect(cooled).toBe(true)
    expect(sim.view().turrets[1].heat).toBe(0)

    sim.input("a", still(sim, "a", { buttons: BUTTON.use }))
    expect(sim.step().some((e) => e.t === "turret" && e.a === "off")).toBe(true)
    expect(sim.view().turrets[1].gunner).toBeNull()
    // Smontato si torna a camminare.
    for (let i = 0; i < 60; i++) {
      sim.input("a", toward(sim, "a", sx, sz + 6))
      sim.step()
    }
    expect(me(sim, "a").body.z).toBeGreaterThan(sz + 2)
  })

  test("la mitraie colpisce chi le passa davanti", () => {
    const sim = match(maran, [["a", "malandanti", "cramar"], ["b", "benandanti", "cramar"]])
    const spot = MARAN.turrets[1]
    const [sx, , sz] = turretSeat(spot)
    const start = me(sim, "a").body
    walk(sim, "a", start.z < 73 ? [[start.x, 66], [sx, 66], [sx, sz]] : [[start.x, 82], [-22, 82], [-22, 66], [sx, 66], [sx, sz]], ["b"])
    sim.input("a", still(sim, "a", { buttons: BUTTON.use }))
    sim.step()
    // B scende dall'arzin verso il borc: la torretta lo guarda.
    const routeB: [number, number][] = [[me(sim, "b").body.x, -90], [-30, -90], [-30, -52], [0, -52], [0, 40]]
    let hit = false
    for (let i = 0; i < 4000 && !hit; i++) {
      const p = me(sim, "b")
      while (routeB.length > 1 && Math.hypot(routeB[0][0] - p.body.x, routeB[0][1] - p.body.z) < 0.5) routeB.shift()
      sim.input("b", toward(sim, "b", routeB[0][0], routeB[0][1]))
      const a = me(sim, "a").body
      const yaw = Math.atan2(-(p.body.x - a.x), -(p.body.z - a.z))
      const pitch = Math.atan2(p.body.y + 1.2 - (a.y + 1.6), Math.hypot(p.body.x - a.x, p.body.z - a.z))
      const near = p.body.z > 20
      sim.input("a", still(sim, "a", { yaw, pitch, buttons: near ? BUTTON.fire : 0 }))
      hit = sim.step().some((e) => e.t === "hit" && e.a === "a" && e.v === "b")
    }
    expect(hit).toBe(true)
  })
})

describe("la puarte dal casot", () => {
  test("si sfonda a pedate, poi si entra e si prende il lanciafrico", () => {
    const sim = match(maran, [["a", "benandanti", "cramar"]])
    const p = me(sim, "a").body
    const outside: [number, number] = [CASOT.minX - 0.8, 27]
    expect(walk(sim, "a", [[p.x, -90], [41.2, -90], [41.2, -51], [41.2, 13], [37, 27], outside], [], 5000)).toBe(true)

    // Chiusa: non si passa.
    for (let i = 0; i < 90; i++) {
      sim.input("a", toward(sim, "a", 44, 27))
      sim.step()
    }
    expect(me(sim, "a").body.x).toBeLessThan(CASOT.minX)

    // Pedate col mescul, guardando la porta.
    const events: GameEvent[] = []
    for (let i = 0; i < 300 && !events.some((e) => e.t === "door" && e.a === "broken"); i++) {
      sim.input("a", still(sim, "a", { weapon: "mescul", yaw: -Math.PI / 2, pitch: -0.1, buttons: i % 40 === 30 ? BUTTON.fire : 0 }))
      events.push(...sim.step())
    }
    expect(events.filter((e) => e.t === "door" && e.a === "hit").length).toBeGreaterThan(0)
    expect(events.some((e) => e.t === "door" && e.a === "broken" && e.s === "a")).toBe(true)
    expect(sim.view().doors[0]).toBe(0)

    // Aperta: si entra, e dentro c'è il lanciafrico.
    let picked = false
    for (let i = 0; i < 240 && !picked; i++) {
      sim.input("a", toward(sim, "a", 44.5, 27, { weapon: "mescul" }))
      picked = sim.step().some((e) => e.t === "pick" && e.s === "a" && e.k === "lanciafrico")
    }
    expect(picked).toBe(true)
    expect(me(sim, "a").body.x).toBeGreaterThan(CASOT.minX + 1)
  })

  test("una partita nuova rimette la porta", () => {
    const sim = match(maran, [["a", "benandanti", "cramar"]])
    expect(sim.view().doors).toEqual([150])
    expect(maran.raycast({ x: 37, y: 1.5, z: 27 }, { x: 1, y: 0, z: 0 }, 6)?.door).toBe(0)
  })
})

describe("cjanon des gjalinis", () => {
  test("la gjaline punta il nemico anche se si mira storto, scoppia e lo copre di piume", () => {
    const sim = match(glemone, [["a", "benandanti", "gjalinis"], ["b", "benandanti", "cramar"]], { ff: true })
    const out = (id: string, x: number, z: number): [number, number][] => {
      const b = me(sim, id).body
      return b.z < -62 && Math.abs(b.x) < 14 ? [[0, -70], [0, -58], [x, z]] : [[x, z]]
    }
    expect(walk(sim, "a", out("a", -8, -44), ["b"])).toBe(true)
    expect(walk(sim, "b", out("b", 10, -44), ["a"])).toBe(true)
    const a = me(sim, "a").body
    const b = me(sim, "b").body
    // Mira 0.3 rad (17°) a destra del bersaglio: la gjaline gira da sola.
    const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)) - 0.3
    const events: GameEvent[] = []
    sim.input("a", still(sim, "a", { weapon: "gjalinis", yaw, pitch: 0, buttons: BUTTON.fire }))
    events.push(...sim.step())
    expect(events.some((e) => e.t === "launch" && e.k === "gjaline")).toBe(true)
    for (let i = 0; i < 150; i++) {
      sim.input("a", still(sim, "a", { weapon: "gjalinis", yaw }))
      sim.input("b", still(sim, "b", {}))
      events.push(...sim.step())
    }
    expect(events.some((e) => e.t === "boom" && e.k === "gjaline")).toBe(true)
    expect(events.some((e) => e.t === "plumis" && e.v === "b" && e.n > 0)).toBe(true)
    expect(me(sim, "b").hp).toBeLessThan(100)
  })
})
