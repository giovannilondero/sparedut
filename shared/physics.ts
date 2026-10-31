/**
 * Gemona's static physics world in Rapier 3D: walls, terrain, ramps.
 * Both the server (authoritative simulation) and the client (prediction of
 * its own movement) build it from the same map data.
 *
 * Players don't collide with each other (arena style): each is a capsule the
 * character controller moves against the static world only.
 */
import RAPIER from "@dimforge/rapier3d-compat"
import type { MapDef } from "./map.ts"
import type { Vec3 } from "./vec.ts"

export const CAPSULE_RADIUS = 0.4
/** Half height of the central cylinder: 1.8 m standing, 1.1 m crouched. */
const HALF_STAND = 0.5
const HALF_CROUCH = 0.15
export const STAND_HEIGHT = 2 * (HALF_STAND + CAPSULE_RADIUS)
export const CROUCH_HEIGHT = 2 * (HALF_CROUCH + CAPSULE_RADIUS)

// Groups: the world is group 1, characters 2 (they only see the world), rays 3.
const groups = (membership: number, filter: number) => (membership << 16) | filter
const WORLD_GROUPS = groups(0b001, 0xffff)
const CHARACTER_GROUPS = groups(0b010, 0b001)
const RAY_GROUPS = groups(0b100, 0b001)

export interface MoveResult {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly grounded: boolean
  readonly hitCeiling: boolean
}

export interface RayHit {
  readonly dist: number
  readonly normal: Vec3
  /** The index of the door hit (in `map.doors`), or null for a wall. */
  readonly door: number | null
}

/** What the simulation asks of physics. */
export interface PhysicsWorld {
  /** The map the world is built from (cjars di fen, fall-out height). */
  readonly map: MapDef
  /** Moves a character with feet at `feet` by `delta`, sliding along walls. */
  readonly moveCharacter: (feet: Vec3, delta: Vec3, crouch: boolean) => MoveResult
  /** Is there room to stand up? */
  readonly canStand: (feet: Vec3) => boolean
  /** First wall along the ray (normalized dir), within `maxDist`. */
  readonly raycast: (origin: Vec3, dir: Vec3, maxDist: number) => RayHit | null
  readonly lineOfSight: (a: Vec3, b: Vec3) => boolean
  /**
   * Doors standing (true) or broken down, in `map.doors` order. Idempotent: the
   * simulation calls it every tick with the saved state, the client on every snapshot.
   */
  readonly setDoors: (standing: readonly boolean[]) => void
}

let ready: Promise<void> | null = null
/** Loads Rapier's WASM once per process. */
export const initPhysics = () => (ready ??= RAPIER.init())

/** Character controller parameters (overridable in tests). */
export const KCC = { offset: 0.02, autostep: true, snap: 0.35, split: true }

