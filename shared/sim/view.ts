/**
 * Le proiezioni del mondo in dati semplici: l'unica lettura che fa l'host.
 */
import { trackLength, trackPoint, type V3 } from "../map.ts"
import { MAPS } from "../maps/index.ts"
import type { GameEvent, Winner } from "./events.ts"
import { CART, stormAt, type StormValue } from "./rules.ts"
import {
  Arsenal,
  Cart,
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
  | { readonly tag: "Over"; readonly winner: Winner; readonly restarts: number }

/** Il cjar (Spingi il Cjar): dove sta, quanta strada ha fatto, chi lo spinge. */
export interface CartView {
  readonly at: V3
  readonly yaw: number
  /** Da 0 (partenza) a 1 (arrivato). */
  readonly progress: number
  readonly pushers: number
  readonly contested: boolean
  readonly back: boolean
}

export interface WorldView {
  readonly tick: number
  readonly phase: PhaseView
  readonly rules: RulesValue
  readonly score: Readonly<Record<Team, number>>
  readonly flags: Readonly<Record<Team, FlagState>>
  readonly hill: HillValue
  /** Solo in Spingi il Cjar. */
  readonly cart: CartView | null
  /** Solo nella Tampieste in corso: il cerchio sicuro. */
  readonly storm: StormValue | null
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
      cart: Game.System.readResource(Cart),
      pickups: Game.System.readResource(Pickups)
    },
    machines: { match: Game.System.machine(Match) }
  },
  ({ queries, resources, machines }): WorldView => {
    const rules = resources.rules.get()
    const map = MAPS[rules.map]
    const tick = resources.tick.get()
    const cartState = resources.cart.get()
    const cartPoint = trackPoint(map.track, cartState.d)
    const cart: CartView | null =
      rules.mode === "cjar"
        ? {
            at: cartPoint.at,
            yaw: cartPoint.yaw,
            progress: Math.min(1, cartState.d / Math.max(1, trackLength(map.track))),
            pushers: cartState.pushers,
            contested: cartState.contested,
            back: cartState.pushers === 0 && !cartState.contested && cartState.idle > CART.idleTicks && cartState.d > 0
          }
        : null
    const match = machines.match.get()
    const phase: PhaseView =
      match._tag === "Live" ? { tag: "Live", ends: match.ends }
      : match._tag === "Over" ? { tag: "Over", winner: match.winner, restarts: match.restarts }
      : { tag: "Warmup" }
    const storm = rules.mode === "tampieste" && match._tag === "Live" ? stormAt(map, rules, match.ends - rules.timeLimitTicks, tick) : null
    return {
      tick,
      phase,
      rules,
      score: resources.score.get(),
      flags: resources.flags.get(),
      hill: resources.hill.get(),
      cart,
      storm,
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
