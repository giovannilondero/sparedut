/**
 * First-person presentation: what the local player's own view shows, decided from
 * plain data. No renderer here; the frame loop and the viewmodel read the result.
 */
import { WEAPONS, type WeaponId } from "../shared/weapons.ts"

export interface FirstPersonInput {
  /** The weapon the player chose to hold (their loadout slot). */
  readonly chosen: WeaponId
  /** The turret the player is mounted on, or null when on foot. */
  readonly mount: { readonly turret: number } | null
  readonly alive: boolean
  /** How far into aiming the view is: 0 = hip, 1 = fully aimed. */
  readonly aim: number
  /** The player's field of view setting, in degrees. */
  readonly baseFov: number
}

export interface FirstPersonView {
  /** What the player actually holds: the mitraie on a turret, the chosen weapon otherwise. */
  readonly inHand: WeaponId
  /** Vertical field of view, in degrees. */
  readonly fov: number
  /** Look sensitivity multiplier: slower in proportion to the zoom. */
  readonly lookScale: number
  /** The scope overlay replaces the view. */
  readonly scope: boolean
  /** The weapon in hand is drawn. */
  readonly drawWeapon: boolean
  readonly crosshair: boolean
}

/** Weapons with a scope overlay. The mitraie has none, so a turret never shows one. */
const SCOPED: ReadonlySet<WeaponId> = new Set<WeaponId>(["cjampanili"])
/** How far into aiming the scope overlay replaces the view. */
const SCOPE_AT = 0.85

export const firstPerson = (input: FirstPersonInput): FirstPersonView => {
  const inHand: WeaponId = input.mount ? "mitraie" : input.chosen
  const fov = input.baseFov + (WEAPONS[inHand].aimFov - input.baseFov) * input.aim
  const scope = SCOPED.has(inHand) && input.aim > SCOPE_AT
  return { inHand, fov, lookScale: fov / input.baseFov, scope, drawWeapon: input.alive && !scope, crosshair: input.alive && !scope }
}