export function createPhysicsWorld(map: MapDef, tuning: Partial<typeof KCC> = {}): PhysicsWorld {
  const k = { ...KCC, ...tuning }
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  for (const b of map.blocks) {
    const hx = (b.max[0] - b.min[0]) / 2
    const hy = (b.max[1] - b.min[1]) / 2
    const hz = (b.max[2] - b.min[2]) / 2
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(b.min[0] + hx, b.min[1] + hy, b.min[2] + hz)
        .setCollisionGroups(WORLD_GROUPS)
    )
  }
  for (const w of map.wedges) {
    const base = Math.min(w.y0, w.y1) - 0.5
    const points = new Float32Array([
      w.x0, base, w.z0, w.x1, base, w.z0, w.x0, base, w.z1, w.x1, base, w.z1,
      w.x0, w.y0, w.z0, w.x1, w.y0, w.z0, w.x0, w.y1, w.z1, w.x1, w.y1, w.z1
    ])
    const desc = RAPIER.ColliderDesc.convexHull(points)
    if (desc) world.createCollider(desc.setCollisionGroups(WORLD_GROUPS))
  }
  const doorColliders = map.doors.map((d) => {
    const hx = (d.max[0] - d.min[0]) / 2
    const hy = (d.max[1] - d.min[1]) / 2
    const hz = (d.max[2] - d.min[2]) / 2
    return world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(d.min[0] + hx, d.min[1] + hy, d.min[2] + hz)
        .setCollisionGroups(WORLD_GROUPS)
    )
  })
  const doorOf = new Map(doorColliders.map((c, i) => [c.handle, i]))
  const stand = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_STAND, CAPSULE_RADIUS).setCollisionGroups(CHARACTER_GROUPS))
  const crouch = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_CROUCH, CAPSULE_RADIUS).setCollisionGroups(CHARACTER_GROUPS))
  const controller = world.createCharacterController(k.offset)
  if (k.autostep) controller.enableAutostep(0.5, 0.25, false)
  if (k.snap > 0) controller.enableSnapToGround(k.snap)
  controller.setMaxSlopeClimbAngle((55 * Math.PI) / 180)
  controller.setMinSlopeSlideAngle((60 * Math.PI) / 180)
  controller.setSlideEnabled(true)
  world.step()

  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })

  const raycast = (origin: Vec3, dir: Vec3, maxDist: number): RayHit | null => {
    ray.origin = { x: origin.x, y: origin.y, z: origin.z }
    ray.dir = { x: dir.x, y: dir.y, z: dir.z }
    const hit = world.castRayAndGetNormal(ray, maxDist, true, undefined, RAY_GROUPS)
    if (!hit) return null
    return { dist: hit.timeOfImpact, normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }, door: doorOf.get(hit.collider.handle) ?? null }
  }

  return {
    map,
    moveCharacter(feet, delta, crouching) {
      const collider = crouching ? crouch : stand
      const half = crouching ? HALF_CROUCH : HALF_STAND
      const lift = half + CAPSULE_RADIUS
      collider.setTranslation({ x: feet.x, y: feet.y + lift, z: feet.z })
      if (!k.split) {
        controller.computeColliderMovement(collider, { x: delta.x, y: delta.y, z: delta.z }, undefined, CHARACTER_GROUPS)
        const m = controller.computedMovement()
        return {
          x: feet.x + m.x,
          y: feet.y + m.y,
          z: feet.z + m.z,
          grounded: controller.computedGrounded(),
          hitCeiling: delta.y > 0.001 && m.y < delta.y * 0.5
        }
      }
      // Horizontal first (with steps), then vertical: a body resting on the ground
      // doesn't get stuck in the floor while walking.
      controller.computeColliderMovement(collider, { x: delta.x, y: 0, z: delta.z }, undefined, CHARACTER_GROUPS)
      const h = controller.computedMovement()
      const mid = { x: feet.x + h.x, y: feet.y + h.y, z: feet.z + h.z }
      collider.setTranslation({ x: mid.x, y: mid.y + lift, z: mid.z })
      controller.computeColliderMovement(collider, { x: 0, y: delta.y, z: 0 }, undefined, CHARACTER_GROUPS)
      const v = controller.computedMovement()
      return {
        x: mid.x + v.x,
        y: mid.y + v.y,
        z: mid.z + v.z,
        grounded: controller.computedGrounded(),
        hitCeiling: delta.y > 0.001 && v.y < delta.y * 0.5
      }
    },
    canStand(feet) {
      const from = { x: feet.x, y: feet.y + CROUCH_HEIGHT - 0.05, z: feet.z }
      const up = { x: 0, y: 1, z: 0 }
      const need = STAND_HEIGHT - CROUCH_HEIGHT + 0.1
      for (const [ox, oz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
        if (raycast({ x: from.x + ox, y: from.y, z: from.z + oz }, up, need)) return false
      }
      return true
    },
    raycast,
    lineOfSight(a, b) {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dz = b.z - a.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < 1e-6) return true
      return raycast(a, { x: dx / d, y: dy / d, z: dz / d }, d) === null
    },
    setDoors(standing) {
      let changed = false
      doorColliders.forEach((c, i) => {
        const on = standing[i] ?? true
        if (c.isEnabled() !== on) {
          c.setEnabled(on)
          changed = true
        }
      })
      // Queries (rays, character controller) see the change after one step.
      if (changed) world.step()
    }
  }
}
