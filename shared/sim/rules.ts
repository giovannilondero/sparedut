/**
 * Pure simulation rules: loadout, respawn, damage, who is whose enemy,
 * the storm.
 */
import type { MapDef, Spawn, Team } from "../map.ts"
import { RAIBL_MINE, SGNAPE_BOMB, WEAPON_IDS, WEAPONS, type PrimaryId, type WeaponId } from "../weapons.ts"
import type { Ammo, ArsenalValue, RulesValue, StatsValue, TurretState } from "./schema.ts"

export const MAX_HP = 100
export const MAX_ARMOR = 100
export const RESPAWN_TICKS = 180
/** After sprinting the weapon comes back up in this many ticks (server and client prediction). */
export const RAISE_TICKS = 12
export const SHIELD_TICKS = 90
export const SGNAPE_TICKS = 600
export const SGNAPE_SPEED = 1.3
export const ASSIST_WINDOW_TICKS = 600
export const OVER_TICKS = 15 * 60
/** Warmup ends on its own 30 s after creation; the host can start earlier. */
export const WARMUP_TICKS = 30 * 60
export const FLAG_RETURN_TICKS = 30 * 60

export const otherTeam = (team: Team): Team => (team === "benandanti" ? "malandanti" : "benandanti")

/** The Tampieste has no teams: free-for-all. */
export const everyoneAlone = (rules: RulesValue) => rules.mode === "tampieste"

/** Teammates: they heal each other (same team, outside the Tampieste). */
export const allied = (rules: RulesValue, a: Team, b: Team) => !everyoneAlone(rules) && a === b

/** They can hurt each other (two different players): opponents, or teammates with friendly fire. */
export const hostile = (rules: RulesValue, a: Team, b: Team) => !allied(rules, a, b) || rules.friendlyFire

/** A team's spawn points; in the Tampieste every point is open to everyone. */
export const spawnsFor = (map: MapDef, rules: RulesValue, team: Team): readonly Spawn[] =>
  everyoneAlone(rules) ? [...map.spawns.benandanti, ...map.spawns.malandanti] : map.spawns[team]

// --- La Tampieste --------------------------------------------------------------------------

/** Ticks after the start during which, in the Tampieste, players still spawn (and the match can't end). */
export const START_GRACE_TICKS = 5

/** The storm holds still for the first seconds, then closes in until 80% of the time. */
export const STORM_GRACE_TICKS = 20 * 60
export const STORM_MIN_RADIUS = 6
export const STORM_SHRINK_SHARE = 0.8
/** Outside the storm: damage every `STORM_EVERY` ticks. */
export const STORM_EVERY = 30
export const STORM_DAMAGE = 4

export interface StormValue {
  readonly x: number
  readonly z: number
  readonly radius: number
}

/**
 * The Tampieste's safe circle, derived from match time alone: centred on the map's
 * hill zone, with a radius that starts from the farthest corner and closes in.
 * `start` is the start tick of the current match.
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
  /** Radius (m) within which the cjar is pushed or blocked. */
  reach: 4,
  /** Speed with one Benandante (m/s); each extra one, up to 3, adds a quarter. */
  speed: 1.1,
  maxPushers: 3,
  /** After this many ticks with nobody on it, the cjar slowly rolls back. */
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

/** The weapons the player can hold right now (the mitraie isn't held: you use the turret). */
export const owned = (a: ArsenalValue, id: WeaponId) =>
  id === "mescul" || id === "mandi" || id === a.primary || (id === "lanciafrico" && a.launcher)

/** Cool, free turrets and intact doors: how they are at match start. */
export const freshTurrets = (map: MapDef): TurretState[] => map.turrets.map(() => ({ gunner: null, heat: 0, jammed: false, cooldown: 0 }))
export const freshDoors = (map: MapDef): number[] => map.doors.map((d) => d.hp)

/** Breakable doors take more from kicks (the mescul) than from pellets. */
export const DOOR_MELEE_SCALE = 1.6

/** The turret `session` is using, if any. */
export const turretOf = (turrets: ReadonlyArray<TurretState>, session: string): number => turrets.findIndex((t) => t.gunner === session)

/** The spawn point farthest from living enemies, with a bit of randomness. */
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

/** Damage of a hit at distance `dist`, with the weapon's falloff. */
export function damageAt(id: WeaponId, dist: number, head: boolean) {
  const w = WEAPONS[id]
  const half = w.range / 2
  const t = dist <= half ? 0 : Math.min(1, (dist - half) / Math.max(1, half))
  const scale = 1 - (1 - w.falloff) * t
  return w.damage * scale * (head ? w.headMultiplier : 1)
}

/** Armor takes half the damage (while it lasts). */
export function absorb(hp: number, armor: number, amount: number) {
  const toArmor = Math.min(armor, amount * 0.5)
  return { hp: hp - (amount - toArmor), armor: armor - toArmor }
}
