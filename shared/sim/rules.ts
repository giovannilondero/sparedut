/**
 * Regole pure della simulazione: equipaggiamento, rinascita, danni.
 */
import { SPAWNS, type Spawn, type Team } from "../map.ts"
import { SGNAPE_BOMB, WEAPON_IDS, WEAPONS, type PrimaryId, type WeaponId } from "../weapons.ts"
import type { Ammo, ArsenalValue, StatsValue } from "./schema.ts"

export const MAX_HP = 100
export const MAX_ARMOR = 100
export const RESPAWN_TICKS = 180
export const SHIELD_TICKS = 90
export const SGNAPE_TICKS = 600
export const SGNAPE_SPEED = 1.3
export const ASSIST_WINDOW_TICKS = 600
export const OVER_TICKS = 15 * 60
export const FLAG_RETURN_TICKS = 30 * 60

export const otherTeam = (team: Team): Team => (team === "benandanti" ? "malandanti" : "benandanti")

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
    sgnape: 0
  }
}

export const NO_STATS: StatsValue = { kills: 0, deaths: 0, assists: 0, caps: 0, score: 0, damage: 0, headshots: 0, streak: 0, best: 0 }

/** Le armi che il giocatore può impugnare adesso. */
export const owned = (a: ArsenalValue, id: WeaponId) =>
  id === "mescul" || id === "mandi" || id === a.primary || (id === "lanciafrico" && a.launcher)

/** Il punto di rinascita più lontano dai nemici vivi, con un po' di caso. */
export function chooseSpawn(team: Team, enemies: ReadonlyArray<{ x: number; z: number }>, roll: number): Spawn {
  const spots = SPAWNS[team]
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
