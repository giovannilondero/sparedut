import { expect, test } from "bun:test"
import { MODE_IDS } from "../shared/folklore.ts"
import { IDLE_INPUT } from "../shared/input.ts"
import { MARAN } from "../shared/maps/maran.ts"
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
