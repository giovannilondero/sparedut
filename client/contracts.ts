/**
 * The contracts between the client core (network, prediction, loop, HUD) and the
 * presentation modules: world, avatars, first-person weapon, effects, audio.
 * Each presentation module exports its `create*` function with these signatures.
 */
import type * as THREE from "three"
import type { PickupKind, Team } from "../shared/map.ts"
import type { ProjectileKind, WeaponId } from "../shared/weapons.ts"

export type P3 = readonly [number, number, number]

/**
 * Graphics quality. "alta" (high): dynamic shadows redrawn every frame (players' too).
 * "media" (medium): town shadows computed once, players get a disc shadow.
 * "bassa" (low): no shadows, fewer lights, full resolution capped at 1x.
 */
export type Quality = "bassa" | "media" | "alta"

// --- client/world.ts: export function createWorld(scene, renderer, map): WorldScene ----
export interface FlagVisual {
  readonly pos: P3
  readonly state: "base" | "carried" | "dropped"
}
export interface WorldFrame {
  /** One per `PICKUPS` point, same order: true if it can be picked up. */
  readonly pickups: readonly boolean[]
  /** Only in "frico" mode. */
  readonly flags: Readonly<Record<Team, FlagVisual>> | null
  /** Only in "culine" mode. */
  readonly hill: { readonly owner: Team | null; readonly contested: boolean } | null
  /** Only in "cjar" mode: the cart on the track. */
  readonly cart: { readonly at: P3; readonly yaw: number; readonly contested: boolean; readonly pushers: number } | null
  /** Only during an ongoing Tampieste: the safe circle. */
  readonly storm: { readonly x: number; readonly z: number; readonly radius: number } | null
  /** One per map turret: where the gun points, how hot it is, whether someone is using it. */
  readonly turrets: readonly TurretVisual[]
  /** Health of each breakable door, from 0 (broken) to 1 (intact). */
  readonly doors: readonly number[]
  readonly camera: THREE.PerspectiveCamera
}
export interface TurretVisual {
  readonly yaw: number
  readonly pitch: number
  readonly heat: number
  readonly jammed: boolean
  readonly manned: boolean
  /** I'm the one using it: the viewmodel draws the gun. */
  readonly mine: boolean
}
export interface WorldScene {
  /** Call every frame. `t` in seconds since startup. */
  update(dt: number, t: number, frame: WorldFrame): void
  /** Shadows and lights according to quality; can be called again mid-match. */
  setQuality(q: Quality): void
  /** Framing for the menu background: the camera slowly circles the map. */
  menuCamera(t: number, camera: THREE.PerspectiveCamera): void
  /** Removes the map from the scene and frees geometries, materials and textures. */
  dispose(): void
}

// --- client/avatars.ts: export function createAvatar(team, name): Avatar ------------------
export interface AvatarPose {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly yaw: number
  readonly pitch: number
  readonly vx: number
  readonly vz: number
  readonly crouch: boolean
  readonly grounded: boolean
  readonly alive: boolean
  readonly weapon: WeaponId
  readonly firing: boolean
  readonly shield: boolean
  readonly carrier: boolean
  readonly sgnape: boolean
}
export interface Avatar {
  readonly object: THREE.Object3D
  update(dt: number, pose: AvatarPose): void
  /** Muzzle flash (the core calls it on other players' shots). */
  flash(): void
  setTeam(team: Team): void
  /** Name label above the head (only teammates or aimed-at players). */
  setLabelVisible(visible: boolean): void
  dispose(): void
}

