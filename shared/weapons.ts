/**
 * L'armeria furlana. Ogni arma è dati: la simulazione, l'HUD, il viewmodel,
 * i suoni e il menu di equipaggiamento leggono tutti da qui (nomi e descrizioni
 * stanno in `client/i18n.ts`).
 */

export type WeaponId = "mescul" | "mandi" | "cramar" | "doplete" | "cjampanili" | "mulin" | "miedi" | "lanciafrico"

/**
 * "beam": getto a corto raggio, automatico. Sui compagni cura (`damage` è la cura per
 * colpo), sui nemici fa `beamDamage`.
 */
export type FireMode = "melee" | "semi" | "auto" | "projectile" | "beam"

export interface WeaponDef {
  readonly id: WeaponId
  readonly mode: FireMode
  /** Danno per colpo (per pallino con la doppietta). */
  readonly damage: number
  readonly headMultiplier: number
  readonly pellets: number
  /** Dispersione in radianti: da fermo, in movimento, mirando. */
  readonly spread: { readonly still: number; readonly moving: number; readonly aimed: number }
  /** Tick (60/s) tra due colpi. */
  readonly cooldownTicks: number
  readonly reloadTicks: number
  readonly magazine: number
  /** Munizioni di scorta con cui si rinasce. */
  readonly reserve: number
  readonly range: number
  /** Danno a fine portata, in proporzione (decadimento lineare dalla metà). */
  readonly falloff: number
  /** Campo visivo quando si mira (gradi). */
  readonly aimFov: number
  /** Rinculo verticale della visuale per colpo (radianti). */
  readonly kick: number
  /** Moltiplicatore della velocità di corsa con l'arma in mano. */
  readonly moveScale: number
  /** Tasto numerico. */
  readonly slot: 1 | 2 | 3 | 4
  /** Tick di rotazione prima del primo colpo (il Mulin); 0 = spara subito. */
  readonly spinTicks: number
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
    range: 2.4,
    falloff: 1,
    aimFov: 75,
    kick: 0.02,
    moveScale: 1.12,
    slot: 4,
    spinTicks: 0
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
    kick: 0.025,
    moveScale: 1.05,
    slot: 2,
    spinTicks: 0
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
    kick: 0.012,
    moveScale: 1,
    slot: 1,
    spinTicks: 0
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
    kick: 0.07,
    moveScale: 1.02,
    slot: 1,
    spinTicks: 0
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
    kick: 0.06,
    moveScale: 0.9,
    slot: 1,
    spinTicks: 0
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
    kick: 0.006,
    moveScale: 0.78,
    slot: 1,
    spinTicks: 45
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
    kick: 0,
    moveScale: 1.06,
    slot: 1,
    spinTicks: 0
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
    kick: 0.09,
    moveScale: 0.92,
    slot: 3,
    spinTicks: 0
  }
} as const satisfies Record<WeaponId, WeaponDef>

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[]

/** L'arma principale si sceglie prima di rinascere. */
export type PrimaryId = "cramar" | "doplete" | "cjampanili" | "mulin" | "miedi"
export const PRIMARIES = ["cramar", "doplete", "cjampanili", "mulin", "miedi"] as const satisfies readonly PrimaryId[]

/** La Cassele dal Miedi sui nemici: danno per colpo (la cura sui compagni è `damage`). */
export const BEAM_DAMAGE = 5

/** Chi ha il miedi come arma principale è il medico: cura sé e i compagni vicini. */
export const MEDIC_AURA = {
  /** Raggio (m) della cura passiva. */
  radius: 6,
  /** Ogni quanti tick cura. */
  everyTicks: 30,
  /** Salute per impulso (2 al secondo). */
  amount: 1
} as const

/** La granata: una boce di sgnape (grappa) con la miccia. */
export const SGNAPE_BOMB = {
  perLife: 2,
  fuseTicks: 130,
  speed: 17,
  radius: 5,
  damage: 105,
  cooldownTicks: 40
} as const

/** La mine di Raibl: si butte a pît, si plante tal teren e e salte al passaç dai nemîs. */
export const RAIBL_MINE = {
  perLife: 2,
  speed: 6,
  /** Tick prima che si armi. */
  armTicks: 60,
  /** Raggio di innesco (orizzontale, m). */
  trigger: 2,
  radius: 4.5,
  damage: 120,
  /** Dopo questi tick si spegne da sola (scoppia). */
  lifeTicks: 90 * 60,
  /** Mine attive per giocatore. */
  maxActive: 3,
  cooldownTicks: 30
} as const

/** Ciò che vola o sta piantato: forme di frico, bombe di sgnape, mine. */
export type ProjectileKind = "frico" | "sgnape" | "mine"

export const FRICO_SHELL = {
  speed: 30,
  gravity: 9,
  radius: 4.5,
  fuseTicks: 180,
  bounces: 1
} as const
