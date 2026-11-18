/**
 * Movement of the living with the shared physics, and pose memory for
 * lag compensation.
 */
import { BUTTON } from "../../input.ts"
import { turretAim, turretSeat } from "../../map.ts"
import { MAPS } from "../../maps/index.ts"
import { seatedBody, stepBody } from "../../movement.ts"
import { speedScale, turretOf } from "../rules.ts"
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
    const { data } = queries.players
    if (machines.match.get()._tag === "Over") return
    const flags = resources.flags.get()
    const turrets = resources.turrets.get()
    const spots = MAPS[resources.rules.get().map].turrets
    const carriers = new Set<string>()
    for (const f of Object.values(flags)) if (f._tag === "carried") carriers.add(f.by)
    for (const m of queries.players.each()) {
      if (data.life.get(m)._tag !== "Alive") continue
      const session = data.player.get(m).session
      const controls = data.controls.get(m)
      // On a turret you sit behind the gun, which turns with your view within its arc.
      const mounted = turretOf(turrets, session)
      if (mounted >= 0) {
        const spot = spots[mounted]
        const aim = turretAim(spot, controls.input.yaw, controls.input.pitch)
        data.motion.set(m, { body: seatedBody(turretSeat(spot, controls.input.yaw)), yaw: aim.yaw, pitch: aim.pitch })
        continue
      }
      const arsenal = data.arsenal.get(m)
      const carrier = carriers.has(session)
      // One step per arrived command. Without commands for a while (stalled network), you fall
      // anyway: a standing step, no jump.
      const steps =
        controls.steps.length > 0 ? controls.steps
        : controls.starved > STARVED_TICKS ? [{ ...controls.input, mx: 0, mz: 0, buttons: controls.input.buttons & ~BUTTON.jump }]
        : []
      let body = data.motion.get(m).body
      for (const input of steps) {
        const step = stepBody(body, input, services.physics, speedScale(arsenal, input.weapon, carrier))
        body = step.body
        if (step.launchedBy) events.out.emit({ t: "pad", s: session })
        if (step.fellOut) {
          events.damage.emit({ victim: session, attacker: null, amount: 9999, weapon: "fall", head: false, push: null })
          break
        }
      }
      data.motion.set(m, { body, yaw: controls.input.yaw, pitch: controls.input.pitch })
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
    const { data } = queries.players
    const poses: PoseRecord[] = []
    for (const m of queries.players.each()) {
      if (data.life.get(m)._tag !== "Alive") continue
      const b = data.motion.get(m).body
      poses.push({ session: data.player.get(m).session, x: b.x, y: b.y, z: b.z, crouch: b.crouch })
    }
    const tick = resources.tick.get()
    resources.history.update((h) => [...h.slice(-(HISTORY_TICKS - 1)), { tick, poses }])
  }
)
