/**
 * Lo schema della simulazione: componenti, risorse, eventi, servizi, macchina della partita.
 *
 * La simulazione gira autoritativa sul server, una per stanza. Riceve intenti
 * (ingressi, entrate, uscite) come eventi dall'host e pubblica eventi di gioco
 * che l'host gira ai client. Fisica: il servizio `Physics` (Rapier).
 */
import { Descriptor, Random, Schema } from "@typeonce/ritmo"
import { z } from "zod"
import type { PlayerInput } from "../input.ts"
import type { MapId, Team } from "../map.ts"
import type { Body } from "../movement.ts"
import type { PhysicsWorld } from "../physics.ts"
import type { ModeId } from "../folklore.ts"
import type { PrimaryId, WeaponId } from "../weapons.ts"
import type { GameEvent } from "./events.ts"

export const Root = Schema.defineRoot("Sparedut")

// --- Componenti -------------------------------------------------------------

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
  /** L'ultimo comando applicato: sguardo, pulsanti tenuti, arma, numero confermato. */
  readonly input: PlayerInput
  /** Pulsanti alla fine del tick precedente, per riconoscere le pressioni. */
  readonly previous: number
  /** Tutti i pulsanti comparsi nei comandi di questo tick (una pressione breve non si perde). */
  readonly pressed: number
  /**
   * I comandi arrivati in questo tick, in ordine: ognuno è un passo di movimento,
   * esattamente come li ha già applicati la predizione del client.
   */
  readonly steps: ReadonlyArray<PlayerInput>
  /**
   * L'arma chiesta in questo tick, solo se il comando l'ha cambiata rispetto al
   * precedente. Il server cambia arma sui cambi, non sul valore: così una raccolta o
   * un'armeria che cambiano arma da sé non vengono annullate dai comandi già in viaggio.
   */
  readonly switchTo: WeaponId | null
  /** Tick di fila senza comandi (rete in ritardo o scheda in pausa). */
  readonly starved: number
}
export const Controls = Descriptor.Component<ControlsValue>()("Sparedut/Controls")

/** Vivo o morto: i campi di ognuno esistono solo nel suo stato. */
export const Life = Descriptor.EntityState(
  "Sparedut/Life",
  {
    Alive: z.object({
      hp: z.number(),
      armor: z.number(),
      /** Tick di protezione dopo la rinascita. */
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
  /** L'arma principale scelta per la prossima rinascita. */
  readonly nextPrimary: PrimaryId
  readonly launcher: boolean
  readonly ammo: Readonly<Record<WeaponId, Ammo>>
  readonly action: WeaponAction
  readonly bombs: number
  readonly bombCooldown: number
  /** Tick rimasti di sgnape in corpo (corri più forte). */
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

/** Chi ha fatto danno di recente (per gli assist). */
export const Attackers = Descriptor.Component<ReadonlyArray<{ readonly session: string; readonly tick: number }>>()("Sparedut/Attackers")

export interface ProjectileValue {
  readonly kind: "frico" | "sgnape"
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

// --- Risorse ----------------------------------------------------------------

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

export type PickupState = { readonly _tag: "up" } | { readonly _tag: "down"; readonly ticks: number }
/** Uno per ogni punto di `PICKUPS`, nello stesso ordine. */
export const Pickups = Descriptor.Resource<ReadonlyArray<PickupState>>()("Sparedut/Pickups")

export interface PoseRecord {
  readonly session: string
  readonly x: number
  readonly y: number
  readonly z: number
  readonly crouch: boolean
}
/** Le pose degli ultimi tick, per colpire dove il tiratore vedeva il bersaglio. */
export const History = Descriptor.TransientResource<ReadonlyArray<{ readonly tick: number; readonly poses: ReadonlyArray<PoseRecord> }>>()("Sparedut/History")

export const Rng = Descriptor.ConstructedResource(Random.codec)("Sparedut/Rng")

// --- Eventi -----------------------------------------------------------------

/** Dall'host: arriva un giocatore (persona o bot). */
export const Join = Descriptor.Event<{ readonly session: string; readonly name: string; readonly team: Team; readonly bot: boolean; readonly primary: PrimaryId }>()("Sparedut/Join")
export const Leave = Descriptor.Event<{ readonly session: string }>()("Sparedut/Leave")
export const InputArrived = Descriptor.Event<{ readonly session: string; readonly input: PlayerInput }>()("Sparedut/InputArrived")
export const ChangeTeam = Descriptor.Event<{ readonly session: string; readonly team: Team }>()("Sparedut/ChangeTeam")
export const ChangePrimary = Descriptor.Event<{ readonly session: string; readonly primary: PrimaryId }>()("Sparedut/ChangePrimary")
/** L'host fa partire (o ripartire) la partita. */
export const StartMatch = Descriptor.Event<{}>()("Sparedut/StartMatch")

export interface DamageValue {
  readonly victim: string
  readonly attacker: string | null
  readonly amount: number
  readonly weapon: WeaponId | "sgnape" | "fall"
  readonly head: boolean
  /** Spinta (esplosioni). */
  readonly push: { readonly x: number; readonly y: number; readonly z: number } | null
}
export const Damage = Descriptor.Event<DamageValue>()("Sparedut/Damage")

/** Verso l'host e i client. */
export const Out = Descriptor.Event<GameEvent>()("Sparedut/Out")

// --- Servizi ----------------------------------------------------------------

export const Physics = Descriptor.Service<PhysicsWorld>()("Sparedut/Physics")

// --- Gioco ------------------------------------------------------------------

export const Game = Schema.bind(
  Schema.fragment({
    components: { Player, TeamOf, Motion, Controls, Life, Arsenal, Stats, Attackers, Projectile },
    requires: [Schema.requires(Player, TeamOf, Motion, Controls, Life, Arsenal, Stats, Attackers)],
    resources: { Rules, Tick, Score, Flags, Hill, Pickups, History, Rng },
    events: { Join, Leave, InputArrived, ChangeTeam, ChangePrimary, StartMatch, Damage, Out }
  }),
  Root
)

/** La partita: riscaldamento, in corso (fino al tick `ends`), finita. */
export const Match = Game.StateMachine("Sparedut/Match", {
  Warmup: {},
  Live: z.object({ ends: z.number().int() }),
  Over: z.object({ winner: z.enum(["benandanti", "malandanti", "pari"]), restarts: z.number().int() })
})
