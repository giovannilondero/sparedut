/**
 * Predizione del proprio movimento: applico subito i miei comandi con la stessa
 * fisica del server, e quando arriva l'istantanea rigioco quelli non ancora confermati.
 */
import type { PlayerInput } from "../shared/input.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import type { PhysicsWorld } from "../shared/physics.ts"

export class Predictor {
  body: Body | null = null
  private pending: { input: PlayerInput; scale: number }[] = []
  /** Scarto visivo dopo una correzione, assorbito piano piano. */
  readonly smooth = { x: 0, y: 0, z: 0 }
  launched = false

  constructor(private readonly physics: PhysicsWorld) {}

  apply(input: PlayerInput, scale: number) {
    if (!this.body) return
    this.pending.push({ input, scale })
    if (this.pending.length > 120) this.pending.shift()
    const step = stepBody(this.body, input, this.physics, scale)
    this.launched = step.launchedBy !== null
    this.body = step.body
  }

  reconcile(server: Body, ackSeq: number, alive: boolean) {
    if (!alive) {
      this.body = server
      this.pending = []
      return
    }
    this.pending = this.pending.filter((p) => p.input.seq > ackSeq)
    let body = server
    for (const p of this.pending) body = stepBody(body, p.input, this.physics, p.scale).body
    if (this.body) {
      const dx = this.body.x - body.x
      const dy = this.body.y - body.y
      const dz = this.body.z - body.z
      const err = Math.hypot(dx, dy, dz)
      // Piccoli errori si smussano, i grandi (teletrasporto, rinascita) no.
      if (err < 2) {
        this.smooth.x += dx
        this.smooth.y += dy
        this.smooth.z += dz
      }
    }
    this.body = body
  }

  decay(dt: number) {
    const k = Math.exp(-dt * 12)
    this.smooth.x *= k
    this.smooth.y *= k
    this.smooth.z *= k
  }

  reset() {
    this.body = null
    this.pending = []
  }
}
