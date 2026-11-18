import { describe, expect, test } from "bun:test"
import { ROOM_MODE_IDS } from "../shared/folklore.ts"
import { BUTTON, IDLE_INPUT } from "../shared/input.ts"
import { BOARDWALK_Y, CASOT, LAND, LANTERNS, MARAN, PONT, RAILS, SEA, TREES } from "../shared/maps/maran.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import { createPhysicsWorld, initPhysics } from "../shared/physics.ts"
import { playBots } from "./play.ts"

for (const mode of ROOM_MODE_IDS) {
  test(`bots play a match at Lagune di Maran: ${mode}`, async () => {
    await initPhysics()
    const { kills, view: v } = playBots("maran", mode)
    console.log("maran", mode, { score: v.score, kills })
    expect(kills).toBeGreaterThan(3)
  }, 120000)
}

test("the cjar route at Lagune di Maran can be walked on foot", async () => {
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
      // distance from the segment
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

test("wading is slow, on the boardwalk it isn't; and from the water you get back onto the bank", async () => {
  await initPhysics()
  const physics = createPhysicsWorld(MARAN)
  // one second southwards: in the water in the canal between the arzin and the barene, then on the boardwalk
  const wet = walkFor(physics, [-15, SEA, 20], Math.PI, 60)
  const dry = walkFor(physics, [-15, BOARDWALK_Y, -4.8], -Math.PI / 2, 60)
  const wetRun = Math.abs(wet.body.z - 20)
  const dryRun = Math.abs(dry.body.x + 15)
  expect(wetRun).toBeLessThan(dryRun * 0.7)
  expect(wetRun).toBeGreaterThan(dryRun * 0.4)
  // from the water you climb onto the bank without jumping, even slowly and at an angle
  for (const [from, yaw] of [[[12, SEA, -24], Math.PI / 2], [[15, SEA, -40], 0], [[-20, SEA, -8], -Math.PI / 2 - 0.4], [[35, SEA, 50], 0.3]] as const) {
    const out = walkFor(physics, from as [number, number, number], yaw, 150)
    expect(out.body.y).toBeGreaterThan(-0.05)
  }
})

test("the puintut can be crossed on foot, humpbacked as it is", async () => {
  await initPhysics()
  const physics = createPhysicsWorld(MARAN)
  const r = walkFor(physics, [30, LAND, PONT.z0 - 1.5], Math.PI, 200)
  expect(r.top).toBeGreaterThan(PONT.deck - 0.1)
  expect(r.body.z).toBeGreaterThan(PONT.z1)
  expect(r.body.y).toBeGreaterThan(-0.05)
})

test("the trees in the bosc are solid", async () => {
  await initPhysics()
  const physics = createPhysicsWorld(MARAN)
  const bosc = TREES.filter((t) => t.x > 12 && t.x < 40 && t.z > -34 && t.z < 5)
  expect(bosc.length).toBeGreaterThan(20)
  const t = bosc[0]
  // running into the trunk from the east: you stay on this side
  const r = walkFor(physics, [t.x + 3, LAND, t.z], Math.PI / 2, 60)
  expect(r.body.x).toBeGreaterThan(t.x)
})

test("the lanterns are solid and don't block the paths", async () => {
  await initPhysics()
  const physics = createPhysicsWorld(MARAN)
  for (const l of LANTERNS) {
    const hit = physics.raycast({ x: l.x + 1, y: l.y + 1, z: l.z }, { x: -1, y: 0, z: 0 }, 2)
    expect(hit).not.toBeNull()
    expect(Math.min(...MARAN.navPoints.map((p) => Math.hypot(p[0] - l.x, p[2] - l.z)))).toBeGreaterThan(1.2)
  }
})

test("handrails can't be crossed: boardwalk and puintut", async () => {
  await initPhysics()
  const physics = createPhysicsWorld(MARAN)
  expect(RAILS.length).toBeGreaterThan(8)
  // from the barene boardwalk (z between -6 and -3.6) southwards: the handrail stops you
  const side = walkFor(physics, [-10, BOARDWALK_Y, -4.8], Math.PI, 90)
  expect(side.body.z).toBeLessThan(-3.6)
  expect(side.body.y).toBeGreaterThan(-0.05)
  // from the puintut eastwards
  const deck = walkFor(physics, [30, PONT.deck, 8], -Math.PI / 2, 90)
  expect(deck.body.x).toBeLessThan(PONT.x1)
  expect(deck.body.y).toBeGreaterThan(PONT.deck - 0.1)
})

describe("the casot's panel", () => {
  const panel = () => MARAN.panels?.[0]
  const centre = () => {
    const p = panel()!
    return { x: (p.min[0] + p.max[0]) / 2, y: (p.min[1] + p.max[1]) / 2, z: (p.min[2] + p.max[2]) / 2 }
  }
  /** A ray from one side of the wall to the other through the panel's middle, along its inward normal. */
  const across = (physics: ReturnType<typeof createPhysicsWorld>, from: "outside" | "inside") => {
    const p = panel()!
    const c = centre()
    const sign = from === "outside" ? 1 : -1
    const origin = { x: c.x - p.inward[0] * 3 * sign, y: c.y, z: c.z - p.inward[2] * 3 * sign }
    return physics.raycast(origin, { x: p.inward[0] * sign, y: 0, z: p.inward[2] * sign }, 6)
  }

  test("Lagune di Maran declares one panel, in a wall of the casot, reachable from inside", async () => {
    await initPhysics()
    expect(MARAN.panels?.length).toBe(1)
    const c = centre()
    const onWall = c.x >= CASOT.minX && c.x <= CASOT.maxX && c.z >= CASOT.minZ && c.z <= CASOT.maxZ
    expect(onWall).toBe(true)
    const p = panel()!
    // The inside is the casot's side: a step inward from the panel is inside its walls.
    const inX = c.x + p.inward[0] * 1.2
    const inZ = c.z + p.inward[2] * 1.2
    expect(inX > CASOT.minX + CASOT.t && inX < CASOT.maxX - CASOT.t && inZ > CASOT.minZ + CASOT.t && inZ < CASOT.maxZ - CASOT.t).toBe(true)
    // With the door down, a body walks from the doorway up to where it faces the panel.
    const physics = createPhysicsWorld(MARAN)
    physics.setDoors([false])
    const doorway = walkTo(physics, [CASOT.minX - 1, LAND, 27], [CASOT.minX + 1.2, 27], 300)
    const r = walkTo(physics, [doorway.x, doorway.y, doorway.z], [inX, inZ], 300)
    expect(Math.hypot(r.x - inX, r.z - inZ)).toBeLessThan(0.5)
  })

  test("on the wall it is solid: no line of fire through it either way", async () => {
    await initPhysics()
    const physics = createPhysicsWorld(MARAN)
    expect(across(physics, "outside")).not.toBeNull()
    expect(across(physics, "inside")).not.toBeNull()
  })

  test("with the panel gone there is a line of fire through the gap both ways, and no way through on foot", async () => {
    await initPhysics()
    const physics = createPhysicsWorld(MARAN)
    physics.setPanels([false])
    expect(across(physics, "outside")).toBeNull()
    expect(across(physics, "inside")).toBeNull()
    // Running, jumping and crouching at the gap from inside: the sill and lintel keep you in.
    const p = panel()!
    const c = centre()
    const yaw = Math.atan2(p.inward[0], p.inward[2])
    for (const buttons of [0, BUTTON.jump, BUTTON.crouch, BUTTON.jump | BUTTON.crouch]) {
      let body: Body = { x: c.x + p.inward[0] * 1.2, y: LAND + 0.05, z: c.z + p.inward[2] * 1.2, vx: 0, vy: 0, vz: 0, grounded: true, crouch: false }
      for (let t = 0; t < 180; t++) body = stepBody(body, { ...IDLE_INPUT, mz: 1, yaw, buttons: t % 20 < 10 ? buttons : buttons & ~BUTTON.jump }, physics, 1.3).body
      const depth = (body.x - c.x) * p.inward[0] + (body.z - c.z) * p.inward[2]
      expect(depth).toBeGreaterThan(0)
    }
  })

  test("a new match's physics puts it back: the wall closes again", async () => {
    await initPhysics()
    const physics = createPhysicsWorld(MARAN)
    physics.setPanels([false])
    physics.setPanels([true])
    expect(across(physics, "outside")).not.toBeNull()
  })
})

/** Walks a body straight at (x, z) for up to `ticks`, turning towards it each tick. */
function walkTo(physics: ReturnType<typeof createPhysicsWorld>, from: [number, number, number], to: [number, number], ticks: number) {
  let body: Body = { x: from[0], y: from[1] + 0.05, z: from[2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false }
  for (let t = 0; t < ticks && Math.hypot(to[0] - body.x, to[1] - body.z) > 0.3; t++) {
    body = stepBody(body, { ...IDLE_INPUT, mz: 1, yaw: Math.atan2(-(to[0] - body.x), -(to[1] - body.z)) }, physics, 1).body
  }
  return body
}
