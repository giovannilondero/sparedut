/**
 * Le proiezioni del mondo in dati semplici: l'unica lettura che fa l'host.
 */
import type { GameEvent } from "./events.ts"
import {
  Arsenal,
  Controls,
  Flags,
  Game,
  Hill,
  Life,
  Match,
  Motion,
  Out,
  Pickups,
  Player,
  Projectile,
  Rules,
  Score,
  Stats,
  TeamOf,
  Tick,
  type ArsenalValue,
  type FlagState,
  type HillValue,
  type ProjectileValue,
  type RulesValue,
  type StatsValue
} from "./schema.ts"
import type { Team } from "../map.ts"
import type { Body } from "../movement.ts"

export interface PlayerView {
  readonly session: string
  readonly name: string
  readonly bot: boolean
  readonly team: Team
  readonly alive: boolean
  readonly hp: number
  readonly armor: number
  readonly shield: number
  readonly respawn: number
  readonly killer: string | null
  readonly body: Body
  readonly yaw: number
  readonly pitch: number
  readonly arsenal: ArsenalValue
  readonly stats: StatsValue
  /** Ultimo ingresso applicato e i pulsanti tenuti. */
  readonly seq: number
  readonly buttons: number
}

export type PhaseView =
  | { readonly tag: "Warmup" }
  | { readonly tag: "Live"; readonly ends: number }
  | { readonly tag: "Over"; readonly winner: Team | "pari"; readonly restarts: number }

export interface WorldView {
  readonly tick: number
  readonly phase: PhaseView
  readonly rules: RulesValue
  readonly score: Readonly<Record<Team, number>>
  readonly flags: Readonly<Record<Team, FlagState>>
  readonly hill: HillValue
  readonly pickups: readonly boolean[]
  readonly projectiles: readonly ProjectileValue[]
  readonly players: readonly PlayerView[]
}

export const ViewWorld = Game.Inspector(
  "Sparedut/ViewWorld",
  {
    queries: {
      players: Game.Query({
        selection: {
          player: Game.Query.read(Player),
          team: Game.Query.read(TeamOf),
          motion: Game.Query.read(Motion),
          controls: Game.Query.read(Controls),
          life: Game.Query.read(Life),
          arsenal: Game.Query.read(Arsenal),
          stats: Game.Query.read(Stats)
        }
      }),
      projectiles: Game.Query({ selection: { projectile: Game.Query.read(Projectile) } })
    },
    resources: {
      tick: Game.System.readResource(Tick),
      rules: Game.System.readResource(Rules),
      score: Game.System.readResource(Score),
      flags: Game.System.readResource(Flags),
      hill: Game.System.readResource(Hill),
      pickups: Game.System.readResource(Pickups)
    },
    machines: { match: Game.System.machine(Match) }
  },
  ({ queries, resources, machines }): WorldView => {
    const match = machines.match.get()
    const phase: PhaseView =
      match._tag === "Live" ? { tag: "Live", ends: match.ends }
      : match._tag === "Over" ? { tag: "Over", winner: match.winner, restarts: match.restarts }
      : { tag: "Warmup" }
    return {
      tick: resources.tick.get(),
      phase,
      rules: resources.rules.get(),
      score: resources.score.get(),
      flags: resources.flags.get(),
      hill: resources.hill.get(),
      pickups: resources.pickups.get().map((p) => p._tag === "up"),
      projectiles: queries.projectiles.each().map((m) => m.data.projectile.get()),
      players: queries.players.each().map((m) => {
        const life = m.data.life.get()
        const motion = m.data.motion.get()
        const controls = m.data.controls.get()
        const info = m.data.player.get()
        return {
          session: info.session,
          name: info.name,
          bot: info.bot,
          team: m.data.team.get(),
          alive: life._tag === "Alive",
          hp: life._tag === "Alive" ? life.hp : 0,
          armor: life._tag === "Alive" ? life.armor : 0,
          shield: life._tag === "Alive" ? life.shield : 0,
          respawn: life._tag === "Dead" ? life.respawn : 0,
          killer: life._tag === "Dead" ? life.killer : null,
          body: motion.body,
          yaw: motion.yaw,
          pitch: motion.pitch,
          arsenal: m.data.arsenal.get(),
          stats: m.data.stats.get(),
          seq: controls.input.seq,
          buttons: controls.input.buttons
        }
      })
    }
  }
)

/** Gli eventi di gioco pubblicati dall'ultima lettura. */
export const ReadOutbox = Game.Inspector(
  "Sparedut/ReadOutbox",
  { events: { out: Game.System.readEvent(Out) } },
  ({ events }): GameEvent[] => [...events.out.all()]
)
