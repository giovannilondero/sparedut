/**
 * Projections of the world into plain data: the only read the host does.
 */
import type { ObjectiveId } from "../folklore.ts"
import { trackLength, trackPoint, type V3 } from "../map.ts"
import { MAPS } from "../maps/index.ts"
import { STATION_IDS, stepRule, stepsOf, type StationId, type StepId } from "../training/index.ts"
import type { GameEvent, Winner } from "./events.ts"
import { CART, stormNow, type StormValue } from "./rules.ts"
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
  Objective,
  Out,
  Pickups,
  Player,
  Projectile,
  Rules,
  Score,
  Stats,
  StormCourse,
  TeamOf,
  Tick,
  Turrets,
  Doors,
  Panels,
  Training,
  type ArsenalValue,
  type FlagState,
  type HillValue,
  type PickupState,
  type ProjectileValue,
  type RulesValue,
  type StatsValue,
  type TurretState
} from "./schema.ts"
import type { Team } from "../map.ts"
import { sprinting, type Body } from "../movement.ts"
import { pressed } from "../input.ts"
import { PANEL_TEAR_TICKS } from "../weapons.ts"

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
  /** Last applied input and the held buttons. */
  readonly seq: number
  readonly buttons: number
  /** The trigger held with the weapon up: not while sprinting, when the weapon is lowered and nothing fires or revs. */
  readonly firing: boolean
}

/** A pickup as it is seen: there, taken and coming back, or not on the map for the match (the Lanciafrico under single weapon). */
export type PickupView = PickupState["_tag"]

export type PhaseView =
  /** `starts`: the tick the countdown ends, null while none runs. */
  | { readonly tag: "Muster"; readonly starts: number | null }
  | { readonly tag: "Live"; readonly ends: number }
  | { readonly tag: "Over"; readonly winner: Winner; readonly restarts: number }

/**
 * A panel (`map.panels`): on its wall, being torn off (by whom, from 0 to 1), carried (by whom, with
 * its health), lying on the ground (where, with its health), or broken. Off the wall its gap is open.
 */
export type PanelView =
  | { readonly tag: "wall" }
  | { readonly tag: "tearing"; readonly by: string; readonly progress: number }
  | { readonly tag: "carried"; readonly by: string; readonly hp: number }
  | { readonly tag: "lying"; readonly at: V3; readonly hp: number }
  | { readonly tag: "broken" }

/** The cjar (Spingi il Cjar): where it is, how far it has gone, who is pushing it. */
export interface CartView {
  readonly at: V3
  readonly yaw: number
  /** From 0 (start) to 1 (arrived). */
  readonly progress: number
  readonly pushers: number
  readonly contested: boolean
  readonly back: boolean
}

/**
 * The training's progress, as the trainee's HUD shows it: the station, the current step (null
 * while arriving), how many times its action happened out of how many, and how many stations,
 * from the first, are unlocked, and whether the training was completed once (every station completed).
 */
export type TrainingView =
  | {
      readonly tag: "station"
      readonly station: StationId
      readonly step: StepId | null
      readonly count: number
      readonly target: number
      readonly unlocked: number
      readonly completed: boolean
    }
  | { readonly tag: "complete" }

