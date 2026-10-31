/**
 * Movement of the living with the shared physics, and pose memory for
 * lag compensation.
 */
import { BUTTON, type PlayerInput } from "../../input.ts"
import { turretAim, turretSeat } from "../../map.ts"
import { MAPS } from "../../maps/index.ts"
import { stepBody } from "../../movement.ts"
import { WEAPONS } from "../../weapons.ts"
import { owned, SGNAPE_SPEED, turretOf } from "../rules.ts"
import { Arsenal, Controls, Damage, Flags, Game, History, Life, Match, Motion, Out, Physics, Player, Rules, Tick, Turrets, type PoseRecord } from "../schema.ts"

const HISTORY_TICKS = 40
/** After this many ticks without commands the body starts falling on its own again. */
const STARVED_TICKS = 8

export const MovePlayers = Game.System(
  "Sparedut/MovePlayers",
  {
    queries: {
      players: Game.Query({
        selection: {
          player: Game.Query.read(Player),
          motion: Game.Query.write(Motion),
          controls: Game.Query.read(Controls),
          life: Game.Query.read(Life),
          arsenal: Game.Query.read(Arsenal)
        }
      })
    },
    resources: { flags: Game.System.readResource(Flags), rules: Game.System.readResource(Rules), turrets: Game.System.readResource(Turrets) },
    services: { physics: Game.System.service(Physics) },
    events: { out: Game.System.writeEvent(Out), damage: Game.System.writeEvent(Damage) },
    machines: { match: Game.System.machine(Match) }
  },
  ({ queries, resources, services, events, machines }) => {
    if (machines.match.get()._tag === "Over") return
    const flags = resources.flags.get()
    const turrets = resources.turrets.get()
    const spots = MAPS[resources.rules.get().map].turrets
    const carriers = new Set<string>()
    for (const f of Object.values(flags)) if (f._tag === "carried") carriers.add(f.by)
    for (const m of queries.players.each()) {
      if (m.data.life.get()._tag !== "Alive") continue
      const session = m.data.player.get().session
      const controls = m.data.controls.get()
      // On a turret you stay put in the seat, and the view turns only within the gun's arc.
      const mounted = turretOf(turrets, session)
      if (mounted >= 0) {
        const spot = spots[mounted]
        const [x, y, z] = turretSeat(spot)
        const aim = turretAim(spot, controls.input.yaw, controls.input.pitch)
        m.data.motion.set({ body: { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, crouch: false }, yaw: aim.yaw, pitch: aim.pitch })
        continue
      }
      const arsenal = m.data.arsenal.get()
      const buff = (arsenal.sgnape > 0 ? SGNAPE_SPEED : 1) * (carriers.has(session) ? 0.9 : 1)
      // Weapon weight is that of the one requested in the command (if you own it): the way prediction computes it.
      const scaleFor = (input: PlayerInput) => WEAPONS[owned(arsenal, input.weapon) ? input.weapon : arsenal.current].moveScale * buff
      // One step per arrived command. Without commands for a while (stalled network), you fall
      // anyway: a standing step, no jump.
      const steps =
        controls.steps.length > 0 ? controls.steps
        : controls.starved > STARVED_TICKS ? [{ ...controls.input, mx: 0, mz: 0, buttons: controls.input.buttons & ~BUTTON.jump }]
        : []
      let body = m.data.motion.get().body
      for (const input of steps) {
        const step = stepBody(body, input, services.physics, scaleFor(input))
        body = step.body
        if (step.launchedBy) events.out.emit({ t: "pad", s: session })
        if (step.fellOut) {
          events.damage.emit({ victim: session, attacker: null, amount: 9999, weapon: "fall", head: false, push: null })
          break
        }
      }
      m.data.motion.set({ body, yaw: controls.input.yaw, pitch: controls.input.pitch })
    }
  }
)

export const RecordHistory = Game.System(
  "Sparedut/RecordHistory",
  {
    queries: {
      players: Game.Query({ selection: { player: Game.Query.read(Player), motion: Game.Query.read(Motion), life: Game.Query.read(Life) } })
    },
    resources: { tick: Game.System.readResource(Tick), history: Game.System.writeResource(History) }
  },
  ({ queries, resources }) => {
    const poses: PoseRecord[] = []
    for (const m of queries.players.each()) {
      if (m.data.life.get()._tag !== "Alive") continue
      const b = m.data.motion.get().body
      poses.push({ session: m.data.player.get().session, x: b.x, y: b.y, z: b.z, crouch: b.crouch })
    }
    const tick = resources.tick.get()
    resources.history.update((h) => [...h.slice(-(HISTORY_TICKS - 1)), { tick, poses }])
  }
)
