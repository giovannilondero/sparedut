/**
 * L'armeria furlana. Ogni arma è dati: la simulazione, l'HUD, il viewmodel,
 * i suoni e il menu di equipaggiamento leggono tutti da qui (nomi e descrizioni
 * stanno in `client/i18n.ts`).
 */

export type WeaponId = "mescul" | "mandi" | "cramar" | "doplete" | "cjampanili" | "mulin" | "miedi" | "gjalinis" | "lanciafrico" | "mitraie"

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
  /** Cosa lancia un'arma "projectile"; null per le altre. */
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
    range: 2.4,
    falloff: 1,
    aimFov: 75,
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
    kick: 0.07,
    moveScale: 1.02,
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
    kick: 0.06,
    moveScale: 0.9,
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
    kick: 0.006,
    moveScale: 0.78,
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
    kick: 0,
    moveScale: 1.06,
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
    kick: 0.09,
    moveScale: 0.92,
    slot: 3,
    spinTicks: 0,
    shell: "frico"
  },
  /** Il cjanon des gjalinis: un tubo di ottone legato al braccio che spara galline. */
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
    kick: 0.06,
    moveScale: 0.96,
    slot: 1,
    spinTicks: 0,
    shell: "gjaline"
  },
  /**
   * La mitraie de postazion: non si porta, si usa stando dietro a una torretta
   * (`TURRET`). Colpi infiniti, ma scalda.
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
    kick: 0.004,
    moveScale: 1,
    slot: 1,
    spinTicks: 0,
    shell: null
  }
} as const satisfies Record<WeaponId, WeaponDef>

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[]

/** L'arma principale si sceglie prima di rinascere. */
export type PrimaryId = "cramar" | "doplete" | "cjampanili" | "mulin" | "miedi" | "gjalinis"
export const PRIMARIES = ["cramar", "doplete", "cjampanili", "mulin", "miedi", "gjalinis"] as const satisfies readonly PrimaryId[]

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

/** Ciò che vola o sta piantato: forme di frico, bombe di sgnape, mine, galline. */
export type ProjectileKind = "frico" | "sgnape" | "mine" | "gjaline"

/** Ciò che si spara con un'arma (le bombe e le mine si lanciano coi loro tasti). */
export type ShellKind = Extract<ProjectileKind, "frico" | "gjaline">

export const FRICO_SHELL = {
  speed: 30,
  gravity: 9,
  radius: 4.5,
  fuseTicks: 180,
  bounces: 1
} as const

/**
 * La gjaline: vola sbattendo le ali (poca gravità), punta piano verso il nemico più
 * vicino davanti a sé e gli scoppia addosso in una nuvola di piume che acceca.
 */
export const GJALINE = {
  speed: 21,
  lift: 2.5,
  gravity: 5,
  fuseTicks: 150,
  /** Vede i nemici entro questa distanza e questo cono (coseno del mezzo angolo). */
  sight: 30,
  cone: 0.5,
  /** Quanto gira verso il bersaglio per tick (rad). */
  turn: 0.045,
  radius: 3.2,
  /** Tick di vista coperta dalle piume per chi è preso nello scoppio. */
  blindTicks: 100
} as const

/** Le torrette con la mitraie: si montano col tasto "usa", e scaldano. */
export const TURRET = {
  /** Da quanto lontano (m, in orizzontale dal posto) si monta. */
  reach: 1.6,
  /** Il posto di chi spara è dietro l'arma, a questa distanza. */
  seat: 1.0,
  /** Quanto gira a destra e a sinistra dalla sua direzione (rad), e su e giù. */
  arc: 1.35,
  pitchUp: 0.55,
  pitchDown: 0.45,
  /**
   * Calore (0..1) per colpo, al netto del raffreddamento fra un colpo e l'altro:
   * circa 3 secondi di fuoco continuo prima di surriscaldarsi.
   */
  heatPerShot: 0.038,
  /** Raffreddamento per tick (sempre), e quando è surriscaldata (ferma finché torna a 0). */
  cool: 0.004,
  jamCool: 0.005
} as const

/** Come esce dalla canna ogni cosa che si spara. */
export const SHELLS = {
  frico: { speed: FRICO_SHELL.speed, lift: 1.5, fuseTicks: FRICO_SHELL.fuseTicks, bounces: FRICO_SHELL.bounces },
  gjaline: { speed: GJALINE.speed, lift: GJALINE.lift, fuseTicks: GJALINE.fuseTicks, bounces: 0 }
} as const satisfies Record<ShellKind, { readonly speed: number; readonly lift: number; readonly fuseTicks: number; readonly bounces: number }>
