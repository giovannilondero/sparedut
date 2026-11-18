/**
 * The Friulian armoury. Every weapon is data: the simulation, the HUD, the viewmodel,
 * the sounds and the loadout menu all read from here (names and descriptions
 * live in `client/i18n.ts`).
 */

export type WeaponId = "mescul" | "mandi" | "cramar" | "doplete" | "cjampanili" | "mulin" | "miedi" | "gjalinis" | "lanciafrico" | "panel" | "mitraie" | "motosee"

/**
 * "beam": short-range automatic stream. It heals teammates (`damage` is the heal per
 * hit) and deals `beamDamage` to enemies.
 * "held": melee for as long as the trigger is held (the Motosee): after the spin-up, it hits the nearest
 * hostile player in front within `range` every `cooldownTicks`, or the door in front.
 */
export type FireMode = "melee" | "semi" | "auto" | "projectile" | "beam" | "held"

/** Arm's length: how far the Mescul and the Motosee reach. */
const MELEE_REACH = 2.4

export interface WeaponDef {
  readonly id: WeaponId
  readonly mode: FireMode
  /** Damage per hit (per pellet for the shotgun). */
  readonly damage: number
  readonly headMultiplier: number
  readonly pellets: number
  /** Spread in radians: standing still, moving, aiming. */
  readonly spread: { readonly still: number; readonly moving: number; readonly aimed: number }
  /** Ticks (60/s) between two shots. */
  readonly cooldownTicks: number
  readonly reloadTicks: number
  readonly magazine: number
  /** Reserve ammo you respawn with. */
  readonly reserve: number
  readonly range: number
  /** Damage at max range, as a fraction (linear falloff from halfway). */
  readonly falloff: number
  /** Field of view when aiming (degrees). */
  readonly aimFov: number
  /** Fully aimed, a scope overlay replaces the view (the first-person view decides when). */
  readonly scope: boolean
  /** Vertical view kick per shot (radians). */
  readonly kick: number
  /**
   * Movement speed multiplier with the weapon in hand. 1 for every primary: what makes a class slow
   * or quick is its base speed (`CLASSES`). The things every class carries keep their own.
   */
  readonly moveScale: number
  /** Number key. */
  readonly slot: 1 | 2 | 3 | 4
  /** Spin-up ticks before the first shot (the Mulin); 0 = fires immediately. */
  readonly spinTicks: number
  /** What a "projectile" weapon launches; null for the others. */
  readonly shell: ShellKind | null
}

