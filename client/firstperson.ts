/**
 * First-person presentation: what the local player's own view shows, decided from
 * plain data. No renderer here; the frame loop and the viewmodel read the result.
 */
import { turretAim, type TurretSpot, type V3 } from "../shared/map.ts"
import { TURRET, WEAPONS, type WeaponId } from "../shared/weapons.ts"

export interface FirstPersonInput {
  /** The weapon the player chose to hold (their loadout slot). */
  readonly chosen: WeaponId
  /** The turret the player is mounted on, or null when on foot. */
  readonly mount: { readonly turret: number; readonly spot: TurretSpot } | null
  readonly alive: boolean
  /** How far into aiming the view is: 0 = hip, 1 = fully aimed. */
  readonly aim: number
  /** The player's field of view setting, in degrees. */
  readonly baseFov: number
  /** Seconds since the player's last shot; Infinity if none. */
  readonly sinceShot: number
  /** Where the player looks, in radians. */
  readonly look: { readonly yaw: number; readonly pitch: number }
}

/** The mitraie on its turret's tripod, as its gunner sees it: the world's gun, turned around its pivot. */
export interface MitraiePose {
  readonly turret: number
  /** The pivot in the world: fixed on the tripod, whatever the aim. */
  readonly pivot: V3
  /** The gun's aim around the pivot, kept inside the turret's arc. */
  readonly yaw: number
  readonly pitch: number
  /** How far the last shot throws the gun back along its barrel (m). */
  readonly recoil: number
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
  /** The carried weapon is drawn in the hands. Never on a turret: there the gun is the mitraie on its pivot. */
  readonly drawWeapon: boolean
  readonly crosshair: boolean
  /** Mounted: the pose of the mitraie on its pivot. Null on foot. */
  readonly mitraie: MitraiePose | null
}

/** Weapons with a scope overlay. The mitraie has none, so a turret never shows one. */
const SCOPED: ReadonlySet<WeaponId> = new Set<WeaponId>(["cjampanili"])
/** How far into aiming the scope overlay replaces the view. */
const SCOPE_AT = 0.85

export const firstPerson = (input: FirstPersonInput): FirstPersonView => {
  const inHand: WeaponId = input.mount ? "mitraie" : input.chosen
  const fov = input.baseFov + (WEAPONS[inHand].aimFov - input.baseFov) * input.aim
  const scope = SCOPED.has(inHand) && input.aim > SCOPE_AT
  return { inHand, fov, lookScale: fov / input.baseFov, scope, drawWeapon: input.alive && !scope && !input.mount, crosshair: input.alive && !scope, mitraie: mitraiePose(input) }
}

/** The mitraie's kick on its tripod: how far back (m) and for how long (s). It fires every 4 ticks, so a burst keeps it shaking. */
const RECOIL = { back: 0.04, seconds: 0.08 }

const mitraiePose = ({ mount, look, sinceShot }: FirstPersonInput): MitraiePose | null => {
  if (!mount) return null
  const { at } = mount.spot
  const aim = turretAim(mount.spot, look.yaw, look.pitch)
  const left = Math.max(0, 1 - sinceShot / RECOIL.seconds)
  return { turret: mount.turret, pivot: [at[0], at[1] + TURRET.pivot, at[2]], yaw: aim.yaw, pitch: aim.pitch, recoil: RECOIL.back * left * left }
}
