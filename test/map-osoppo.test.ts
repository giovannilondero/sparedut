import { beforeAll, describe, expect, test } from "bun:test"
import { playBots } from "./play.ts"
import { MODE_IDS } from "../shared/folklore.ts"
import { IDLE_INPUT } from "../shared/input.ts"
import { FORT, O_RAMPART, OSOPPO } from "../shared/maps/osoppo.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"

let physics: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  physics = createPhysicsWorld(OSOPPO)
})

const at = (x: number, y: number, z: number): Body => ({ x, y: y + 0.05, z, vx: 0, vy: 0, vz: 0, grounded: true, crouch: false })

describe("Fuart di Osôf", () => {
  test("il cjar si spinge lungo tutto il percorso: si cammina sui suoi punti senza staccarsi", () => {
    const track = OSOPPO.track
    let b = at(...track[0])
    let worst = 0
    for (let i = 1; i < track.length; i++) {
      const [tx, ty, tz] = track[i]
      for (let k = 0; k < 60 * 30; k++) {
        const dx = tx - b.x
        const dz = tz - b.z
        if (Math.hypot(dx, dz) < 0.5) break
        b = stepBody(b, { ...IDLE_INPUT, mz: 1, yaw: Math.atan2(-dx, -dz) }, physics, 1).body
        // Distanza dal tratto corrente (in pianta) e quota rispetto alla spezzata.
        const [ax, ay, az] = track[i - 1]
        const len = Math.hypot(tx - ax, tz - az)
        const u = Math.max(0, Math.min(1, ((b.x - ax) * (tx - ax) + (b.z - az) * (tz - az)) / (len * len)))
        const off = Math.hypot(b.x - (ax + (tx - ax) * u), b.z - (az + (tz - az) * u))
        const dy = Math.abs(b.y - (ay + (ty - ay) * u))
        worst = Math.max(worst, off, dy)
      }
      expect(Math.hypot(tx - b.x, tz - b.z)).toBeLessThan(0.6)
      expect(Math.abs(b.y - ty)).toBeLessThan(0.3)
    }
    expect(worst).toBeLessThan(1)
  })

  test("i cjars di fen tirano sulla cima dei bastioni", () => {
    for (const pad of OSOPPO.jumpPads) {
      let b = at(...pad.at)
      for (let i = 0; i < 60 * 4; i++) b = stepBody(b, IDLE_INPUT, physics, 1).body
      expect(b.y).toBeCloseTo(O_RAMPART, 0)
      expect(Math.abs(Math.abs(b.z) - (FORT.rampart.z0 + FORT.rampart.z1) / 2)).toBeLessThan(4)
    }
  })

  test("si rinasce in piedi sul terreno, non dentro un muro", () => {
    for (const team of ["benandanti", "malandanti"] as const) {
      for (const s of OSOPPO.spawns[team]) {
        let b = at(...s.at)
        for (let i = 0; i < 30; i++) b = stepBody(b, IDLE_INPUT, physics, 1).body
        expect(b.grounded).toBe(true)
        expect(Math.abs(b.y - s.at[1])).toBeLessThan(0.1)
        expect(physics.canStand(b)).toBe(true)
      }
    }
  })
})

for (const mode of MODE_IDS) {
  test(`i bot giocano una partita al Fuart di Osôf: ${mode}`, () => {
    const { kills, view: v } = playBots("osoppo", mode)
    console.log("osoppo", mode, { score: v.score, kills, hill: v.hill })
    expect(kills).toBeGreaterThan(3)
  }, 120000)
}
