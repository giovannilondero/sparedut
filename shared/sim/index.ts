/**
 * A room's simulation, ready for the host: intents in, view and events out.
 */
import { Random, type HostClock } from "@typeonce/ritmo"
import { MODE_OBJECTIVE, MODES, type ModeId } from "../folklore.ts"
import type { PlayerInput } from "../input.ts"
import type { Team } from "../map.ts"
import type { PhysicsWorld } from "../physics.ts"
import type { PrimaryId } from "../weapons.ts"
import type { GameEvent } from "./events.ts"
import { freshDoors, freshTurrets } from "./rules.ts"
import { simulate } from "./schedule.ts"
import { ChangePrimary, ChangeTeam, Game, InputArrived, Join, Leave, Match, Physics, StartMatch, Training, type PickupState, type PostValue } from "./schema.ts"
import { TRAINING } from "../training/index.ts"
import { ReadOutbox, ViewWorld, type WorldView } from "./view.ts"

export interface SimOptions {
  readonly mode: ModeId
  readonly minutes: number
  readonly scoreLimit?: number
  readonly friendlyFire?: boolean
  readonly seed: number
  /** The map's physics world: the match map is its map. */
  readonly physics: PhysicsWorld
}

export type Sim = ReturnType<typeof createSim>

/** The room's Ritmo runtime; `debug` is used by the devtools (lint, sessions). */
export function makeRuntime(options: SimOptions, debug?: { readonly hostClock: HostClock.HostClock }) {
  // The training has no warm-up and no clock: it is live from the start, at its first station.
  const training = options.mode === TRAINING.mode
  const made = Game.Runtime.make({
    services: Game.Runtime.services(Game.Runtime.service(Physics, options.physics)),
    resources: {
      Rules: {
        mode: options.mode,
        map: options.physics.map.id,
        scoreLimit: options.scoreLimit ?? MODES[options.mode].scoreLimit,
        timeLimitTicks: Math.round(options.minutes * 60 * 60),
        friendlyFire: options.friendlyFire ?? false
      },
      Objective: MODE_OBJECTIVE[options.mode],
      Tick: 0,
      Score: { benandanti: 0, malandanti: 0 },
      Flags: { benandanti: { _tag: "base" }, malandanti: { _tag: "base" } },
      Hill: { owner: null, contested: false, ticks: 0 },
      Cart: { d: 0, pushers: 0, contested: false, idle: 0 },
      Pickups: options.physics.map.pickups.map((): PickupState => ({ _tag: "up" })),
      Turrets: freshTurrets(options.physics.map),
      Doors: freshDoors(options.physics.map),
      History: [],
      Rng: Random.seed(options.seed)
    },
    machines: Game.Runtime.machines(
      Game.Runtime.machine(Match, training ? { _tag: "Live", ends: 0 } : { _tag: "Warmup" }),
      Game.Runtime.machine(Training, training ? { _tag: "Arriving", station: 0, unlocked: 1, place: true } : { _tag: "Off" })
    ),
    ...(debug ? { debug } : {})
  })
  if (!made.ok) throw new Error(`Invalid simulation: ${JSON.stringify(made.error)}`)
  return made.value
}

export function createSim(options: SimOptions) {
  const runtime = makeRuntime(options)

  return {
    /** A player arrives; with a `post`, it always spawns there, with the post's health. */
    join: (session: string, name: string, team: Team, bot: boolean, primary: PrimaryId, post: PostValue | null = null) =>
      runtime.send(Join, { session, name, team, bot, primary, post }),
    leave: (session: string) => runtime.send(Leave, { session }),
    input: (session: string, input: PlayerInput) => runtime.send(InputArrived, { session, input }),
    team: (session: string, team: Team) => runtime.send(ChangeTeam, { session, team }),
    primary: (session: string, primary: PrimaryId) => runtime.send(ChangePrimary, { session, primary }),
    start: () => runtime.send(StartMatch, {}),
    /** Advances one tick and returns the game events it produced. */
    step(): GameEvent[] {
      const ticked = runtime.tick(simulate)
      if (!ticked.ok) throw new Error(`Tick failed: ${JSON.stringify(ticked.error)}`)
      return runtime.inspect(ReadOutbox)
    },
    view: (): WorldView => runtime.inspect(ViewWorld)
  }
}

export { simulate }
export type { WorldView, PlayerView, PhaseView } from "./view.ts"
export type { GameEvent } from "./events.ts"
export type { PostValue } from "./schema.ts"
