import { expect, test } from "bun:test"
import { MODE_IDS } from "../shared/folklore.ts"
import { IDLE_INPUT } from "../shared/input.ts"
import { BOARDWALK_Y, LAND, MARAN, PONT, SEA, TREES } from "../shared/maps/maran.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import { createPhysicsWorld, initPhysics } from "../shared/physics.ts"
import { playBots } from "./play.ts"

for (const mode of MODE_IDS) {
  test(`i bot giocano una partita a Lagune di Maran: ${mode}`, async () => {
    await initPhysics()
    const { kills, view: v } = playBots("maran", mode)
    console.log("maran", mode, { score: v.score, kills })
    expect(kills).toBeGreaterThan(3)
  }, 120000)
}

test("il percors dal cjar a Lagune di Maran si fâs a pît", async () => {
  await initPhysics()
  const physics = createPhysicsWorld(MARAN)
  const track = MARAN.track
  let body: Body = { x: track[0][0], y: track[0][1] + 0.05, z: track[0][2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false }
  let worst = 0
  for (let i = 1; i < track.length; i++) {
    const [ax, , az] = track[i - 1]
    const [bx, by, bz] = track[i]
    const len = Math.hypot(bx - ax, bz - az)
    let reached = false
    for (let t = 0; t < Math.ceil((len / 6.4) * 60 * 2) + 30; t++) {
      const dx = bx - body.x
      const dz = bz - body.z
      if (Math.hypot(dx, dz) < 0.5) {
        reached = true
        break
      }
      body = stepBody(body, { ...IDLE_INPUT, mz: 1, yaw: Math.atan2(-dx, -dz) }, physics, 1).body
      // distanza dal segmento
      const k = Math.max(0, Math.min(1, ((body.x - ax) * (bx - ax) + (body.z - az) * (bz - az)) / (len * len)))
      worst = Math.max(worst, Math.hypot(body.x - (ax + (bx - ax) * k), body.z - (az + (bz - az) * k)))
    }
    expect(reached).toBe(true)
    expect(Math.abs(body.y - by)).toBeLessThan(0.5)
  }
  expect(worst).toBeLessThan(1)
}, 30000)

const walkFor = (physics: ReturnType<typeof createPhysicsWorld>, from: [number, number, number], yaw: number, ticks: number) => {
  let body: Body = { x: from[0], y: from[1] + 0.05, z: from[2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false }
  let top = -Infinity
  for (let t = 0; t < ticks; t++) {
    body = stepBody(body, { ...IDLE_INPUT, mz: 1, yaw }, physics, 1).body
    top = Math.max(top, body.y)
  }
  return { body, top }
}

test("a vuat si va plan, su la passerele no; e de aghe si torne su la rive", async () => {
  await initPhysics()
  const physics = createPhysicsWorld(MARAN)
  // un secont viers sud: in aghe tal canâl fra l'arzin e la barene, po su la passerele
  const wet = walkFor(physics, [-15, SEA, 20], Math.PI, 60)
  const dry = walkFor(physics, [-15, BOARDWALK_Y, -4.8], -Math.PI / 2, 60)
  const wetRun = Math.abs(wet.body.z - 20)
  const dryRun = Math.abs(dry.body.x + 15)
  expect(wetRun).toBeLessThan(dryRun * 0.7)
  expect(wetRun).toBeGreaterThan(dryRun * 0.4)
  // de aghe si monte su la rive cence saltâ, ancje plan e di sbighet
  for (const [from, yaw] of [[[12, SEA, -24], Math.PI / 2], [[15, SEA, -40], 0], [[-20, SEA, -8], -Math.PI / 2 - 0.4], [[35, SEA, 50], 0.3]] as const) {
    const out = walkFor(physics, from as [number, number, number], yaw, 150)
    expect(out.body.y).toBeGreaterThan(-0.05)
  }
})

test("il puintut si passe a pît, a schene di mus", async () => {
  await initPhysics()
  const physics = createPhysicsWorld(MARAN)
  const r = walkFor(physics, [30, LAND, PONT.z0 - 1.5], Math.PI, 200)
  expect(r.top).toBeGreaterThan(PONT.deck - 0.1)
  expect(r.body.z).toBeGreaterThan(PONT.z1)
  expect(r.body.y).toBeGreaterThan(-0.05)
})

test("i arbui dal bosc a son solits", async () => {
  await initPhysics()
  const physics = createPhysicsWorld(MARAN)
  const bosc = TREES.filter((t) => t.x > 12 && t.x < 40 && t.z > -34 && t.z < 5)
  expect(bosc.length).toBeGreaterThan(20)
  const t = bosc[0]
  // si cor cuintri il tronc di est: si reste di ca
  const r = walkFor(physics, [t.x + 3, LAND, t.z], Math.PI / 2, 60)
  expect(r.body.x).toBeGreaterThan(t.x)
})
