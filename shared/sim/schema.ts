/**
 * The simulation schema: components, resources, events, services, match state machine.
 *
 * The simulation runs authoritatively on the server, one per room. It receives intents
 * (inputs, joins, leaves) as events from the host and publishes game events
 * that the host forwards to the clients. Physics: the `Physics` service (Rapier).
 */
import { Descriptor, Random, Schema } from "@typeonce/ritmo"
import { z } from "zod"
import type { PlayerInput } from "../input.ts"
import type { MapId, Team, V3 } from "../map.ts"
import type { Body } from "../movement.ts"
import type { PhysicsWorld } from "../physics.ts"
import type { ModeId, ObjectiveId } from "../folklore.ts"
import type { PowerId, PrimaryId, ProjectileKind, WeaponId } from "../weapons.ts"
import type { InterfaceAction } from "../training/interface.ts"
import type { StationId, StepId } from "../training/index.ts"
import type { Device } from "../devices.ts"
import type { GameEvent, KillCause } from "./events.ts"

export const Root = Schema.defineRoot("Sparedut")

// --- Components -------------------------------------------------------------

export interface PlayerInfo {
  readonly session: string
  readonly name: string
  readonly bot: boolean
}
export const Player = Descriptor.Component<PlayerInfo>()("Sparedut/Player")
export const TeamOf = Descriptor.Component<Team>()("Sparedut/Team")

/**
 * A member that always (re)spawns at one place, with a given health: a bot the training keeps at a
 * station. Members without one spawn at their team's spawn points with full health.
 */
export interface PostValue {
  readonly at: V3
  readonly yaw: number
  readonly hp: number
}
export const Post = Descriptor.Component<PostValue>()("Sparedut/Post")

export interface MotionValue {
  readonly body: Body
  readonly yaw: number
  readonly pitch: number
}
export const Motion = Descriptor.Component<MotionValue>()("Sparedut/Motion")

export interface ControlsValue {
  /** The last applied command: look direction, held buttons, weapon, acknowledged number. */
  readonly input: PlayerInput
  /** Buttons at the end of the previous tick, to detect presses. */
  readonly previous: number
  /** All buttons seen in this tick's commands (a short press isn't lost). */
  readonly pressed: number
  /**
   * The commands that arrived this tick, in order: each one is a movement step,
   * exactly as client prediction already applied them.
   */
  readonly steps: ReadonlyArray<PlayerInput>
  /**
   * The weapon requested this tick, only if the command changed it from the
   * previous one. The server switches weapons on changes, not on the value: that way a pickup or
   * an armory that switches weapons by itself isn't undone by commands already in flight.
   */
  readonly switchTo: WeaponId | null
  /** Consecutive ticks without commands (lagging network or paused tab). */
  readonly starved: number
}
export const Controls = Descriptor.Component<ControlsValue>()("Sparedut/Controls")

/** Alive or dead: each one's fields exist only in its own state. */
export const Life = Descriptor.EntityState(
  "Sparedut/Life",
  {
    Alive: z.object({
      hp: z.number(),
      armor: z.number(),
      /** Protection ticks after respawning. */
      shield: z.number().int()
    }),
    Dead: z.object({
      respawn: z.number().int(),
      killer: z.string().nullable()
    })
  },
  { transitions: { Alive: ["Dead"], Dead: ["Alive"] } }
)

export type WeaponAction =
  | { readonly _tag: "ready" }
  | { readonly _tag: "cooldown"; readonly ticks: number }
  | { readonly _tag: "reload"; readonly ticks: number }
  | { readonly _tag: "switch"; readonly ticks: number }

export interface Ammo {
  readonly mag: number
  readonly reserve: number
}

/**
 * What a player carries besides the primary and the Mescul: `full`, the pistol, the bombs, the mines
 * and room for the Lanciafrico; `single` (a single-weapon room), nothing else. Set at each spawn
 * from the room's rules (`kitOf`).
 */
export type Kit = "full" | "single"

