/**
 * Prediction of our own movement: my inputs are applied immediately with the same
 * physics as the server, and when a snapshot arrives the unconfirmed ones are replayed.
 */
import type { PlayerInput } from "../shared/input.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import type { PhysicsWorld } from "../shared/physics.ts"

export class Predictor {
  body: Body | null = null
  /** The body at the previous tick: the camera draws between the two, not in 60 Hz steps. */
  prev: Body | null = null
  private pending: { input: PlayerInput; scale: number }[] = []
  /** Visual offset after a correction, absorbed gradually. */
  readonly smooth = { x: 0, y: 0, z: 0 }
  launched = false
  /** Diagnostics: recent corrections (metres), for the F3 panel. */
  corrections: number[] = []

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
      this.corrections.push(err)
      if (this.corrections.length > 60) this.corrections.shift()
      // Small errors get smoothed, large ones (teleport, respawn) don't.
      if (err < 2) {
        this.smooth.x += dx
        this.smooth.y += dy
        this.smooth.z += dz
        // The previous tick is shifted by the correction too: interpolation stays continuous.
        if (this.prev) this.prev = { ...this.prev, x: this.prev.x - dx, y: this.prev.y - dy, z: this.prev.z - dz }
      } else this.prev = body
    }
    this.body = body
  }

  /** Pinned where the server says (on the turret): nothing to predict or replay. */
  pin(server: Body) {
    this.body = server
    this.prev = server
    this.pending = []
  }

  decay(dt: number) {
    const k = Math.exp(-dt * 12)
    this.smooth.x *= k
    this.smooth.y *= k
    this.smooth.z *= k
  }

  /** Position to draw: between the previous and the latest tick, `alpha` in [0, 1]. */
  render(alpha: number) {
    const b = this.body
    const p = this.prev ?? b
    if (!b || !p) return null
    // A big jump (respawn, strong correction) isn't interpolated.
    if (Math.abs(b.x - p.x) + Math.abs(b.y - p.y) + Math.abs(b.z - p.z) > 3) return { x: b.x, y: b.y, z: b.z }
    return { x: p.x + (b.x - p.x) * alpha, y: p.y + (b.y - p.y) * alpha, z: p.z + (b.z - p.z) * alpha }
  }

  reset() {
    this.prev = null
    this.body = null
    this.pending = []
  }
}