export const WEAPONS = {
  mescul: {
    id: "mescul",
    mode: "melee",
    damage: 55,
    headMultiplier: 1.4,
    pellets: 1,
    spread: { still: 0, moving: 0, aimed: 0 },
    cooldownTicks: 32,
    reloadTicks: 0,
    magazine: 0,
    reserve: 0,
    range: MELEE_REACH,
    falloff: 1,
    aimFov: 75,
    scope: false,
    kick: 0.02,
    moveScale: 1.12,
    slot: 4,
    spinTicks: 0,
    shell: null
  },
  mandi: {
    id: "mandi",
    mode: "semi",
    damage: 24,
    headMultiplier: 2,
    pellets: 1,
    spread: { still: 0.008, moving: 0.03, aimed: 0.003 },
    cooldownTicks: 11,
    reloadTicks: 80,
    magazine: 12,
    reserve: 60,
    range: 120,
    falloff: 0.6,
    aimFov: 60,
    scope: false,
    kick: 0.025,
    moveScale: 1.05,
    slot: 2,
    spinTicks: 0,
    shell: null
  },
  cramar: {
    id: "cramar",
    mode: "auto",
    damage: 15,
    headMultiplier: 1.8,
    pellets: 1,
    spread: { still: 0.012, moving: 0.045, aimed: 0.005 },
    cooldownTicks: 6,
    reloadTicks: 120,
    magazine: 30,
    reserve: 150,
    range: 160,
    falloff: 0.65,
    aimFov: 55,
    scope: false,
    kick: 0.012,
    moveScale: 1,
    slot: 1,
    spinTicks: 0,
    shell: null
  },
  doplete: {
    id: "doplete",
    mode: "semi",
    damage: 11,
    headMultiplier: 1.5,
    pellets: 9,
    spread: { still: 0.075, moving: 0.09, aimed: 0.055 },
    cooldownTicks: 26,
    reloadTicks: 140,
    magazine: 2,
    reserve: 30,
    range: 45,
    falloff: 0.25,
    aimFov: 65,
    scope: false,
    kick: 0.07,
    moveScale: 1,
    slot: 1,
    spinTicks: 0,
    shell: null
  },
  cjampanili: {
    id: "cjampanili",
    mode: "semi",
    damage: 80,
    headMultiplier: 2.5,
    pellets: 1,
    spread: { still: 0.03, moving: 0.08, aimed: 0 },
    cooldownTicks: 72,
    reloadTicks: 170,
    magazine: 5,
    reserve: 20,
    range: 400,
    falloff: 1,
    aimFov: 20,
    scope: true,
    kick: 0.06,
    moveScale: 1,
    slot: 1,
    spinTicks: 0,
    shell: null
  },
  mulin: {
    id: "mulin",
    mode: "auto",
    damage: 9,
    headMultiplier: 1.5,
    pellets: 1,
    spread: { still: 0.035, moving: 0.06, aimed: 0.022 },
    cooldownTicks: 3,
    reloadTicks: 240,
    magazine: 120,
    reserve: 240,
    range: 110,
    falloff: 0.55,
    aimFov: 68,
    scope: false,
    kick: 0.006,
    moveScale: 1,
    slot: 1,
    spinTicks: 45,
    shell: null
  },
  miedi: {
    id: "miedi",
    mode: "beam",
    damage: 4,
    headMultiplier: 1,
    pellets: 1,
    spread: { still: 0, moving: 0, aimed: 0 },
    cooldownTicks: 6,
    reloadTicks: 100,
    magazine: 60,
    reserve: 180,
    range: 9,
    falloff: 1,
    aimFov: 72,
    scope: false,
    kick: 0,
    moveScale: 1,
    slot: 1,
    spinTicks: 0,
    shell: null
  },
  lanciafrico: {
    id: "lanciafrico",
    mode: "projectile",
    damage: 110,
    headMultiplier: 1,
    pellets: 1,
    spread: { still: 0, moving: 0, aimed: 0 },
    cooldownTicks: 48,
    reloadTicks: 90,
    magazine: 1,
    reserve: 5,
    range: 0,
    falloff: 1,
    aimFov: 70,
    scope: false,
    kick: 0.09,
    moveScale: 0.92,
    slot: 3,
    spinTicks: 0,
    shell: "frico"
  },
  /** The cjanon des gjalinis: a brass tube strapped to the arm that shoots chickens. */
  gjalinis: {
    id: "gjalinis",
    mode: "projectile",
    damage: 70,
    headMultiplier: 1,
    pellets: 1,
    spread: { still: 0, moving: 0, aimed: 0 },
    cooldownTicks: 34,
    reloadTicks: 120,
    magazine: 3,
    reserve: 15,
    range: 0,
    falloff: 1,
    aimFov: 68,
    scope: false,
    kick: 0.06,
    moveScale: 1,
    slot: 1,
    spinTicks: 0,
    shell: "gjaline"
  },
  /**
   * The casot's panel (Lagune di Maran): torn off its wall and carried in the Lanciafrico's slot.
   * A strike heavier and slower than the mescul's, and it slows whoever holds it. Starting values,
   * to be tuned by playing.
   */
  panel: {
    id: "panel",
    mode: "melee",
    damage: 70,
    headMultiplier: 1,
    pellets: 1,
    spread: { still: 0, moving: 0, aimed: 0 },
    cooldownTicks: 45,
    reloadTicks: 0,
    magazine: 0,
    reserve: 0,
    range: 2.4,
    falloff: 1,
    aimFov: 75,
    scope: false,
    kick: 0.035,
    moveScale: 0.85,
    slot: 3,
    spinTicks: 0,
    shell: null
  },
  /**
   * The Motosee, a chainsaw: held melee, no ammunition, a short rev (the Mulin's spin-up). Starting
   * values, to be tuned by playing. No aiming: the aimed view is the Mescul's, and nothing is aimed.
   */
  motosee: {
    id: "motosee",
    mode: "held",
    damage: 14,
    headMultiplier: 1,
    pellets: 1,
    spread: { still: 0, moving: 0, aimed: 0 },
    cooldownTicks: 4,
    reloadTicks: 0,
    magazine: 0,
    reserve: 0,
    range: MELEE_REACH,
    falloff: 1,
    aimFov: 75,
    scope: false,
    kick: 0.004,
    moveScale: 1,
    slot: 1,
    spinTicks: 20,
    shell: null
  },
  /**
   * The mitraie de postazion: not carried, used by standing behind a turret
   * (`TURRET`). Infinite ammo, but it overheats.
   */
  mitraie: {
    id: "mitraie",
    mode: "auto",
    damage: 13,
    headMultiplier: 1.8,
    pellets: 1,
    spread: { still: 0.004, moving: 0.004, aimed: 0.002 },
    cooldownTicks: 4,
    reloadTicks: 0,
    magazine: 0,
    reserve: 0,
    range: 220,
    falloff: 0.7,
    aimFov: 50,
    scope: false,
    kick: 0.004,
    moveScale: 1,
    slot: 1,
    spinTicks: 0,
    shell: null
  }
} as const satisfies Record<WeaponId, WeaponDef>

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[]

