import { beforeAll, expect, test } from "bun:test"
import { MODE_IDS } from "../shared/folklore.ts"
import { IDLE_INPUT } from "../shared/input.ts"
import { TRINCEE } from "../shared/maps/trincee.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import { createPhysicsWorld, initPhysics } from "../shared/physics.ts"
import { playBots } from "./play.ts"

beforeAll(async () => {
  await initPhysics()
})

for (const mode of MODE_IDS) {
  test(`i bot giocano tes trinceis: ${mode}`, () => {
    const { kills, view: v } = playBots("trincee", mode)
    console.log("trincee", mode, { score: v.score, kills })
    expect(kills).toBeGreaterThan(3)
  }, 120000)
}

test("la ferade Decauville si fâs a pît, sù e jù pes rampis", () => {
  const physics = createPhysicsWorld(TRINCEE)
  const track = TRINCEE.track
  let body: Body = { x: track[0][0], y: track[0][1], z: track[0][2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false }
  let worst = 0
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]
    const b = track[i]
    for (let t = 0; t < 60 * 20; t++) {
      const dx = b[0] - body.x
      const dz = b[2] - body.z
      if (Math.hypot(dx, dz) < 0.5) break
      body = stepBody(body, { ...IDLE_INPUT, mz: 1, yaw: Math.atan2(-dx, -dz) }, physics, 1).body
      // Distanza dal tratto (in pianta) e quota attesa sul tratto.
      const len = Math.hypot(b[0] - a[0], b[2] - a[2])
      const k = Math.max(0, Math.min(1, ((body.x - a[0]) * (b[0] - a[0]) + (body.z - a[2]) * (b[2] - a[2])) / (len * len)))
      const px = a[0] + (b[0] - a[0]) * k
      const pz = a[2] + (b[2] - a[2]) * k
      const py = a[1] + (b[1] - a[1]) * k
      worst = Math.max(worst, Math.hypot(body.x - px, body.z - pz), Math.abs(body.y - py))
    }
    expect(Math.hypot(b[0] - body.x, b[2] - body.z)).toBeLessThan(0.6)
  }
  expect(worst).toBeLessThan(1)
})
