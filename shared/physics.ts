/**
 * Il mondo fisico statico di Gemona in Rapier 3D: muri, terreno, rampe.
 * Lo costruiscono sia il server (simulazione autoritativa) sia il client
 * (predizione del proprio movimento), dagli stessi dati di `map.ts`.
 *
 * I giocatori non collidono fra loro (stile arena): ognuno è una capsula che il
 * character controller muove contro il solo mondo statico.
 */
import RAPIER from "@dimforge/rapier3d-compat"
import { BLOCKS, WEDGES } from "./map.ts"
import type { Vec3 } from "./vec.ts"

export const CAPSULE_RADIUS = 0.4
/** Mezza altezza del cilindro centrale: in piedi 1.8 m, accucciato 1.1 m. */
const HALF_STAND = 0.5
const HALF_CROUCH = 0.15
export const STAND_HEIGHT = 2 * (HALF_STAND + CAPSULE_RADIUS)
export const CROUCH_HEIGHT = 2 * (HALF_CROUCH + CAPSULE_RADIUS)

// Gruppi: il mondo è il gruppo 1, i personaggi il 2 (vedono solo il mondo), i raggi il 3.
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
}

/** Ciò che la simulazione chiede alla fisica. */
export interface PhysicsWorld {
  /** Sposta un personaggio coi piedi in `feet` di `delta`, scivolando sui muri. */
  readonly moveCharacter: (feet: Vec3, delta: Vec3, crouch: boolean) => MoveResult
  /** C'è spazio per alzarsi in piedi? */
  readonly canStand: (feet: Vec3) => boolean
  /** Primo muro lungo il raggio (dir normalizzata), entro `maxDist`. */
  readonly raycast: (origin: Vec3, dir: Vec3, maxDist: number) => RayHit | null
  readonly lineOfSight: (a: Vec3, b: Vec3) => boolean
}

let ready: Promise<void> | null = null
/** Carica il WASM di Rapier una volta per processo. */
export const initPhysics = () => (ready ??= RAPIER.init())

export function createPhysicsWorld(): PhysicsWorld {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  for (const b of BLOCKS) {
    const hx = (b.max[0] - b.min[0]) / 2
    const hy = (b.max[1] - b.min[1]) / 2
    const hz = (b.max[2] - b.min[2]) / 2
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(b.min[0] + hx, b.min[1] + hy, b.min[2] + hz)
        .setCollisionGroups(WORLD_GROUPS)
    )
  }
  for (const w of WEDGES) {
    const base = Math.min(w.y0, w.y1) - 0.5
    const points = new Float32Array([
      w.x0, base, w.z0, w.x1, base, w.z0, w.x0, base, w.z1, w.x1, base, w.z1,
      w.x0, w.y0, w.z0, w.x1, w.y0, w.z0, w.x0, w.y1, w.z1, w.x1, w.y1, w.z1
    ])
    const desc = RAPIER.ColliderDesc.convexHull(points)
    if (desc) world.createCollider(desc.setCollisionGroups(WORLD_GROUPS))
  }
  const stand = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_STAND, CAPSULE_RADIUS).setCollisionGroups(CHARACTER_GROUPS))
  const crouch = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_CROUCH, CAPSULE_RADIUS).setCollisionGroups(CHARACTER_GROUPS))
  const controller = world.createCharacterController(0.02)
  controller.enableAutostep(0.5, 0.25, false)
  controller.enableSnapToGround(0.35)
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
    return { dist: hit.timeOfImpact, normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } }
  }

  return {
    moveCharacter(feet, delta, crouching) {
      const collider = crouching ? crouch : stand
      const half = crouching ? HALF_CROUCH : HALF_STAND
      const lift = half + CAPSULE_RADIUS
      collider.setTranslation({ x: feet.x, y: feet.y + lift, z: feet.z })
      controller.computeColliderMovement(collider, { x: delta.x, y: delta.y, z: delta.z }, undefined, CHARACTER_GROUPS)
      const m = controller.computedMovement()
      return {
        x: feet.x + m.x,
        y: feet.y + m.y,
        z: feet.z + m.z,
        grounded: controller.computedGrounded(),
        hitCeiling: delta.y > 0.001 && m.y < delta.y * 0.5
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
    }
  }
}