/** Whether a weapon has a magazine to empty and reload: the Mescul and the Motosee have none (nor the turrets' mitraie). */
export const usesAmmo = (id: WeaponId) => WEAPONS[id].magazine > 0

/** A number key; the primaries share 1. */
export type Slot = WeaponDef["slot"]
/** The number keys in order, from the weapons' own slots. */
export const SLOTS: readonly Slot[] = [...new Set(WEAPON_IDS.map((id) => WEAPONS[id].slot))].sort((a, b) => a - b)

/** The primary weapon is chosen before respawning. */
export type PrimaryId = "cramar" | "doplete" | "cjampanili" | "mulin" | "miedi" | "gjalinis" | "motosee"
export const PRIMARIES = ["cramar", "doplete", "cjampanili", "mulin", "miedi", "gjalinis", "motosee"] as const satisfies readonly PrimaryId[]

/** What a player carries in slot 3, one at a time: the Lanciafrico, picked up, or the casot's panel, torn off. */
export type PowerId = "lanciafrico" | "panel"

/**
 * Tearing the casot's panel off its wall: hold "use" this many ticks (about two seconds), inside,
 * within `PANEL_REACH` metres of it and facing it. Starting values.
 */
export const PANEL_TEAR_TICKS = 120
export const PANEL_REACH = 1.8

/** What a class adds beyond health and speed: the medic's healing (`MEDIC_AURA`, and the beam's heal on teammates). */
export type ClassTrait = "medic"

/** A class: what the primary makes of whoever carries it. Every class carries the same pistol, Mescul, bombs and mines. */
export interface ClassDef {
  /** Maximum health: spawned with, and the ceiling of every heal. */
  readonly hp: number
  /** Base speed, multiplied by the weapon in hand's `moveScale` and the other modifiers (`speedScale`). */
  readonly speed: number
  readonly trait: ClassTrait | null
}

/** The primary is the class. Starting values, to be tuned by playing. */
export const CLASSES = {
  cramar: { hp: 100, speed: 1.0, trait: null },
  doplete: { hp: 110, speed: 1.05, trait: null },
  cjampanili: { hp: 75, speed: 0.95, trait: null },
  mulin: { hp: 150, speed: 0.8, trait: null },
  miedi: { hp: 90, speed: 1.05, trait: "medic" },
  gjalinis: { hp: 100, speed: 0.95, trait: null },
  motosee: { hp: 125, speed: 1.12, trait: null }
} as const satisfies Record<PrimaryId, ClassDef>