export interface ArsenalValue {
  readonly kit: Kit
  readonly current: WeaponId
  readonly primary: PrimaryId
  /** The primary weapon chosen for the next respawn. */
  readonly nextPrimary: PrimaryId
  /** What is carried in slot 3: the Lanciafrico or the casot's panel, never both; null when nothing. */
  readonly power: PowerId | null
  readonly ammo: Readonly<Record<WeaponId, Ammo>>
  readonly action: WeaponAction
  readonly bombs: number
  readonly bombCooldown: number
  /** Raibl mines still to plant. */
  readonly mines: number
  readonly mineCooldown: number
  /** Spin ticks accumulated by the Mulin (0 for other weapons). */
  readonly spin: number
  /** Ticks of sgnape left in your system (you run faster). */
  readonly sgnape: number
}
export const Arsenal = Descriptor.Component<ArsenalValue>()("Sparedut/Arsenal")

export interface StatsValue {
  readonly kills: number
  readonly deaths: number
  readonly assists: number
  readonly caps: number
  readonly score: number
  readonly damage: number
  readonly headshots: number
  readonly streak: number
  readonly best: number
}
export const Stats = Descriptor.Component<StatsValue>()("Sparedut/Stats")

/** Who dealt damage recently (for assists). */
export const Attackers = Descriptor.Component<ReadonlyArray<{ readonly session: string; readonly tick: number }>>()("Sparedut/Attackers")

export interface ProjectileValue {
  readonly kind: ProjectileKind
  readonly x: number
  readonly y: number
  readonly z: number
  readonly vx: number
  readonly vy: number
  readonly vz: number
  readonly fuse: number
  readonly age: number
  readonly bounces: number
  readonly owner: string
  readonly team: Team
}
export const Projectile = Descriptor.Component<ProjectileValue>()("Sparedut/Projectile")

// --- Resources --------------------------------------------------------------

export interface RulesValue {
  readonly mode: ModeId
  readonly map: MapId
  readonly scoreLimit: number
  readonly timeLimitTicks: number
  readonly friendlyFire: boolean
  /** Single weapon: off (null), or the one primary every player carries, with the Mescul and nothing else. */
  readonly single: PrimaryId | null
}
export const Rules = Descriptor.Resource<RulesValue>()("Sparedut/Rules")
/** The objective in force: the objective systems read this, never the mode. A regular room derives it from its mode. */
export const Objective = Descriptor.Resource<ObjectiveId>()("Sparedut/Objective")
export const Tick = Descriptor.Resource<number>()("Sparedut/Tick")
export const Score = Descriptor.Resource<Readonly<Record<Team, number>>>()("Sparedut/Score")

export type FlagState =
  | { readonly _tag: "base" }
  | { readonly _tag: "carried"; readonly by: string }
  | { readonly _tag: "dropped"; readonly x: number; readonly y: number; readonly z: number; readonly ticks: number }
export const Flags = Descriptor.Resource<Readonly<Record<Team, FlagState>>>()("Sparedut/Flags")

export interface HillValue {
  readonly owner: Team | null
  readonly contested: boolean
  readonly ticks: number
}
export const Hill = Descriptor.Resource<HillValue>()("Sparedut/Hill")

/** The cjar to push (Spingi il Cjar): metres travelled along `map.track`. */
export interface CartValue {
  readonly d: number
  /** Living Benandanti on the cjar (0 if contested). */
  readonly pushers: number
  readonly contested: boolean
  /** Ticks with nobody pushing: after a while the cjar rolls back. */
  readonly idle: number
}
export const Cart = Descriptor.Resource<CartValue>()("Sparedut/Cart")

/**
 * A storm on a course of its own (the training's, `StepGiven.storm`): closing on (`x`, `z`) from
 * `from` to `to` metres over `ticks` ticks from tick `start`, then holding. Null where the storm
 * follows the match clock instead (a regular room's Tampieste, `stormAt`); read only while the
 * storm is the objective in force.
 */
export interface StormCourseValue {
  readonly x: number
  readonly z: number
  readonly from: number
  readonly to: number
  readonly start: number
  readonly ticks: number
}
export const StormCourse = Descriptor.Resource<StormCourseValue | null>()("Sparedut/StormCourse")

