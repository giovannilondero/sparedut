/**
 * Hitbox dei giocatori: un parallelepipedo per il corpo e una sfera per la testa.
 * Pura geometria, usata dalla simulazione per i colpi istantanei.
 */
import type { Vec3 } from "./vec.ts"

export interface Pose {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly crouch: boolean
}

const BODY_HALF = 0.36
const HEAD_R = 0.24

export const headCenter = (p: Pose): Vec3 => ({ x: p.x, y: p.y + (p.crouch ? 1.12 : 1.62), z: p.z })
export const bodyCenter = (p: Pose): Vec3 => ({ x: p.x, y: p.y + (p.crouch ? 0.5 : 0.75), z: p.z })

/** Distanza lungo il raggio (dir normalizzata) dell'ingresso nella sfera, o null. */
export function raySphere(o: Vec3, d: Vec3, c: Vec3, r: number): number | null {
  const ox = o.x - c.x
  const oy = o.y - c.y
  const oz = o.z - c.z
  const b = ox * d.x + oy * d.y + oz * d.z
  const cc = ox * ox + oy * oy + oz * oz - r * r
  const disc = b * b - cc
  if (disc < 0) return null
  const t = -b - Math.sqrt(disc)
  return t >= 0 ? t : cc < 0 ? 0 : null
}

export function rayBox(o: Vec3, d: Vec3, min: Vec3, max: Vec3): number | null {
  let t0 = 0
  let t1 = 1e9
  for (const axis of ["x", "y", "z"] as const) {
    const inv = 1 / (d[axis] === 0 ? 1e-12 : d[axis])
    let a = (min[axis] - o[axis]) * inv
    let b = (max[axis] - o[axis]) * inv
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
    if (t0 > t1) return null
  }
  return t0
}

/** Il colpo prende il giocatore in `pose`? Restituisce distanza e se è in testa. */
export function rayPose(o: Vec3, d: Vec3, pose: Pose): { dist: number; head: boolean } | null {
  const head = raySphere(o, d, headCenter(pose), HEAD_R)
  const top = pose.y + (pose.crouch ? 0.9 : 1.4)
  const body = rayBox(o, d, { x: pose.x - BODY_HALF, y: pose.y, z: pose.z - BODY_HALF }, { x: pose.x + BODY_HALF, y: top, z: pose.z + BODY_HALF })
  if (head !== null && (body === null || head <= body + 0.05)) return { dist: head, head: true }
  if (body !== null) return { dist: body, head: false }
  return null
}
