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
import type { MapId, Team } from "../map.ts"
import type { Body } from "../movement.ts"
import type { PhysicsWorld } from "../physics.ts"
import type { ModeId } from "../folklore.ts"
import type { PrimaryId, ProjectileKind, WeaponId } from "../weapons.ts"
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

export interface ArsenalValue {
  readonly current: WeaponId
  readonly primary: PrimaryId
  /** The primary weapon chosen for the next respawn. */
  readonly nextPrimary: PrimaryId
  readonly launcher: boolean
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
}
export const Rules = Descriptor.Resource<RulesValue>()("Sparedut/Rules")
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

export type PickupState = { readonly _tag: "up" } | { readonly _tag: "down"; readonly ticks: number }
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

/** From the host: a player arrives (human or bot). */
export const Join = Descriptor.Event<{ readonly session: string; readonly name: string; readonly team: Team; readonly bot: boolean; readonly primary: PrimaryId }>()("Sparedut/Join")
export const Leave = Descriptor.Event<{ readonly session: string }>()("Sparedut/Leave")
export const InputArrived = Descriptor.Event<{ readonly session: string; readonly input: PlayerInput }>()("Sparedut/InputArrived")
export const ChangeTeam = Descriptor.Event<{ readonly session: string; readonly team: Team }>()("Sparedut/ChangeTeam")
export const ChangePrimary = Descriptor.Event<{ readonly session: string; readonly primary: PrimaryId }>()("Sparedut/ChangePrimary")
/** The host starts (or restarts) the match. */
export const StartMatch = Descriptor.Event<{}>()("Sparedut/StartMatch")

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
    components: { Player, TeamOf, Motion, Controls, Life, Arsenal, Stats, Attackers, Projectile },
    requires: [Schema.requires(Player, TeamOf, Motion, Controls, Life, Arsenal, Stats, Attackers)],
    resources: { Rules, Tick, Score, Flags, Hill, Cart, Pickups, Turrets, Doors, History, Rng },
    events: { Join, Leave, InputArrived, ChangeTeam, ChangePrimary, StartMatch, Damage, Heal, DoorHit, Out }
  }),
  Root
)

/** The match: warmup, live (until tick `ends`), over. */
export const Match = Game.StateMachine("Sparedut/Match", {
  Warmup: {},
  Live: z.object({ ends: z.number().int() }),
  /** The winner: a team, nobody, or (La Tampieste) the last one standing. */
  Over: z.object({
    winner: z.union([z.enum(["benandanti", "malandanti", "pari"]), z.object({ player: z.string(), name: z.string() })]),
    restarts: z.number().int()
  })
})