/** A turret (one per `map.turrets`, same order). */
export interface TurretState {
  /** Who is using it (session): stays put behind the gun until they dismount or die. */
  readonly gunner: string | null
  /** Heat from 0 to 1. */
  readonly heat: number
  /** Overheated: won't fire until heat is back to 0. */
  readonly jammed: boolean
  /** Ticks until the next shot. */
  readonly cooldown: number
}
export const Turrets = Descriptor.Resource<ReadonlyArray<TurretState>>()("Sparedut/Turrets")

/** Health of the breakable doors (one per `map.doors`): 0 means broken down. */
export const Doors = Descriptor.Resource<ReadonlyArray<number>>()("Sparedut/Doors")

/**
 * A panel (one per `map.panels`): on the wall, being torn off by one player (`ticks` of "use" held
 * so far), or off the wall, leaving its gap, until the next match. Once off it is in its
 * carrier's arsenal (`ArsenalValue.power`), not here.
 */
export type PanelState =
  | { readonly _tag: "wall" }
  | { readonly _tag: "tearing"; readonly by: string; readonly ticks: number }
  | { readonly _tag: "off" }
export const Panels = Descriptor.Resource<ReadonlyArray<PanelState>>()("Sparedut/Panels")

/** A pickup: there, taken and coming back, or not on the map for the match (the Lanciafrico under single weapon). */
export type PickupState = { readonly _tag: "up" } | { readonly _tag: "down"; readonly ticks: number } | { readonly _tag: "absent" }
/** One per `PICKUPS` point, in the same order. */
export const Pickups = Descriptor.Resource<ReadonlyArray<PickupState>>()("Sparedut/Pickups")

export interface PoseRecord {
  readonly session: string
  readonly x: number
  readonly y: number
  readonly z: number
  readonly crouch: boolean
}
/** Poses from the last ticks, to hit where the shooter saw the target. */
export const History = Descriptor.TransientResource<ReadonlyArray<{ readonly tick: number; readonly poses: ReadonlyArray<PoseRecord> }>>()("Sparedut/History")

export const Rng = Descriptor.ConstructedResource(Random.codec)("Sparedut/Rng")

// --- Events -----------------------------------------------------------------

/** From the host: a player arrives (human or bot), with a post when it always spawns at one place. */
export const Join = Descriptor.Event<{
  readonly session: string
  readonly name: string
  readonly team: Team
  readonly bot: boolean
  readonly primary: PrimaryId
  readonly post: PostValue | null
}>()("Sparedut/Join")
export const Leave = Descriptor.Event<{ readonly session: string }>()("Sparedut/Leave")
export const InputArrived = Descriptor.Event<{ readonly session: string; readonly input: PlayerInput }>()("Sparedut/InputArrived")
export const ChangeTeam = Descriptor.Event<{ readonly session: string; readonly team: Team }>()("Sparedut/ChangeTeam")
export const ChangePrimary = Descriptor.Event<{ readonly session: string; readonly primary: PrimaryId }>()("Sparedut/ChangePrimary")
/** The host starts (or restarts) the match. */
export const StartMatch = Descriptor.Event<{}>()("Sparedut/StartMatch")
/** From the host, only in a training: the client's report of an interface step (`shared/training/interface.ts`). */
export const ReportInterface = Descriptor.Event<{ readonly session: string; readonly action: InterfaceAction }>()("Sparedut/ReportInterface")
/** From the host, only in a training: the client says its active device has no control for this step (`shared/training/controls.ts`). */
export const StepUnavailable = Descriptor.Event<{ readonly session: string; readonly station: StationId; readonly step: StepId; readonly device: Device }>()("Sparedut/StepUnavailable")
/** From the host, only in a training: the trainee goes to a station (`station`, an index) or starts over. */
export const GoToStation = Descriptor.Event<{ readonly session: string; readonly to: { readonly _tag: "station"; readonly station: number } | { readonly _tag: "startOver" } }>()("Sparedut/GoToStation")

export interface DamageValue {
  readonly victim: string
  readonly attacker: string | null
  readonly amount: number
  readonly weapon: KillCause
  readonly head: boolean
  /** Knockback (explosions). */
  readonly push: { readonly x: number; readonly y: number; readonly z: number } | null
}
export const Damage = Descriptor.Event<DamageValue>()("Sparedut/Damage")

