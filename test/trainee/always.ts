/** Station 3: hit a bot with the Mandi, then aiming, reload, hit one with the mescul, kick the door down. */
import { eyeHeight } from "../../shared/movement.ts"
import { BUTTON } from "../../shared/input.ts"
import { SAGRE_STATIONS } from "../../shared/maps/sagre.ts"
import { FLAG_BIT, type SnapOther } from "../../shared/protocol.ts"
import { walkTo, yawTo, type Act, type Drivers, type Sight } from "./moves.ts"

const PLACE = SAGRE_STATIONS[2]
/** Close enough to the mescul's target to swing (the mescul reaches 2.4 m). */
const SWING_FROM = 1.6

/** The nearest living, unshielded player other than the trainee. */
const nearestTarget = (sight: Sight): SnapOther | undefined => {
  const me = sight.you.body
  let best: SnapOther | undefined
  let bestD = Infinity
  for (const p of sight.snap.players) {
    if (Math.abs(p.x - me.x) < 0.01 && Math.abs(p.z - me.z) < 0.01) continue
    if (!(p.f & FLAG_BIT.alive) || p.f & FLAG_BIT.shield) continue
    const d = Math.hypot(p.x - me.x, p.z - me.z)
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

/** A trigger pulled every other tick: a semi-automatic weapon fires on each press. */
const pull = (sight: Sight, extra = 0) => (sight.ticks % 2 === 0 ? BUTTON.fire : 0) | extra

const shoot = (aim: boolean) => (sight: Sight): Act => {
  const p = nearestTarget(sight)
  if (!p) return { input: { weapon: "mandi" } }
  return { input: { weapon: "mandi", ...lookAt(sight, p), buttons: pull(sight, aim ? BUTTON.aim : 0) } }
}

export const ALWAYS: Drivers<"always"> = {
  mandiHit: shoot(false),
  aimedHit: shoot(true),
  reload: (sight) => ({ input: { weapon: "mandi", buttons: sight.ticks % 2 === 0 ? BUTTON.reload : 0 } }),
  mesculHit: (sight) => {
    const p = nearestTarget(sight)
    if (!p) return { input: { weapon: "mescul" } }
    const me = sight.you.body
    if (Math.hypot(p.x - me.x, p.z - me.z) > SWING_FROM) return { input: { ...walkTo(sight, [p.x, p.y, p.z]).input, weapon: "mescul" } }
    return { input: { weapon: "mescul", ...lookAt(sight, p), buttons: pull(sight) } }
  },
  doorDown: (sight) => {
    const me = sight.you.body
    if (Math.hypot(PLACE.doorFront[0] - me.x, PLACE.doorFront[2] - me.z) > 0.3) return { input: { ...walkTo(sight, PLACE.doorFront).input, weapon: "mescul" } }
    // The door is to the north.
    return { input: { weapon: "mescul", yaw: 0, pitch: 0, buttons: pull(sight) } }
  }
}
