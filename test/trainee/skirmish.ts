/** Station 12: win the skirmish against the bots, then open the scoreboard, send a quick phrase and a chat message, reporting each as the client does. */
import { BUTTON } from "../../shared/input.ts"
import { eyeHeight } from "../../shared/movement.ts"
import { FLAG_BIT, type SnapOther } from "../../shared/protocol.ts"
import type { InterfaceAction } from "../../shared/training/interface.ts"
import { WEAPONS } from "../../shared/weapons.ts"
import { yawTo, type Act, type Driver, type Drivers, type Sight } from "./moves.ts"

/** Beyond this the trainee walks towards its foe while firing (metres): close for a weapon of many pellets, whose spread is wide. */
const CLOSE_IN = { many: 5, one: 12 }
/** How often an interface step's report is sent again while the step is current (ticks). */
const EVERY = 20

/** The nearest living, unshielded player other than the trainee: in the skirmish, every bot is a foe. */
const nearestFoe = (sight: Sight): SnapOther | undefined => {
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

const fight: Driver = (sight): Act => {
  const weapon = sight.you.arsenal.primary
  const foe = nearestFoe(sight)
  if (!foe) return { input: { weapon } }
  const me = sight.you.body
  const away = Math.hypot(foe.x - me.x, foe.z - me.z)
  const rise = foe.y + 1.1 - (me.y + eyeHeight(me))
  const empty = sight.you.arsenal.ammo[weapon].mag === 0
  // Each press of a button is a new one only after it was let go: every other tick.
  const press = sight.ticks % 2 === 0
  const buttons = empty ? (press ? BUTTON.reload : 0) : BUTTON.aim | (press ? BUTTON.fire : 0)
  const close = WEAPONS[weapon].pellets > 1 ? CLOSE_IN.many : CLOSE_IN.one
  return { input: { weapon, yaw: yawTo(sight, [foe.x, foe.y, foe.z]), pitch: Math.atan2(rise, away), mz: away > close ? 1 : 0, buttons } }
}

/** Reports `action` now and then, as the client does when the player does it. */
const report =
  (action: InterfaceAction): Driver =>
  (sight) =>
    sight.ticks % EVERY === 0 ? { say: [{ t: "report", a: action }] } : {}

export const SKIRMISH: Drivers<"skirmish"> = {
  win: fight,
  board: report("board"),
  phrases: report("phrases"),
  chat: report("chat")
}
