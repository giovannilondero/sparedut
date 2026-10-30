/**
 * I contratti fra il nucleo del client (rete, predizione, loop, HUD) e i moduli
 * di presentazione: mondo, avatar, arma in prima persona, effetti, audio.
 * Ogni modulo di presentazione esporta la sua funzione `create*` con queste firme.
 */
import type * as THREE from "three"
import type { PickupKind, Team } from "../shared/map.ts"
import type { ProjectileKind, WeaponId } from "../shared/weapons.ts"

export type P3 = readonly [number, number, number]

/**
 * Qualità grafica. "alta": ombre dinamiche rifatte a ogni frame (anche dei giocatori).
 * "media": ombre del paese calcolate una volta sola, i giocatori hanno un'ombra a disco.
 * "bassa": niente ombre, meno luci, risoluzione piena al massimo 1x.
 */
export type Quality = "bassa" | "media" | "alta"

// --- client/world.ts: export function createWorld(scene, renderer, map): WorldScene ----
export interface FlagVisual {
  readonly pos: P3
  readonly state: "base" | "carried" | "dropped"
}
export interface WorldFrame {
  /** Uno per punto di `PICKUPS`, stesso ordine: true se raccoglibile. */
  readonly pickups: readonly boolean[]
  /** Solo in modalità "frico". */
  readonly flags: Readonly<Record<Team, FlagVisual>> | null
  /** Solo in modalità "culine". */
  readonly hill: { readonly owner: Team | null; readonly contested: boolean } | null
  /** Solo in modalità "cjar": il carro sul binario. */
  readonly cart: { readonly at: P3; readonly yaw: number; readonly contested: boolean; readonly pushers: number } | null
  /** Solo nella Tampieste in corso: il cerchio sicuro. */
  readonly storm: { readonly x: number; readonly z: number; readonly radius: number } | null
  /** Una per torretta della mappa: dove guarda l'arma, quanto è calda, se qualcuno la usa. */
  readonly turrets: readonly TurretVisual[]
  /** Salute di ogni porta da sfondare, da 0 (sfondata) a 1 (intera). */
  readonly doors: readonly number[]
  readonly camera: THREE.PerspectiveCamera
}
export interface TurretVisual {
  readonly yaw: number
  readonly pitch: number
  readonly heat: number
  readonly jammed: boolean
  readonly manned: boolean
  /** Chi la usa sono io: l'arma la disegna il viewmodel. */
  readonly mine: boolean
}
export interface WorldScene {
  /** Da chiamare ogni frame. `t` in secondi dall'avvio. */
  update(dt: number, t: number, frame: WorldFrame): void
  /** Ombre e luci secondo la qualità; si può richiamare a partita in corso. */
  setQuality(q: Quality): void
  /** Inquadratura per lo sfondo dei menu: la camera gira lenta attorno alla mappa. */
  menuCamera(t: number, camera: THREE.PerspectiveCamera): void
  /** Toglie la mappa dalla scena e libera geometrie, materiali e texture. */
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
  /** Lampo dell'arma (il nucleo lo chiama sui colpi degli altri). */
  flash(): void
  setTeam(team: Team): void
  /** Etichetta col nome sopra la testa (solo compagni o mirati). */
  setLabelVisible(visible: boolean): void
  dispose(): void
}

// --- client/viewmodel.ts: export function createViewmodel(worldCamera): Viewmodel --------
// L'arma vive in una scena sua, disegnata dopo il mondo con il depth buffer pulito
// (così non entra nei muri). Il nucleo fa: renderer.render(world); renderer.clearDepth();
// renderer.render(viewmodel.scene, viewmodel.camera). La camera dell'arma ha FOV fisso.
export interface ViewmodelFrame {
  readonly speed: number
  readonly grounded: boolean
  readonly aiming: boolean
  readonly sprinting: boolean
  readonly crouch: boolean
  /** Variazione dello sguardo in questo frame (radianti), per l'inerzia dell'arma. */
  readonly lookDx: number
  readonly lookDy: number
  readonly sgnape: boolean
  /** Rotazione del Mulin, da 0 a 1. */
  readonly spin: number
}
export interface Viewmodel {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  setWeapon(id: WeaponId): void
  fire(): void
  /** Durata della ricarica in secondi. */
  reload(seconds: number): void
  throwBomb(): void
  update(dt: number, frame: ViewmodelFrame): void
  setVisible(visible: boolean): void
  /** Punto della volata nel mondo (per scie e lampi), dato `worldCamera` aggiornata. */
  muzzleWorld(target: THREE.Vector3): THREE.Vector3
}

// --- client/fx.ts: export function createFx(scene): Fx -----------------------------------
export interface Fx {
  tracer(from: P3, to: P3, weapon: WeaponId): void
  impact(at: P3): void
  /** Colpo a segno: briciole di polenta (niente sangue). */
  hitPuff(at: P3, head: boolean): void
  muzzle(at: P3): void
  /** Esplosione: palla di fuoco, schegge, onda d'urto. Con `ground` (y del pavimento sotto) lascia fuoco e bruciatura. */
  explosion(at: P3, kind: ProjectileKind, ground: number | null): void
  /** Proiettili in volo e mine piantate: forme di frico che girano, bottiglie di sgnape, mine che lampeggiano. Chiamare a ogni frame con la lista corrente. */
  projectiles(list: readonly (readonly [ProjectileKind, number, number, number])[]): void
  /** Schegge di legno: una porta colpita, o (`big`) sfondata. */
  splinters(at: P3, big: boolean): void
  /** Anelli/sbuffi di fieno quando qualcuno usa un cjar di fen. */
  padBurst(at: P3): void
  pickupBurst(at: P3, kind: PickupKind): void
  update(dt: number, camera: THREE.Camera): void
  /** Quante luci puntiformi usano i lampi (ognuna costa su ogni pixel del mondo). */
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
  /** Sblocca l'audio (da chiamare al primo gesto dell'utente). */
  unlock(): void
  /** `at` assente: suono non posizionale (UI, i tuoi spari). */
  play(name: SoundName, opts?: { readonly at?: P3; readonly volume?: number; readonly rate?: number }): void
  setListener(pos: P3, yaw: number): void
  /** Musica del menu (villotta) accesa o spenta. */
  menuMusic(on: boolean): void
  setVolumes(master: number, music: number): void
  /**
   * La musica da discoteca di una mappa (il casot di Maran): suona in loop nel punto `at`,
   * attutita se la porta è chiusa. `null` la spegne.
   */
  disco(at: P3 | null, open: boolean): void
}