export interface WorldView {
  readonly tick: number
  readonly phase: PhaseView
  readonly rules: RulesValue
  /** The objective in force. */
  readonly objective: ObjectiveId
  readonly score: Readonly<Record<Team, number>>
  readonly flags: Readonly<Record<Team, FlagState>>
  readonly hill: HillValue
  /** Only while the cjar is in force. */
  readonly cart: CartView | null
  /** Only while the storm is in force and the match is live: the safe circle. */
  readonly storm: StormValue | null
  /** One per `map.pickups`: there, taken and coming back, or not on the map for the match. */
  readonly pickups: readonly PickupView[]
  /** One per `map.turrets`. */
  readonly turrets: ReadonlyArray<TurretState>
  /** Health of each breakable door (0 = broken down). */
  readonly doors: readonly number[]
  /** One per `map.panels`. */
  readonly panels: readonly PanelView[]
  readonly projectiles: readonly ProjectileValue[]
  readonly players: readonly PlayerView[]
  /** Only in a training. */
  readonly training: TrainingView | null
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
      objective: Game.System.readResource(Objective),
      score: Game.System.readResource(Score),
      flags: Game.System.readResource(Flags),
      hill: Game.System.readResource(Hill),
      cart: Game.System.readResource(Cart),
      stormCourse: Game.System.readResource(StormCourse),
      pickups: Game.System.readResource(Pickups),
      turrets: Game.System.readResource(Turrets),
      doors: Game.System.readResource(Doors),
      panels: Game.System.readResource(Panels)
    },
    machines: { match: Game.System.machine(Match), training: Game.System.machine(Training) }
  },
  ({ queries, resources, machines }): WorldView => {
    const { data } = queries.players
    const rules = resources.rules.get()
    const map = MAPS[rules.map]
    const tick = resources.tick.get()
    const objective = resources.objective.get()
    const cartState = resources.cart.get()
    const cartPoint = trackPoint(map.track, cartState.d)
    const cart: CartView | null =
      objective === "cjar"
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
      : { tag: "Muster", starts: match.starts }
    const progress = machines.training.get()
    let training: TrainingView | null = null
    if (progress._tag === "Complete") training = { tag: "complete" }
    else if (progress._tag === "Arriving") training = { tag: "station", station: STATION_IDS[progress.station], step: null, count: 0, target: 0, unlocked: progress.unlocked, completed: progress.completed }
    else if (progress._tag === "Step") {
      const station = STATION_IDS[progress.station]
      const step = stepsOf(station)[progress.step]
      training = { tag: "station", station, step, count: progress.count, target: stepRule(station, step).target, unlocked: progress.unlocked, completed: progress.completed }
    }
    const storm = objective === "storm" && match._tag === "Live" ? stormNow(map, rules, match.ends - rules.timeLimitTicks, resources.stormCourse.get(), tick) : null
    return {
      tick,
      phase,
      rules,
      objective,
      score: resources.score.get(),
      flags: resources.flags.get(),
      hill: resources.hill.get(),
      cart,
      storm,
      pickups: resources.pickups.get().map((p) => p._tag),
      turrets: resources.turrets.get(),
      doors: resources.doors.get(),
      panels: resources.panels.get().map((p): PanelView => {
        switch (p._tag) {
          case "tearing":
            return { tag: "tearing", by: p.by, progress: Math.min(1, p.ticks / PANEL_TEAR_TICKS) }
          case "carried":
            return { tag: "carried", by: p.by, hp: p.hp }
          case "lying":
            return { tag: "lying", at: [p.x, p.y, p.z], hp: p.hp }
          default:
            return { tag: p._tag }
        }
      }),
      projectiles: queries.projectiles.each().map((m) => queries.projectiles.data.projectile.get(m)),
      players: queries.players.each().map((m) => {
        const life = data.life.get(m)
        const motion = data.motion.get(m)
        const controls = data.controls.get(m)
        const info = data.player.get(m)
        return {
          session: info.session,
          name: info.name,
          bot: info.bot,
          team: data.team.get(m),
          alive: life._tag === "Alive",
          hp: life._tag === "Alive" ? life.hp : 0,
          armor: life._tag === "Alive" ? life.armor : 0,
          shield: life._tag === "Alive" ? life.shield : 0,
          respawn: life._tag === "Dead" ? life.respawn : 0,
          killer: life._tag === "Dead" ? life.killer : null,
          body: motion.body,
          yaw: motion.yaw,
          pitch: motion.pitch,
          arsenal: data.arsenal.get(m),
          stats: data.stats.get(m),
          seq: controls.input.seq,
          buttons: controls.input.buttons,
          firing: pressed(controls.input, "fire") && !sprinting(controls.input, motion.body.crouch)
        }
      }),
      training
    }
  }
)

/** Game events published since the last read. */
export const ReadOutbox = Game.Inspector(
  "Sparedut/ReadOutbox",
  { events: { out: Game.System.readEvent(Out) } },
  ({ events }): GameEvent[] => [...events.out.all()]
)
