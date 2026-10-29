/**
 * L'armeria furlana. Ogni arma è dati: la simulazione, l'HUD, il viewmodel,
 * i suoni e il menu di equipaggiamento leggono tutti da qui.
 */

export type WeaponId = "mescul" | "mandi" | "cramar" | "doplete" | "cjampanili" | "lanciafrico"

export type FireMode = "melee" | "semi" | "auto" | "projectile"

export interface WeaponDef {
  readonly id: WeaponId
  /** Nome in furlan, come compare nell'HUD. */
  readonly name: string
  /** Sottotitolo scherzoso per menu e kill feed. */
  readonly blurb: string
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
}

export const WEAPONS = {
  mescul: {
    id: "mescul",
    name: "Mescul de Polente",
    blurb: "Il bastone per girare la polenta. Gira anche le facce.",
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
    slot: 4
  },
  mandi: {
    id: "mandi",
    name: "La Mandi",
    blurb: "Pistola semiautomatica. Saluta e spara, in chest ordin.",
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
    slot: 2
  },
  cramar: {
    id: "cramar",
    name: "Mitra dal Cramâr",
    blurb: "I cramârs vendevano spezie in Austria. Questo vende piombo.",
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
    slot: 1
  },
  doplete: {
    id: "doplete",
    name: "Dopiete di Pre Checo",
    blurb: "La doppietta del parroco. Benedice a corto raggio.",
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
    slot: 1
  },
  cjampanili: {
    id: "cjampanili",
    name: "Il Cjampanili",
    blurb: "Fucile di precisione. Alto, dritto e rifatto pietra su pietra.",
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
    slot: 1
  },
  lanciafrico: {
    id: "lanciafrico",
    name: "Lanciafrico",
    blurb: "Spara forme di frico bollenti che rimbalzano e scoppiano. Arma potente: si raccoglie in Vie Bini.",
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
    slot: 3
  }
} as const satisfies Record<WeaponId, WeaponDef>

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[]

/** L'arma principale si sceglie prima di rinascere. */
export type PrimaryId = "cramar" | "doplete" | "cjampanili"
export const PRIMARIES = ["cramar", "doplete", "cjampanili"] as const satisfies readonly PrimaryId[]

/** La granata: una boce di sgnape (grappa) con la miccia. */
export const SGNAPE_BOMB = {
  name: "Bombe di Sgnape",
  perLife: 2,
  fuseTicks: 130,
  speed: 17,
  radius: 5,
  damage: 105,
  cooldownTicks: 40
} as const

export const FRICO_SHELL = {
  speed: 30,
  gravity: 9,
  radius: 4.5,
  fuseTicks: 180,
  bounces: 1
} as const
