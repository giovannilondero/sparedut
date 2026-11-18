/**
 * Touch layout C (under trial, spec #20): the weapon fires by itself while the crosshair rests on
 * an enemy within its range. This is the decision, without a renderer: the frame loop asks it once
 * per tick and presses fire for the player, so the server sees ordinary input. It never moves the
 * aim. Deleted with layout C if the owner does not keep it.
 */
import { rayPose } from "../shared/hitbox.ts"
import type { Vec3 } from "../shared/vec.ts"
import { WEAPONS, type WeaponId } from "../shared/weapons.ts"

/** Another player as the decision sees them: where they stand (feet), whether alive, whether an enemy. */
export interface Sighted {
  x: number
  y: number
  z: number
  crouch: boolean
  alive: boolean
  /** Not a teammate: the other team, or anyone in the Tampieste. */
  enemy: boolean
}

/**
 * The weapons that fire by themselves: the guns (single shot and automatic). Not the mescul (a
 * swing at arm's length), the Lanciafrico and the Gjalinis (lobbed shells that land elsewhere than
 * the crosshair), the Miedi (it heals teammates, which auto-fire never aims at) or the mitraie (its
 * heat is the gunner's to manage). For these the layout shows a manual fire.
 */
export const autoFired = (id: WeaponId) => id !== "mitraie" && (WEAPONS[id].mode === "semi" || WEAPONS[id].mode === "auto")

/** The look direction for a yaw and pitch, written into `out` (as `lookDir`, without allocating). */
export const aimDir = (out: { x: number; y: number; z: number }, yaw: number, pitch: number) => {
  const cp = Math.cos(pitch)
  out.x = -Math.sin(yaw) * cp
  out.y = Math.sin(pitch)
  out.z = -Math.cos(yaw) * cp
  return out
}

/** A sphere around a whole player's hitboxes (body box and head), from the feet: centre height and radius. */
const BOUND_Y = 0.93
const BOUND_Y_CROUCH = 0.68
const BOUND_R = 1.1

/**
 * Whether a shot from `eye` along `dir` (normalised) would meet an enemy first, within `range`:
 * the first player it meets is an enemy (a teammate in front shields the one behind), and no wall
 * stands before them. `wall` is the physics world's ray: the distance to the first wall within `max`, or null.
 *
 * Cost per call: a few multiplications per living player (a bounding-sphere test, no allocation);
 * only a player whose bounding sphere the line crosses gets the exact hitbox test (`rayPose`, a few
 * short-lived objects), and the wall ray is cast only when an enemy is hit first.
 */
export const enemyUnderCrosshair = (eye: Vec3, dir: Vec3, range: number, others: readonly Sighted[], wall: (origin: Vec3, dir: Vec3, max: number) => number | null): boolean => {
  let nearest = Infinity
  let enemy = false
  for (let i = 0; i < others.length; i++) {
    const p = others[i]
    if (!p.alive) continue
    const cx = p.x - eye.x
    const cy = p.y + (p.crouch ? BOUND_Y_CROUCH : BOUND_Y) - eye.y
    const cz = p.z - eye.z
    const along = cx * dir.x + cy * dir.y + cz * dir.z
    if (along < -BOUND_R || along - BOUND_R > Math.min(range, nearest)) continue
    if (cx * cx + cy * cy + cz * cz - along * along > BOUND_R * BOUND_R) continue
    const hit = rayPose(eye, dir, p)
    if (!hit || hit.dist >= nearest) continue
    nearest = hit.dist
    enemy = p.enemy
  }
  return enemy && nearest <= range && wall(eye, dir, nearest) === null
}
