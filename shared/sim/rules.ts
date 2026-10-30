/**
 * Regole pure della simulazione: equipaggiamento, rinascita, danni, chi è nemico di chi,
 * la tempesta.
 */
import type { MapDef, Spawn, Team } from "../map.ts"
import { RAIBL_MINE, SGNAPE_BOMB, WEAPON_IDS, WEAPONS, type PrimaryId, type WeaponId } from "../weapons.ts"
import type { Ammo, ArsenalValue, RulesValue, StatsValue } from "./schema.ts"

export const MAX_HP = 100
export const MAX_ARMOR = 100
export const RESPAWN_TICKS = 180
/** Dopo una corsa l'arma torna su in questi tick (il server e la predizione del client). */
export const RAISE_TICKS = 12
export const SHIELD_TICKS = 90
export const SGNAPE_TICKS = 600
export const SGNAPE_SPEED = 1.3
export const ASSIST_WINDOW_TICKS = 600
export const OVER_TICKS = 15 * 60
/** Il riscaldamento finisce da solo dopo 30 s dalla creazione; l'host può partire prima. */
export const WARMUP_TICKS = 30 * 60
export const FLAG_RETURN_TICKS = 30 * 60

export const otherTeam = (team: Team): Team => (team === "benandanti" ? "malandanti" : "benandanti")

/** Nella Tampieste non ci sono squadre: tutti contro tutti. */
export const everyoneAlone = (rules: RulesValue) => rules.mode === "tampieste"

/** Compagni: si curano a vicenda (in squadra, fuori dalla Tampieste). */
export const allied = (rules: RulesValue, a: Team, b: Team) => !everyoneAlone(rules) && a === b

/** Si fanno male (due giocatori diversi): avversari, o compagni col fuoco amico. */
export const hostile = (rules: RulesValue, a: Team, b: Team) => !allied(rules, a, b) || rules.friendlyFire

/** I punti di rinascita di una squadra; nella Tampieste valgono tutti per tutti. */
export const spawnsFor = (map: MapDef, rules: RulesValue, team: Team): readonly Spawn[] =>
  everyoneAlone(rules) ? [...map.spawns.benandanti, ...map.spawns.malandanti] : map.spawns[team]

// --- La Tampieste --------------------------------------------------------------------------

/** Tick dopo l'inizio in cui, nella Tampieste, si nasce ancora (e la partita non può finire). */
export const START_GRACE_TICKS = 5

/** La tempesta resta ferma per i primi secondi, poi stringe fino all'80% del tempo. */
export const STORM_GRACE_TICKS = 20 * 60
export const STORM_MIN_RADIUS = 6
export const STORM_SHRINK_SHARE = 0.8
/** Fuori dalla tempesta: danno ogni `STORM_EVERY` tick. */
export const STORM_EVERY = 30
export const STORM_DAMAGE = 4

export interface StormValue {
  readonly x: number
  readonly z: number
  readonly radius: number
}

/**
 * Il cerchio sicuro della Tampieste, ricavato dal solo tempo di partita: centro nella
 * zona da tenere della mappa, raggio che parte dall'angolo più lontano e si chiude.
 * `start` è il tick di inizio della partita in corso.
 */
export function stormAt(map: MapDef, rules: RulesValue, start: number, tick: number): StormValue {
  const [x, , z] = map.hill.at
  const { minX, maxX, minZ, maxZ } = map.bounds
  const far = Math.sqrt(Math.max((x - minX) ** 2, (x - maxX) ** 2) + Math.max((z - minZ) ** 2, (z - maxZ) ** 2)) + 4
  const span = Math.max(1, rules.timeLimitTicks * STORM_SHRINK_SHARE - STORM_GRACE_TICKS)
  const k = Math.min(1, Math.max(0, (tick - start - STORM_GRACE_TICKS) / span))
  return { x, z, radius: far + (STORM_MIN_RADIUS - far) * k }
}

export const outsideStorm = (storm: StormValue, p: { x: number; z: number }) => (p.x - storm.x) ** 2 + (p.z - storm.z) ** 2 > storm.radius * storm.radius

// --- Spingi il Cjar ------------------------------------------------------------------------

export const CART = {
  /** Raggio (m) entro cui si spinge o si ferma il cjar. */
  reach: 4,
  /** Velocità con un Benandante (m/s); ogni altro fino a 3 aggiunge un quarto. */
  speed: 1.1,
  maxPushers: 3,
  /** Dopo questi tick senza nessuno, il cjar torna indietro piano. */
  idleTicks: 10 * 60,
  backSpeed: 0.4
} as const

export function freshAmmo(): Record<WeaponId, Ammo> {
  const out = {} as Record<WeaponId, Ammo>
  for (const id of WEAPON_IDS) out[id] = { mag: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve }
  return out
}

export function freshArsenal(primary: PrimaryId): ArsenalValue {
  return {
    current: primary,
    primary,
    nextPrimary: primary,
    launcher: false,
    ammo: freshAmmo(),
    action: { _tag: "switch", ticks: 20 },
    bombs: SGNAPE_BOMB.perLife,
    bombCooldown: 0,
    mines: RAIBL_MINE.perLife,
    mineCooldown: 0,
    spin: 0,
    sgnape: 0
  }
}

export const NO_STATS: StatsValue = { kills: 0, deaths: 0, assists: 0, caps: 0, score: 0, damage: 0, headshots: 0, streak: 0, best: 0 }

/** Le armi che il giocatore può impugnare adesso. */
export const owned = (a: ArsenalValue, id: WeaponId) =>
  id === "mescul" || id === "mandi" || id === a.primary || (id === "lanciafrico" && a.launcher)

/** Il punto di rinascita più lontano dai nemici vivi, con un po' di caso. */
export function chooseSpawn(spots: readonly Spawn[], enemies: ReadonlyArray<{ x: number; z: number }>, roll: number): Spawn {
  let best = spots[0]
  let bestScore = -1
  spots.forEach((s, i) => {
    let nearest = 1e9
    for (const e of enemies) {
      const dx = e.x - s.at[0]
      const dz = e.z - s.at[2]
      nearest = Math.min(nearest, dx * dx + dz * dz)
    }
    const score = Math.min(nearest, 2500) + ((roll * 997 + i * 131) % 400)
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  })
  return best
}

/** Danno di un colpo a distanza `dist`, col decadimento dell'arma. */
export function damageAt(id: WeaponId, dist: number, head: boolean) {
  const w = WEAPONS[id]
  const half = w.range / 2
  const t = dist <= half ? 0 : Math.min(1, (dist - half) / Math.max(1, half))
  const scale = 1 - (1 - w.falloff) * t
  return w.damage * scale * (head ? w.headMultiplier : 1)
}

/** Metà del danno la prende la corazza (finché c'è). */
export function absorb(hp: number, armor: number, amount: number) {
  const toArmor = Math.min(armor, amount * 0.5)
  return { hp: hp - (amount - toArmor), armor: armor - toArmor }
}
