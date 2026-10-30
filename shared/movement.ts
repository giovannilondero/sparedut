/**
 * Il movimento in prima persona, funzione pura sullo stato del corpo.
 * La usa la simulazione sul server e, identica, la predizione del client.
 */
import { Ops } from "@typeonce/ritmo"
import type { PlayerInput } from "./input.ts"
import { pressed } from "./input.ts"
import type { PhysicsWorld } from "./physics.ts"

export const TICK_RATE = 60
export const DT = 1 / TICK_RATE

export const MOVE = {
  walk: 6.4,
  sprint: 9.2,
  crouch: 3.1,
  aim: 4.2,
  jump: 7.6,
  gravity: 22,
  groundAccel: 14,
  airAccel: 2.2,
  maxFall: 40
} as const

export const EYE_STAND = 1.6
export const EYE_CROUCH = 1.02

export interface Body {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly vx: number
  readonly vy: number
  readonly vz: number
  readonly grounded: boolean
  readonly crouch: boolean
}

export interface StepResult {
  readonly body: Body
  /** Il nome del cjar di fen che ha lanciato il giocatore in questo tick. */
  readonly launchedBy: string | null
  readonly fellOut: boolean
}

/** Il vettore "avanti" sull'orizzontale per un'imbardata. */
export const forward = (yaw: number) => ({ x: -Ops.sin(yaw), z: -Ops.cos(yaw) })

/** Direzione di sguardo completa. */
export const lookDir = (yaw: number, pitch: number) => {
  const cp = Ops.cos(pitch)
  return { x: -Ops.sin(yaw) * cp, y: Ops.sin(pitch), z: -Ops.cos(yaw) * cp }
}

export const eyeHeight = (body: Body) => (body.crouch ? EYE_CROUCH : EYE_STAND)

/** Si corre: Shift, avanti, né accucciati né mirando. Chi corre tiene l'arma abbassata e non spara. */
export const sprinting = (input: PlayerInput, crouch: boolean) => pressed(input, "sprint") && !crouch && !pressed(input, "aim") && input.mz > 0

/**
 * Un tick di movimento. `speedScale` porta il peso dell'arma e la sgnape.
 */
export function stepBody(body: Body, input: PlayerInput, physics: PhysicsWorld, speedScale: number): StepResult {
  const wantsCrouch = pressed(input, "crouch")
  const crouch = wantsCrouch || (body.crouch && !physics.canStand(body))
  const aiming = pressed(input, "aim")
  const wade = physics.map.wade
  const wet = wade !== undefined && body.y < wade.level - 0.05
  const speed = (crouch ? MOVE.crouch : aiming ? MOVE.aim : sprinting(input, crouch) ? MOVE.sprint : MOVE.walk) * speedScale * (wet ? wade.speed : 1)

  const f = forward(input.yaw)
  // destra = avanti ruotato di 90° in senso orario visto dall'alto
  const r = { x: -f.z, z: f.x }
  let wx = f.x * input.mz + r.x * input.mx
  let wz = f.z * input.mz + r.z * input.mx
  const wl = Math.sqrt(wx * wx + wz * wz)
  if (wl > 1) {
    wx /= wl
    wz /= wl
  }
  const tx = wx * speed
  const tz = wz * speed
  const accel = body.grounded ? MOVE.groundAccel : MOVE.airAccel
  const k = Math.min(1, accel * DT)
  let vx = body.vx + (tx - body.vx) * k
  let vz = body.vz + (tz - body.vz) * k
  // In aria si mantiene lo slancio: l'input aggiunge, non frena sotto la velocità attuale.
  if (!body.grounded && wl < 0.01) {
    vx = body.vx
    vz = body.vz
  }
  let vy = body.vy
  if (body.grounded && pressed(input, "jump") && !crouch) vy = MOVE.jump
  vy = Math.max(-MOVE.maxFall, vy - MOVE.gravity * DT)

  let launchedBy: string | null = null
  for (const pad of physics.map.jumpPads) {
    const dx = body.x - pad.at[0]
    const dz = body.z - pad.at[2]
    if (dx * dx + dz * dz < pad.radius * pad.radius && Math.abs(body.y - pad.at[1]) < 0.6 && body.vy <= 0.5) {
      vx = pad.launch[0]
      vy = pad.launch[1]
      vz = pad.launch[2]
      launchedBy = pad.name
    }
  }

  const moved = physics.moveCharacter(body, { x: vx * DT, y: vy * DT, z: vz * DT }, crouch)
  const grounded = moved.grounded && vy <= 0.01
  if (grounded) vy = 0
  if (moved.hitCeiling && vy > 0) vy = 0
  // La velocità orizzontale segue lo spostamento reale (niente spinta contro i muri).
  const realVx = (moved.x - body.x) / DT
  const realVz = (moved.z - body.z) / DT
  if (Math.abs(realVx) < Math.abs(vx)) vx = realVx
  if (Math.abs(realVz) < Math.abs(vz)) vz = realVz

  return {
    body: { x: moved.x, y: moved.y, z: moved.z, vx, vy, vz, grounded, crouch },
    launchedBy,
    fellOut: moved.y < physics.map.killY
  }
}
