import { beforeAll, expect, test } from "bun:test"
import { playBots } from "./play.ts"
import { MODE_IDS } from "../shared/folklore.ts"
import { IDLE_INPUT } from "../shared/input.ts"
import { trackLength, trackPoint } from "../shared/map.ts"
import { GATE, VENZONE } from "../shared/maps/venzone.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"

let physics: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  physics = createPhysicsWorld(VENZONE)
})

const at = (x: number, y: number, z: number): Body => ({ x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, crouch: false })

test("the cjar route at Vençon can be walked end to end, on the floor", () => {
  const track = VENZONE.track
  const total = trackLength(track)
  let body = at(track[0][0], track[0][1] + 0.05, track[0][2])
  let worst = 0
  // Follow a point advancing along the route, and always stay close.
  for (let d = 0; d <= total; d += 0.08) {
    const p = trackPoint(track, d).at
    const yaw = Math.atan2(-(p[0] - body.x), -(p[2] - body.z))
    const far = Math.hypot(p[0] - body.x, p[2] - body.z)
    body = stepBody(body, { ...IDLE_INPUT, mz: far > 0.3 ? 1 : 0, yaw }, physics, 1).body
    worst = Math.max(worst, Math.hypot(p[0] - body.x, p[2] - body.z), Math.abs(p[1] - body.y))
  }
  const end = track[track.length - 1]
  expect(worst).toBeLessThan(1)
  expect(Math.hypot(end[0] - body.x, end[2] - body.z)).toBeLessThan(1)
})

test("the cjars di fen at Vençon take you to the top of the gates", () => {
  for (const pad of VENZONE.jumpPads) {
    let body = at(pad.at[0], pad.at[1] + 0.1, pad.at[2])
    for (let i = 0; i < 60 * 4; i++) body = stepBody(body, IDLE_INPUT, physics, 1).body
    // The top of the tower: at 12 m, inside the parapet.
    expect(body.y).toBeCloseTo(GATE.top, 0)
    expect(Math.abs(body.x)).toBeLessThan(GATE.halfX - 0.5)
    expect(Math.abs(body.z)).toBeGreaterThan(95)
    expect(body.grounded).toBe(true)
  }
})

for (const mode of MODE_IDS) {
  test(`bots play at Vençon: ${mode}`, async () => {
    const { kills, view: v, msPerTick: ms } = playBots("venzone", mode)
    console.log("venzone", mode, { msPerTick: ms.toFixed(2), score: v.score, kills })
    expect(kills).toBeGreaterThan(3)
    expect(ms).toBeLessThan(8)
  }, 120000)
}
