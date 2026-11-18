/**
 * First-person presentation: what the local player's own view shows, decided from
 * plain data. No renderer here; the frame loop and the viewmodel read the result.
 */
import { turretAim, turretSeat, type TurretSpot, type V3 } from "../shared/map.ts"
import { WEAPONS, type WeaponId } from "../shared/weapons.ts"

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
  /** The viewport's width over its height: below 1 it is portrait. */
  readonly aspect: number
  /** Rounds in the chosen weapon's magazine, as this client knows it. */
  readonly mag: number
  /** Rounds in reserve for the chosen weapon. */
  readonly reserve: number
  /** The reload under way, or null: progress from 0 to 1 and the magazine and reserve it started from. */
  readonly reload: { readonly progress: number; readonly mag: number; readonly reserve: number } | null
  /** Seconds since the player's last shot; Infinity if none. */
  readonly sinceShot: number
  /** Where the player looks, in radians. */
  readonly look: { readonly yaw: number; readonly pitch: number }
}

/**
 * The mitraie on its turret's tripod, as its gunner sees it: the world's gun, turned around the
 * pivot its tripod is built with (`TURRET.pivot`), which no aim or recoil moves.
 */
export interface MitraiePose {
  readonly turret: number
  /** The gun's aim around the pivot, kept inside the turret's arc. */
  readonly yaw: number
  readonly pitch: number
  /** How far the last shot throws the gun back along its barrel (m). */
  readonly recoil: number
  /**
   * Where the gunner stands, behind the gun at this aim: the shared `turretSeat` of the
   * player's own look, the one the simulation uses too, so the eye never waits for the host.
   */
  readonly seat: V3
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
  /** A hen sits at the hen cannon's mouth. */
  readonly henAtMouth: boolean
  /** Hens the reload under way drops into the hen cannon: the rounds it loads. 0 when not reloading it. */
  readonly reloadHens: number
  /** Of those, how many have gone in so far: each one clucks as it does. */
  readonly hensIn: number
  /** Mounted: the pose of the mitraie on its pivot. Null on foot. */
  readonly mitraie: MitraiePose | null
}

/**
 * The view in a portrait viewport, in degrees: the vertical field of view is raised until the
 * view across reaches `horizontal`, but never past `maxVertical`, which bounds the stretch at
 * the top and bottom edges. Tuned by eye on a real phone.
 */
export const PORTRAIT_FOV = { horizontal: 90, maxVertical: 110 } as const

const RAD = Math.PI / 180

/** The vertical field of view the player sees at rest: their setting, widened in portrait. */
const restingFov = (baseFov: number, aspect: number): number => {
  if (aspect >= 1) return baseFov
  const reach = (2 * Math.atan(Math.tan((PORTRAIT_FOV.horizontal * RAD) / 2) / aspect)) / RAD
  return Math.max(baseFov, Math.min(reach, PORTRAIT_FOV.maxVertical))
}

/** How far into aiming the scope overlay replaces the view. */
const SCOPE_AT = 0.85
/** Seconds after a shot before the next hen is back at the cannon's mouth. */
export const HEN_BACK_AFTER = 0.45

/**
 * The hen cannon's reload, as fractions of the reload's duration (which stays the weapon's own):
 * the lid opens, the hens drop in one at a time, the lid closes, a hen comes up to the mouth.
 */
export const HEN_RELOAD = { lidOpen: [0.06, 0.16], drops: [0.2, 0.76], lidClose: [0.78, 0.86], mouth: 0.9 } as const

/** Within its own turn, when a dropped hen has gone into the chamber (and clucks). */
export const HEN_IN = 0.8

/**
 * How far hen `i` of `count` is through her own turn at the chamber, from 0 (not yet taken)
 * to 1 (gone in): the hens share the drop window in equal turns, one after the other.
 */
export const henDrop = (progress: number, count: number, i: number): number => {
  const [from, to] = HEN_RELOAD.drops
  const turn = (to - from) / Math.max(1, count)
  return Math.min(1, Math.max(0, (progress - from - i * turn) / turn))
}

export const firstPerson = (input: FirstPersonInput): FirstPersonView => {
  const inHand: WeaponId = input.mount ? "mitraie" : input.chosen
  const aimed = input.baseFov + (WEAPONS[inHand].aimFov - input.baseFov) * input.aim
  // Portrait widens the resting view and keeps the zoom aiming gives over the player's own setting.
  const resting = restingFov(input.baseFov, input.aspect)
  const fov = resting === input.baseFov ? aimed : (aimed / input.baseFov) * resting
  const scope = WEAPONS[inHand].scope && input.aim > SCOPE_AT
  const hen = henCannon(inHand, input)
  return { inHand, fov, lookScale: aimed / input.baseFov, scope, drawWeapon: input.alive && !scope && !input.mount, crosshair: input.alive && !scope, mitraie: mitraiePose(input), ...hen }
}

/** The mitraie's kick on its tripod: how far back (m) and for how long (s). It fires every 4 ticks, so a burst keeps it shaking. */
const RECOIL = { back: 0.04, seconds: 0.08 }

const mitraiePose = ({ mount, look, sinceShot }: FirstPersonInput): MitraiePose | null => {
  if (!mount) return null
  const aim = turretAim(mount.spot, look.yaw, look.pitch)
  const left = Math.max(0, 1 - sinceShot / RECOIL.seconds)
  return { turret: mount.turret, yaw: aim.yaw, pitch: aim.pitch, recoil: RECOIL.back * left * left, seat: turretSeat(mount.spot, look.yaw) }
}

/** What the hen cannon shows: the hen at the mouth and the hens a reload drops in. */
const henCannon = (inHand: WeaponId, input: FirstPersonInput): Pick<FirstPersonView, "henAtMouth" | "reloadHens" | "hensIn"> => {
  if (inHand !== "gjalinis") return { henAtMouth: false, reloadHens: 0, hensIn: 0 }
  const ready = input.mag > 0 && input.sinceShot > HEN_BACK_AFTER
  const reload = input.reload
  if (!reload) return { henAtMouth: ready, reloadHens: 0, hensIn: 0 }
  const reloadHens = Math.min(WEAPONS[inHand].magazine - reload.mag, reload.reserve)
  let hensIn = 0
  for (let i = 0; i < reloadHens; i++) if (henDrop(reload.progress, reloadHens, i) >= HEN_IN) hensIn++
  const loadedUp = reloadHens > 0 && reload.progress >= HEN_RELOAD.mouth
  return { henAtMouth: ready || loadedUp, reloadHens, hensIn }
}