/** The Cassele dal Miedi on enemies: damage per hit (the heal on teammates is `damage`). */
export const BEAM_DAMAGE = 5

/** The Miedi class's trait, the medic: heals themselves and nearby teammates. */
export const MEDIC_AURA = {
  /** Radius (m) of the passive heal. */
  radius: 6,
  /** How many ticks between heals. */
  everyTicks: 30,
  /** Health per pulse (2 per second). */
  amount: 1
} as const

/** The grenade: a boce of sgnape (grappa) with a fuse. */
export const SGNAPE_BOMB = {
  perLife: 2,
  fuseTicks: 130,
  speed: 17,
  radius: 5,
  damage: 105,
  cooldownTicks: 40
} as const

/** The Raibl mine: dropped at your feet, it plants itself in the ground and blows up when enemies pass. */
export const RAIBL_MINE = {
  perLife: 2,
  speed: 6,
  /** Ticks before it arms. */
  armTicks: 60,
  /** Trigger radius (horizontal, m). */
  trigger: 2,
  radius: 4.5,
  damage: 120,
  /** After these ticks it goes off by itself (explodes). */
  lifeTicks: 90 * 60,
  /** Active mines per player. */
  maxActive: 3,
  cooldownTicks: 30
} as const

/** What flies or sits planted: frico wheels, sgnape bombs, mines, chickens. */
export type ProjectileKind = "frico" | "sgnape" | "mine" | "gjaline"

/** What a weapon fires (bombs and mines are thrown with their own keys). */
export type ShellKind = Extract<ProjectileKind, "frico" | "gjaline">

export const FRICO_SHELL = {
  speed: 30,
  gravity: 9,
  radius: 4.5,
  fuseTicks: 180,
  bounces: 1
} as const

/**
 * The gjaline: flies flapping its wings (low gravity), slowly homes on the nearest
 * enemy ahead and bursts on them in a blinding cloud of feathers.
 */
export const GJALINE = {
  speed: 21,
  lift: 2.5,
  gravity: 5,
  fuseTicks: 150,
  /** Sees enemies within this distance and this cone (cosine of the half angle). */
  sight: 30,
  cone: 0.5,
  /** How much it turns towards the target per tick (rad). */
  turn: 0.045,
  radius: 3.2,
  /** Ticks of feather-blocked view for anyone caught in the burst. */
  blindTicks: 100
} as const

/** Turrets with the mitraie: mounted with the "use" key, and they overheat. */
export const TURRET = {
  /** How far away (m, horizontally from the seat) you can mount it. */
  reach: 1.6,
  /** The gunner's seat is behind the gun, at this distance. */
  seat: 1.0,
  /** Height of the gun's pivot on its tripod, above the turret's foot (m). */
  pivot: 1.2,
  /** How far it turns left and right from its facing (rad), and up and down. */
  arc: 1.35,
  pitchUp: 0.55,
  pitchDown: 0.45,
  /**
   * Heat (0..1) per shot, net of cooling between shots:
   * about 3 seconds of continuous fire before overheating.
   */
  heatPerShot: 0.038,
  /** Cooling per tick (always), and when overheated (locked until it's back to 0). */
  cool: 0.004,
  jamCool: 0.005
} as const

/** How each fired thing leaves the barrel. */
export const SHELLS = {
  frico: { speed: FRICO_SHELL.speed, lift: 1.5, fuseTicks: FRICO_SHELL.fuseTicks, bounces: FRICO_SHELL.bounces },
  gjaline: { speed: GJALINE.speed, lift: GJALINE.lift, fuseTicks: GJALINE.fuseTicks, bounces: 0 }
} as const satisfies Record<ShellKind, { readonly speed: number; readonly lift: number; readonly fuseTicks: number; readonly bounces: number }>
