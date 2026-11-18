/**
 * What a training station is made of: its setup, its steps, and what completes each step.
 * Language-neutral data shared by the simulation, the host and the client; the text of every
 * station and step is in `client/training-text/`.
 */
import type { ObjectiveId } from "../folklore.ts"
import type { Team, V3 } from "../map.ts"
import type { Body } from "../movement.ts"
import type { GameEvent } from "../sim/events.ts"
import type { ArsenalValue, ControlsValue } from "../sim/schema.ts"
import type { PrimaryId, WeaponId } from "../weapons.ts"
import type { InterfaceAction } from "./interface.ts"

/**
 * The controls a step can teach: its prompt names the control, and each device shows it as its
 * own key, button or on-screen control. A closed set: a new control does not compile until every
 * device has a way to show it.
 */
export const CONTROL_IDS = [
  "look",
  "move",
  "jump",
  "crouch",
  "sprint",
  "fire",
  "aim",
  "reload",
  /** Choosing a weapon by its slot's number. */
  "slot",
  "lastWeapon",
  /** Cycling through the weapons (the mouse wheel). */
  "cycle",
  "armoury",
  "bomb",
  "mine",
  /** Mounting and dismounting a turret. */
  "use",
  "board",
  "phrases"
] as const
export type ControlId = (typeof CONTROL_IDS)[number]

/** What a step sees each tick while it is the current step: the trainee and what happened. */
export interface Seen {
  readonly tick: number
  readonly me: {
    readonly session: string
    readonly body: Body
    readonly yaw: number
    readonly pitch: number
    readonly hp: number
    readonly armor: number
    /** This tick's commands, buttons pressed and weapon switch (see `ControlsValue`). */
    readonly controls: ControlsValue
    readonly arsenal: ArsenalValue
  }
  /** Every game event the simulation published this tick before the training looked (shots, hits, kills, pickups…). */
  readonly events: readonly GameEvent[]
  /** How many reports of the step's own interface action (`StepRule.report`) arrived this tick; 0 for a step without one. */
  readonly reported: number
}

/** A step's progress: how many times its action happened, and a number the step keeps for itself. */
export interface StepProgress {
  readonly count: number
  readonly mark: number
}

/**
 * One step: the control it teaches, how many times its action must happen, and what completes it.
 * `begin` runs once, on the tick the step becomes current; `advance` runs every tick after while it
 * is current, and the step completes on the tick `count` reaches `target`. An action that happened
 * before the step was current never counts: `advance` only ever sees ticks of its own.
 */
export interface StepRule {
  readonly control: ControlId
  /** How many times the action must happen; the HUD shows a count when it is more than one. */
  readonly target: number
  /** An interface step's action: the client's report of it reaches `advance` as `Seen.reported` (`./interface.ts`). */
  readonly report?: InterfaceAction
  readonly begin: (seen: Seen) => StepProgress
  readonly advance: (seen: Seen, now: StepProgress) => StepProgress
}

/**
 * A bot at a station: kept present by the host while the station is current, gone when it is not
 * (`server/station-bot.ts`). It spawns, and comes back after the usual respawn delay when killed,
 * at the first point of its route, with `hp` health.
 */
export interface StationBot {
  readonly team: Team
  /** The points it walks, back and forth; a single point is a bot standing still. */
  readonly route: readonly V3[]
  /** False: it walks its route and never fires. True: an ordinary bot at the room's skill, which leaves its route to fight. */
  readonly fires: boolean
  /** Its health on every spawn (`MAX_HP` is full). */
  readonly hp: number
}

/** The most bots a station keeps present, so never more alive at once: the host keeps the first ones its setup lists. */
export const MAX_STATION_BOTS = 4

/** What arriving at a station gives the trainee and puts in force. Every weapon's ammunition is refilled unless `ammo` says otherwise. */
export interface StationSetup {
  /** The primary the trainee is given at the station (applied before `hold`); the trainee's own when absent. Their own comes back at the next station. */
  readonly primary?: PrimaryId
  /** The weapon in hand on arrival; the trainee's own primary when absent. */
  readonly hold?: WeaponId
  /** Health on arrival; full when absent. */
  readonly hp?: number
  /** Armour on arrival; none when absent. */
  readonly armor?: number
  /** The objective in force while the station is current. */
  readonly objective: ObjectiveId
  readonly bots: readonly StationBot[]
  /** How much ammunition the trainee is given; all of it when absent. */
  readonly ammo?: AmmoSetup
  /** Pickups put back on arrival (indices in the map's `pickups`), so they are there however recently they were taken. */
  readonly pickups?: readonly number[]
  /** Bombs and mines given back whenever the last one is used while the station is current, so a miss never leaves a step undoable. */
  readonly restock?: boolean
}

/**
 * How much ammunition arriving at a station gives. `full`: every weapon's magazine and reserve,
 * bombs and mines. `loaded`: only what is in each magazine, no reserve, no bombs or mines.
 */
export type AmmoSetup = "full" | "loaded"

/** A station: its setup and its steps, in the order the trainee performs them (the keys' order). */
export interface StationDef<Steps extends Readonly<Record<string, StepRule>> = Readonly<Record<string, StepRule>>> {
  readonly setup: StationSetup
  readonly steps: Steps
}

/** Declares a station, keeping its step ids as written. */
export const station = <const Steps extends Readonly<Record<string, StepRule>>>(def: StationDef<Steps>): StationDef<Steps> => def

// --- Step helpers: the usual shapes of a completion rule ----------------------------------

const NOTHING_YET: StepProgress = { count: 0, mark: 0 }

/** A step whose action is counted each tick: `performed` says how many times it happened this tick. */
export const counted = (control: ControlId, target: number, performed: (seen: Seen) => number): StepRule => ({
  control,
  target,
  begin: () => NOTHING_YET,
  advance: (seen, now) => ({ count: now.count + performed(seen), mark: now.mark })
})

/** A step done by one tick in which `happened` holds. */
export const once = (control: ControlId, happened: (seen: Seen) => boolean): StepRule => counted(control, 1, (seen) => (happened(seen) ? 1 : 0))

/** Whether the trainee stands within `radius` metres of `at`, horizontally. */
export const near = (seen: Seen, at: V3, radius: number) => {
  const dx = seen.me.body.x - at[0]
  const dz = seen.me.body.z - at[2]
  return dx * dx + dz * dz <= radius * radius
}

/**
 * A step done by walking into an area: `inside` must go from false to true while the step is
 * current. A trainee already inside when the step begins has to step out and back in.
 */
export const entering = (control: ControlId, inside: (seen: Seen) => boolean): StepRule => ({
  control,
  target: 1,
  begin: (seen) => ({ count: 0, mark: inside(seen) ? 1 : 0 }),
  advance: (seen, now) => {
    const isIn = inside(seen)
    return { count: now.count + (isIn && now.mark === 0 ? 1 : 0), mark: isIn ? 1 : 0 }
  }
})
