/**
 * Bots at the training's stations: the host keeps the current station's bots present, and those
 * that do not fire walk their route with ordinary inputs. No Bun or Node here: the in-browser host
 * runs this.
 */
import { IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import type { V3 } from "../shared/map.ts"
import { SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import type { PostValue, WorldView } from "../shared/sim/index.ts"
import { STATIONS, type StationId } from "../shared/training/index.ts"
import { foeStance } from "../shared/training/spared.ts"
import { MAX_STATION_BOTS, type StationBot } from "../shared/training/station.ts"
import type { NavGraph } from "./nav.ts"

/** Within this distance (metres, horizontally) a bot has reached a point of its route. */
export const ROUTE_REACHED = 0.4

/** Something that plays a bot: one input per tick from the world as it is. */
export interface Brain {
  think(world: WorldView): PlayerInput
}

/** The station whose bots the host keeps present: the current one, none once the training is complete. */
export const stationOf = (world: WorldView): StationId | null => (world.training?.tag === "station" ? world.training.station : null)

/** The bots a station keeps present: at most `MAX_STATION_BOTS`, in the order its setup lists them. */
export const botsOf = (station: StationId): readonly StationBot[] => STATIONS[station].setup.bots.slice(0, MAX_STATION_BOTS)

/**
 * Where a station's bot (re)spawns and with what health: the first point of its route, facing the
 * second, or, for a bot standing still, facing back the way the trainee comes.
 */
export const postOf = (station: StationId, bot: StationBot): PostValue => {
  const [first, second] = bot.route
  const start = SAGRE_STATIONS[station].start.at
  const facing = second ?? start
  return { at: first, yaw: yawFrom(first, facing), hp: bot.hp }
}

/** Each station's part of a bot graph, made once per graph. */
const stationGraphs = new WeakMap<NavGraph, Map<StationId, NavGraph>>()

/**
 * The part of the bot graph inside a station's area: a station's bot that fires (the skirmish's)
 * roams and paths only there, so it does not wander up the street while the trainee waits to
 * respawn. It still walks straight at a trainee it sees outside.
 */
export const stationGraph = (graph: NavGraph, station: StationId): NavGraph => {
  let parts = stationGraphs.get(graph)
  if (!parts) stationGraphs.set(graph, (parts = new Map()))
  const made = parts.get(station)
  if (made) return made
  const { area } = SAGRE_STATIONS[station]
  const kept = graph.points.flatMap((p, i) => (p[0] >= area.minX && p[0] <= area.maxX && p[2] >= area.minZ && p[2] <= area.maxZ ? [i] : []))
  const index = new Map(kept.map((old, i) => [old, i]))
  const part: NavGraph = { points: kept.map((i) => graph.points[i]), edges: kept.map((i) => graph.edges[i].flatMap((j) => (index.has(j) ? [index.get(j)!] : []))) }
  // A station with no point of the graph in it keeps the whole graph.
  const chosen = part.points.length > 0 ? part : graph
  parts.set(station, chosen)
  return chosen
}

/** The yaw that faces `to` from `from` (0 faces north, -z). */
const yawFrom = (from: V3, to: V3) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]))

/**
 * A bot that never fires: it walks from point to point of its route and back again, and a bot with
 * one point stands on it (walking back if pushed off). Dead, it waits; it comes back at the route's start.
 */
export class RouteBrain implements Brain {
  private seq = 0
  /** The point it walks to, and which way along the route it goes. */
  private next = 0
  private way = 1

  constructor(
    readonly id: string,
    private readonly route: readonly V3[],
    private yaw: number
  ) {}

  think(world: WorldView): PlayerInput {
    const me = world.players.find((p) => p.session === this.id)
    const idle = { ...IDLE_INPUT, yaw: this.yaw, seq: ++this.seq, view: world.tick }
    if (!me || !me.alive) {
      // It comes back at the start of its route.
      this.next = 0
      this.way = 1
      if (me) this.yaw = me.yaw
      return idle
    }
    let at = this.route[this.next]
    if (Math.hypot(at[0] - me.body.x, at[2] - me.body.z) <= ROUTE_REACHED) {
      if (this.route.length === 1) return idle
      if (this.next + this.way < 0 || this.next + this.way >= this.route.length) this.way = -this.way
      this.next += this.way
      at = this.route[this.next]
    }
    this.yaw = yawFrom([me.body.x, me.body.y, me.body.z], at)
    return { ...idle, yaw: this.yaw, mz: 1 }
  }
}

/**
 * A station's bot that fires: it fights as an ordinary bot while the current step says so, and
 * stands down when it does not (`StepRule.foes`): it walks back to its post and waits there,
 * never firing. Read from the world every tick, so restarting the station makes it fight again.
 */
export class FoeBrain implements Brain {
  constructor(
    private readonly fight: Brain,
    private readonly rest: RouteBrain
  ) {}

  think(world: WorldView): PlayerInput {
    const t = world.training
    const down = t?.tag === "station" && t.step !== null && foeStance(t.station, t.step) === "standDown"
    return down ? this.rest.think(world) : this.fight.think(world)
  }
}
