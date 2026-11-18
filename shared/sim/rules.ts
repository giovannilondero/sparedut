/**
 * Pure simulation rules: loadout, respawn, damage, who is whose enemy,
 * the storm.
 */
import type { MapDef, Spawn, Team } from "../map.ts"
import { CLASSES, RAIBL_MINE, SGNAPE_BOMB, WEAPON_IDS, WEAPONS, type PrimaryId, type Slot, type WeaponId } from "../weapons.ts"
import type { Ammo, ArsenalValue, CartValue, FlagState, HillValue, Kit, PanelState, PickupState, RulesValue, StatsValue, StormCourseValue, TurretState } from "./schema.ts"

export const MAX_ARMOR = 100
export const RESPAWN_TICKS = 180
/** After sprinting the weapon comes back up in this many ticks (server and client prediction). */
export const RAISE_TICKS = 12
export const SHIELD_TICKS = 90
export const SGNAPE_TICKS = 600
export const SGNAPE_SPEED = 1.3
/** Carrying the frico slows you down. */
export const CARRIER_SPEED = 0.9

/** A class's maximum health: what its player spawns with, and where every heal stops. */
export const maxHp = (primary: PrimaryId) => CLASSES[primary].hp

/** Health that a change of primary leaves: no more than the new class's maximum. */
export const hpFor = (primary: PrimaryId, hp: number) => Math.min(hp, maxHp(primary))
export const ASSIST_WINDOW_TICKS = 600
export const OVER_TICKS = 15 * 60
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

/** The safe circle of a storm on its own course (the training's): it closes from the course's start, then holds. */
export function stormOnCourse(course: StormCourseValue, tick: number): StormValue {
  const k = Math.min(1, Math.max(0, (tick - course.start) / Math.max(1, course.ticks)))
  return { x: course.x, z: course.z, radius: course.from + (course.to - course.from) * k }
}

/** The safe circle now: on its own course when one is set, else from the match clock (`stormAt`), as in every regular room. */
export const stormNow = (map: MapDef, rules: RulesValue, matchStart: number, course: StormCourseValue | null, tick: number): StormValue =>
  course ? stormOnCourse(course, tick) : stormAt(map, rules, matchStart, tick)

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

/** What the room's rules give a player to carry: everything, or under single weapon only its primary and the Mescul. */
export const kitOf = (rules: Pick<RulesValue, "single">): Kit => (rules.single ? "single" : "full")

/** The primary a player spawns with: the room's single weapon when it is on, else their own. */
export const primaryOf = (rules: Pick<RulesValue, "single">, own: PrimaryId): PrimaryId => rules.single ?? own

export function freshArsenal(primary: PrimaryId, kit: Kit = "full"): ArsenalValue {
  const full = kit === "full"
  return {
    kit,
    current: primary,
    primary,
    nextPrimary: primary,
    power: null,
    ammo: freshAmmo(),
    action: { _tag: "switch", ticks: 20 },
    bombs: full ? SGNAPE_BOMB.perLife : 0,
    bombCooldown: 0,
    mines: full ? RAIBL_MINE.perLife : 0,
    mineCooldown: 0,
    spin: 0,
    sgnape: 0
  }
}

export const NO_STATS: StatsValue = { kills: 0, deaths: 0, assists: 0, caps: 0, score: 0, damage: 0, headshots: 0, streak: 0, best: 0 }

/**
 * The weapons the player can hold right now (the mitraie isn't held: you use the turret). Under
 * single weapon (`kit` "single") no pistol; what is in slot 3 (the panel) stays.
 */
export const owned = (a: Pick<ArsenalValue, "kit" | "primary" | "power">, id: WeaponId) =>
  id === "mescul" || id === a.primary || id === a.power || (id === "mandi" && a.kit === "full")

/**
 * An ammunition pickup taken: every weapon owned back to its full reserve, and with a full kit the
 * bombs and mines too. Null when there is nothing to fill: the pickup stays for someone else.
 */
export function restock(a: ArsenalValue): ArsenalValue | null {
  const sidearms = a.kit === "full"
  const full = WEAPON_IDS.every((id) => !owned(a, id) || a.ammo[id].reserve >= WEAPONS[id].reserve) && (!sidearms || (a.bombs >= SGNAPE_BOMB.perLife && a.mines >= RAIBL_MINE.perLife))
  if (full) return null
  const ammo = { ...a.ammo }
  for (const id of WEAPON_IDS) ammo[id] = { mag: ammo[id].mag, reserve: Math.max(ammo[id].reserve, WEAPONS[id].reserve) }
  return sidearms ? { ...a, ammo, bombs: Math.max(a.bombs, SGNAPE_BOMB.perLife), mines: Math.max(a.mines, RAIBL_MINE.perLife) } : { ...a, ammo }
}

/** The map's pickups as a match starts them: all there, but the Lanciafrico is not on the map under single weapon. */
export const freshPickups = (map: MapDef, rules: Pick<RulesValue, "single">): PickupState[] =>
  map.pickups.map((p): PickupState => (rules.single && p.kind === "lanciafrico" ? { _tag: "absent" } : { _tag: "up" }))

/**
 * How fast a player moves, as a multiple of the walk: the class's base speed, times the multiplier
 * of the weapon in hand (`requested`, if they own it; else the one they hold), times the sgnape and
 * carrying the frico. The simulation and the client's prediction both move with it.
 */
export const speedScale = (a: Pick<ArsenalValue, "kit" | "primary" | "current" | "power" | "sgnape">, requested: WeaponId, carrier: boolean) =>
  CLASSES[a.primary].speed * WEAPONS[owned(a, requested) ? requested : a.current].moveScale * (a.sgnape > 0 ? SGNAPE_SPEED : 1) * (carrier ? CARRIER_SPEED : 1)

/** The weapon a number key selects: the one in that slot the player owns (in slot 1, the primary), or null. */
export const weaponInSlot = (a: ArsenalValue, slot: Slot): WeaponId | null => WEAPON_IDS.find((id) => WEAPONS[id].slot === slot && owned(a, id)) ?? null

/** Each objective's state as a match starts it, and as the training puts it in force: both frico at their bases, the plaçute free, the cjar at the start of its track. */
export const FRESH_FLAGS: Readonly<Record<Team, FlagState>> = { benandanti: { _tag: "base" }, malandanti: { _tag: "base" } }
export const FRESH_HILL: HillValue = { owner: null, contested: false, ticks: 0 }
export const FRESH_CART: CartValue = { d: 0, pushers: 0, contested: false, idle: 0 }

/** The station the trainee is at, arriving or on one of its steps (an index in `STATION_IDS`); null outside a training or once it is complete. */
export const currentStation = (training: { readonly _tag: "Off" | "Complete" } | { readonly _tag: "Arriving" | "Step"; readonly station: number }): number | null =>
  training._tag === "Arriving" || training._tag === "Step" ? training.station : null

/** Cool, free turrets and intact doors: how they are at match start. */
export const freshTurrets = (map: MapDef): TurretState[] => map.turrets.map(() => ({ gunner: null, heat: 0, jammed: false, cooldown: 0 }))
export const freshDoors = (map: MapDef): number[] => map.doors.map((d) => d.hp)
/** Every panel on its wall: how they are at match start. */
export const freshPanels = (map: MapDef): PanelState[] => (map.panels ?? []).map(() => ({ _tag: "wall" }))

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