/** Healing (the Cassele dal Miedi and a nearby medic): applied by `ApplyDamage`, which owns health. */
export const Heal = Descriptor.Event<{ readonly target: string; readonly healer: string; readonly amount: number }>()("Sparedut/Heal")

/** A hit on a door (shots, mescul, explosions): applied by `BreakDoors`. */
export const DoorHit = Descriptor.Event<{ readonly door: number; readonly amount: number; readonly by: string }>()("Sparedut/DoorHit")

/** To the host and the clients. */
export const Out = Descriptor.Event<GameEvent>()("Sparedut/Out")

// --- Services ---------------------------------------------------------------

export const Physics = Descriptor.Service<PhysicsWorld>()("Sparedut/Physics")

// --- Game -------------------------------------------------------------------

export const Game = Schema.bind(
  Schema.fragment({
    components: { Player, TeamOf, Post, Motion, Controls, Life, Arsenal, Stats, Attackers, Projectile },
    requires: [Schema.requires(Player, TeamOf, Motion, Controls, Life, Arsenal, Stats, Attackers)],
    resources: { Rules, Objective, Tick, Score, Flags, Hill, Cart, StormCourse, Pickups, Turrets, Doors, Panels, History, Rng },
    events: { Join, Leave, InputArrived, ChangeTeam, ChangePrimary, StartMatch, ReportInterface, GoToStation, StepUnavailable, Damage, Heal, DoorHit, Out }
  }),
  Root
)

/**
 * The match: the Muster (nobody on the map, until the host starts), live (until tick `ends`),
 * over (the results, until tick `restarts`, then the Muster again).
 */
export const Match = Game.StateMachine("Sparedut/Match", {
  Muster: {},
  Live: z.object({ ends: z.number().int() }),
  /** The winner: a team, nobody, or (La Tampieste) the last one standing. */
  Over: z.object({
    winner: z.union([z.enum(["benandanti", "malandanti", "pari"]), z.object({ player: z.string(), name: z.string() })]),
    restarts: z.number().int()
  })
}, { transitions: { Muster: ["Live"], Live: ["Over", "Muster"], Over: ["Muster"] } })

/** Where an arrival puts the trainee: see `Training.Arriving`. */
export const ARRIVAL_PLACES = ["walked", "facingStart", "keepingLook"] as const
export type ArrivalPlace = (typeof ARRIVAL_PLACES)[number]

/**
 * The training's progress (`shared/training/`): which station, which step, how far the step has
 * got. A regular room is `Off` for good. Stations and steps are indices into `STATION_IDS` and
 * the station's `stepsOf`. `unlocked`: how many stations, from the first, the trainee may go to;
 * `completed`: the training was completed once (only with all of them unlocked), so every station
 * is completed, not only those before the last unlocked one.
 */
export const Training = Game.StateMachine(
  "Sparedut/Training",
  {
    Off: {},
    /**
     * On the way into a station: its setup is applied on the first tick the trainee is alive.
     * `place` (`ARRIVAL_PLACES`): left where they are (walked in), or put at the station's start,
     * facing along the street (a training's first arrival) or keeping their look (going to a
     * station: the client owns the look, and a turn it did not make would complete a look step).
     */
    Arriving: z.object({ station: z.number().int(), unlocked: z.number().int(), completed: z.boolean(), place: z.enum(ARRIVAL_PLACES) }),
    /**
     * At a station, on one of its steps: `count`, how many times its action happened; `mark`, the one
     * number the step keeps (`StepProgress`), whose meaning is the step's own: the yaw it began at
     * (station 1's look), an x (where the sprint began), a tick (the last report, the storm's start),
     * a score (when a scoring step began), an index (the primary held when the armoury opened) or
     * 1 or 0 (whether the trainee was already inside, for a step that asks to go in).
     */
    Step: z.object({ station: z.number().int(), step: z.number().int(), count: z.number().int(), mark: z.number(), unlocked: z.number().int(), completed: z.boolean() }),
    /** Every station done: all of them unlocked. */
    Complete: {}
  },
  { transitions: { Off: [], Arriving: ["Step", "Complete"], Step: ["Complete", "Arriving"], Complete: ["Arriving"] } }
)
