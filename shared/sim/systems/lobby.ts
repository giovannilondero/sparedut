/**
 * Entrate, uscite, cambi di squadra e di arma principale.
 */
import { IDLE_INPUT } from "../../input.ts"
import { SPAWNS } from "../../map.ts"
import { freshArsenal, NO_STATS } from "../rules.ts"
import {
  Arsenal,
  Attackers,
  ChangePrimary,
  ChangeTeam,
  Controls,
  Game,
  Join,
  Leave,
  Life,
  Motion,
  Player,
  Stats,
  TeamOf
} from "../schema.ts"

const Members = Game.Query({
  selection: {
    player: Game.Query.read(Player),
    team: Game.Query.write(TeamOf),
    life: Game.Query.write(Life),
    arsenal: Game.Query.write(Arsenal)
  }
})

export const HandleJoin = Game.System(
  "Sparedut/HandleJoin",
  {
    queries: { members: Members },
    events: { join: Game.System.readEvent(Join) },
    commands: Game.System.commands(Game.System.spawns(Player, TeamOf, Motion, Controls, Life, Arsenal, Stats, Attackers))
  },
  ({ queries, events, commands }) => {
    const present = new Set(queries.members.each().map((m) => m.data.player.get().session))
    for (const j of events.join.all()) {
      if (present.has(j.session)) continue
      present.add(j.session)
      const spot = SPAWNS[j.team][0]
      const draft = Game.Command.spawn(
        [Player, { session: j.session, name: j.name, bot: j.bot }],
        [TeamOf, j.team],
        [Motion, { body: { x: spot.at[0], y: spot.at[1], z: spot.at[2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false }, yaw: spot.yaw, pitch: 0 }],
        [Controls, { input: { ...IDLE_INPUT, yaw: spot.yaw }, previous: 0, pressed: 0, steps: [], switchTo: null, starved: 0 }],
        [Life, { _tag: "Dead", respawn: 30, killer: null }],
        [Arsenal, freshArsenal(j.primary)],
        [Stats, NO_STATS],
        [Attackers, []]
      )
      commands.spawn(draft)
    }
  }
)

export const HandleLeave = Game.System(
  "Sparedut/HandleLeave",
  {
    queries: { members: Members },
    events: { leave: Game.System.readEvent(Leave) },
    commands: Game.System.commands(Game.System.despawns(Player))
  },
  ({ queries, events, commands }) => {
    const gone = new Set(events.leave.all().map((l) => l.session))
    if (gone.size === 0) return
    for (const m of queries.members.each()) {
      if (gone.has(m.data.player.get().session)) commands.despawn(m.entity)
    }
  }
)

export const HandleTeamChanges = Game.System(
  "Sparedut/HandleTeamChanges",
  {
    queries: { members: Members },
    events: { team: Game.System.readEvent(ChangeTeam), primary: Game.System.readEvent(ChangePrimary) }
  },
  ({ queries, events }) => {
    const teams = new Map(events.team.all().map((e) => [e.session, e.team]))
    const primaries = new Map(events.primary.all().map((e) => [e.session, e.primary]))
    if (teams.size === 0 && primaries.size === 0) return
    for (const m of queries.members.each()) {
      const session = m.data.player.get().session
      const team = teams.get(session)
      if (team && team !== m.data.team.get()) {
        m.data.team.set(team)
        const life = m.data.life.get()
        // Cambiare squadra da vivo costa la vita (niente punti a nessuno).
        if (life._tag === "Alive") m.data.life.transition({ from: "Alive", to: "Dead", data: { respawn: 60, killer: null } })
      }
      const primary = primaries.get(session)
      // La nuova arma principale arriva subito; se si aveva in mano la vecchia, si impugna la nuova.
      // Le munizioni restano quelle di ogni arma: cambiare avanti e indietro non ricarica niente.
      if (primary)
        m.data.arsenal.update((a) =>
          a.primary === primary
            ? { ...a, nextPrimary: primary }
            : {
                ...a,
                primary,
                nextPrimary: primary,
                ...(a.current === a.primary ? { current: primary, action: { _tag: "switch" as const, ticks: 20 } } : {})
              }
        )
    }
  }
)
