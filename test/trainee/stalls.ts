/** Station 5: walk to each stall and hit its bot with the stall's weapon. */
import { eyeHeight } from "../../shared/movement.ts"
import { BUTTON } from "../../shared/input.ts"
import type { Spawn } from "../../shared/map.ts"
import { SAGRE_STATIONS } from "../../shared/maps/sagre.ts"
import { FLAG_BIT, type SnapOther } from "../../shared/protocol.ts"
import { SCOPED_AFTER_TICKS, STALL_SHOOTS_AT, type StallId } from "../../shared/training/stations/stalls.ts"
import type { WeaponId } from "../../shared/weapons.ts"
import { walkTo, yawTo, type Act, type Driver, type Drivers, type Sight } from "./moves.ts"

const PLACE = SAGRE_STATIONS.stalls
/** Close enough to a stall's spot to shoot from it. */
const STAND_WITHIN = 0.4
/** How far from its post a moving target can be: the longest route's length. */
const TARGET_SLACK = 8

/** The living, unshielded player other than the trainee nearest to the post of stall `of`'s target. */
const targetOf = (sight: Sight, of: StallId): SnapOther | undefined => {
  const me = sight.you.body
  const post = PLACE.stalls[of].target[0]
  let best: SnapOther | undefined
  let bestD = TARGET_SLACK
  for (const p of sight.snap.players) {
    if (Math.abs(p.x - me.x) < 0.01 && Math.abs(p.z - me.z) < 0.01) continue
    if (!(p.f & FLAG_BIT.alive) || p.f & FLAG_BIT.shield) continue
    const d = Math.hypot(p.x - post[0], p.z - post[2])
    if (d < bestD) [best, bestD] = [p, d]
  }
  return best
}

/** Faces a player's chest. */
const lookAt = (sight: Sight, p: SnapOther) => {
  const me = sight.you.body
  const rise = p.y + 1.1 - (me.y + eyeHeight(me))
  return { yaw: yawTo(sight, [p.x, p.y, p.z]), pitch: Math.atan2(rise, Math.hypot(p.x - me.x, p.z - me.z)) }
}

/** How a shooter works the trigger: held down (automatic weapons), pulled every other tick, or not at all. */
export type Trigger = "hold" | "pull" | "none"

export interface Shooting {
  /** Where to stand: a stall's spot unless said otherwise. */
  readonly from: Spawn
  /** Whose bot to shoot at. */
  readonly at: StallId
  readonly weapon: WeaponId
  readonly trigger: Trigger
  /** Aiming: never, always (held from the step's first tick), or only on the ticks the trigger is pulled. */
  readonly aim: "never" | "always" | "tap"
}

/** Walks to a spot, then shoots at a stall's bot with a weapon. */
export const shooter = (s: Shooting): Driver => (sight) => {
  const me = sight.you.body
  const held = s.aim === "always" ? BUTTON.aim : 0
  if (Math.hypot(s.from.at[0] - me.x, s.from.at[2] - me.z) > STAND_WITHIN) return { input: { ...walkTo(sight, s.from.at).input, weapon: s.weapon, buttons: held } }
  const p = targetOf(sight, s.at)
  if (!p) return { input: { weapon: s.weapon, buttons: held } }
  const pulled = s.trigger === "hold" || (s.trigger === "pull" && sight.ticks % 2 === 0)
  const buttons = held | (pulled ? BUTTON.fire | (s.aim === "tap" ? BUTTON.aim : 0) : 0)
  return { input: { weapon: s.weapon, ...lookAt(sight, p), buttons } }
}

/** A stall's own way: its weapon, at its bot, from its spot. */
const atStall = (stall: StallId, trigger: Trigger, aim: Shooting["aim"] = "always"): Driver =>
  shooter({ from: PLACE.stalls[stall].at, at: STALL_SHOOTS_AT[stall], weapon: stall, trigger, aim })

/** The Cjampanili fires only once the scope is up: aim held for longer than it takes. */
const scoped: Driver = (sight): Act => {
  const driver = atStall("cjampanili", sight.ticks > SCOPED_AFTER_TICKS + 2 ? "pull" : "none")
  return driver(sight)
}

export const STALLS: Drivers<"stalls"> = {
  cramar: atStall("cramar", "hold"),
  doplete: atStall("doplete", "pull"),
  cjampanili: scoped,
  mulin: atStall("mulin", "hold"),
  gjalinis: atStall("gjalinis", "pull", "never")
}