// --- client/viewmodel.ts: export function createViewmodel(worldCamera): Viewmodel --------
// The weapon lives in its own scene, drawn after the world with a cleared depth buffer
// (so it doesn't clip into walls). The core does: renderer.render(world); renderer.clearDepth();
// renderer.render(viewmodel.scene, viewmodel.camera). The weapon camera has a fixed FOV.
export interface ViewmodelFrame {
  readonly speed: number
  readonly grounded: boolean
  readonly aiming: boolean
  readonly sprinting: boolean
  readonly crouch: boolean
  /** Look change this frame (radians), for weapon inertia. */
  readonly lookDx: number
  readonly lookDy: number
  readonly sgnape: boolean
  /** Mulin spin, from 0 to 1. */
  readonly spin: number
}
export interface Viewmodel {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  setWeapon(id: WeaponId): void
  fire(): void
  /** Reload duration in seconds. */
  reload(seconds: number): void
  throwBomb(): void
  update(dt: number, frame: ViewmodelFrame): void
  setVisible(visible: boolean): void
  /** Muzzle point in the world (for tracers and flashes), given an up-to-date `worldCamera`. */
  muzzleWorld(target: THREE.Vector3): THREE.Vector3
}

// --- client/fx.ts: export function createFx(scene): Fx -----------------------------------
export interface Fx {
  tracer(from: P3, to: P3, weapon: WeaponId): void
  impact(at: P3): void
  /** A hit: polenta crumbs (no blood). */
  hitPuff(at: P3, head: boolean): void
  muzzle(at: P3): void
  /** Explosion: fireball, shrapnel, shockwave. With `ground` (y of the floor below) it leaves fire and a scorch mark. */
  explosion(at: P3, kind: ProjectileKind, ground: number | null): void
  /** Projectiles in flight and planted mines: spinning frico wheels, sgnape bottles, blinking mines. Call every frame with the current list. */
  projectiles(list: readonly (readonly [ProjectileKind, number, number, number])[]): void
  /** Wood splinters: a door hit, or (`big`) broken down. */
  splinters(at: P3, big: boolean): void
  /** Rings/puffs of hay when someone uses a cjar di fen. */
  padBurst(at: P3): void
  pickupBurst(at: P3, kind: PickupKind): void
  update(dt: number, camera: THREE.Camera): void
  /** How many point lights the flashes use (each one costs on every pixel of the world). */
  setQuality(q: Quality): void
}

// --- client/audio.ts: export function createAudio(): GameAudio ----------------------------
export type SoundName =
  | "shot_mandi"
  | "shot_cramar"
  | "shot_doplete"
  | "shot_cjampanili"
  | "shot_mulin"
  | "spin_mulin"
  | "beam_miedi"
  | "launch_gjaline"
  | "boom_gjaline"
  | "shot_mitraie"
  | "turret_on"
  | "turret_hot"
  | "door_hit"
  | "door_break"
  | "mine_plant"
  | "heal"
  | "launch_frico"
  | "throw"
  | "boom"
  | "bounce"
  | "reload"
  | "switch"
  | "dry"
  | "melee_swing"
  | "melee_hit"
  | "hitmarker"
  | "headshot"
  | "kill"
  | "death"
  | "step"
  | "jump"
  | "land"
  | "pad"
  | "pickup_frico"
  | "pickup_gubane"
  | "pickup_sgnape"
  | "pickup_munizions"
  | "pickup_lanciafrico"
  | "flag_taken"
  | "flag_captured"
  | "flag_returned"
  | "bells"
  | "streak"
  | "ui_click"
  | "ui_hover"
  | "chat"
  | "respawn"
  | "victory"
  | "defeat"

export interface GameAudio {
  /** Unlocks audio (call on the user's first gesture). */
  unlock(): void
  /** No `at`: non-positional sound (UI, your own shots). */
  play(name: SoundName, opts?: { readonly at?: P3; readonly volume?: number; readonly rate?: number }): void
  setListener(pos: P3, yaw: number): void
  /** Menu music (villotta) on or off. */
  menuMusic(on: boolean): void
  setVolumes(master: number, music: number): void
  /**
   * A map's disco music (the casot in Maran): loops at point `at`,
   * muffled if the door is closed. `null` turns it off.
   */
  disco(at: P3 | null, open: boolean): void
}
