/**
 * Predizione del proprio movimento: applico subito i miei comandi con la stessa
 * fisica del server, e quando arriva l'istantanea rigioco quelli non ancora confermati.
 */
import type { PlayerInput } from "../shared/input.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import type { PhysicsWorld } from "../shared/physics.ts"

export class Predictor {
  body: Body | null = null
  /** Il corpo al tick precedente: la camera disegna fra i due, non a scatti di 60 Hz. */
  prev: Body | null = null
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
    this.prev = this.body
    this.body = step.body
  }

  reconcile(server: Body, ackSeq: number, alive: boolean) {
    if (!alive) {
      this.body = server
      this.prev = server
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
        // Anche il tick precedente si sposta della correzione: l'interpolazione resta continua.
        if (this.prev) this.prev = { ...this.prev, x: this.prev.x - dx, y: this.prev.y - dy, z: this.prev.z - dz }
      } else this.prev = body
    }
    this.body = body
  }

  decay(dt: number) {
    const k = Math.exp(-dt * 12)
    this.smooth.x *= k
    this.smooth.y *= k
    this.smooth.z *= k
  }

  /** Posizione da disegnare: fra il tick precedente e l'ultimo, `alpha` in [0, 1]. */
  render(alpha: number) {
    const b = this.body
    const p = this.prev ?? b
    if (!b || !p) return null
    // Un salto grande (rinascita, correzione forte) non si interpola.
    if (Math.abs(b.x - p.x) + Math.abs(b.y - p.y) + Math.abs(b.z - p.z) > 3) return { x: b.x, y: b.y, z: b.z }
    return { x: p.x + (b.x - p.x) * alpha, y: p.y + (b.y - p.y) * alpha, z: p.z + (b.z - p.z) * alpha }
  }

  reset() {
    this.prev = null
    this.body = null
    this.pending = []
  }
}
