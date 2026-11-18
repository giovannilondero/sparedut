/**
 * Messages between client and server (JSON over WebSocket).
 * Client messages are validated with zod: the server doesn't trust them.
 */
import { z } from "zod"
import { BOT_LEVEL_IDS, ROOM_MODE_IDS, type BotLevel, type ModeId, type ObjectiveId, type RoomModeId } from "./folklore.ts"
import { PlayerInputSchema, type PlayerInput } from "./input.ts"
import type { MapId, Team } from "./map.ts"
import { ROOM_MAP_IDS, type RoomMapId } from "./maps/index.ts"
import type { Body } from "./movement.ts"
import type { GameEvent } from "./sim/events.ts"
import type { ArsenalValue, FlagState, HillValue, TurretState } from "./sim/schema.ts"
import type { StormValue } from "./sim/rules.ts"
import type { CartView, PhaseView, TrainingView } from "./sim/view.ts"
import { PRIMARIES, type PrimaryId, type ProjectileKind, type WeaponId } from "./weapons.ts"
import { INTERFACE_ACTIONS } from "./training/interface.ts"
import { isStepId, isStepOf, STATION_IDS, type StepId } from "./training/index.ts"
import { DEVICES } from "./devices.ts"

export const PROTOCOL_VERSION = 15
export const MAX_PLAYERS = 16
export const SNAPSHOT_EVERY = 2 // ticks: 30 snapshots per second
/** The longest round trip a client reports, in milliseconds. */
export const RTT_MAX = 10_000

const team = z.enum(["benandanti", "malandanti"])
/** Control and text-direction characters (U+202E flips a name): stripped from names and chat. */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g
const visible = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((s) => s.replace(INVISIBLE, ""))
    .pipe(z.string().trim().min(1).max(max))
const name = visible(20)

/**
 * Who can see and join a room. A room on the server is LAN (players on the host's network) or Online (anyone).
 * An Offline room is hosted in the player's own browser, against bots: no code, no list.
 */
export const REACHES = ["offline", "lan", "online"] as const
export type Reach = (typeof REACHES)[number]
/** The reaches the game server creates rooms with. */
export const SERVER_REACHES = ["lan", "online"] as const satisfies readonly Reach[]
/** A reach a room on the game server has: one with an access. */
export type ServerReach = (typeof SERVER_REACHES)[number]
/** The reaches the host in the player's browser creates rooms with. */
export const BROWSER_REACHES = ["offline"] as const satisfies readonly Reach[]

/** Whether a room lets anyone within its reach in, or asks for a password. */
export const ACCESSES = ["open", "password"] as const
export type Access = (typeof ACCESSES)[number]
/** A password is cleaned like a name. It stays with the host: never sent back, never logged. */
export const PASSWORD_MAX = 32
export const Password = visible(PASSWORD_MAX)
/** A room's access as the host chose it, password included: it travels only in `create`. */
export const RoomAccess = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("open") }),
  z.object({ kind: z.literal("password"), password: Password })
])
export type RoomAccess = z.infer<typeof RoomAccess>

/**
 * A room's reach and, for a reach that has one, its access: an Offline room has nobody to keep
 * out, a LAN or Online room always says who may come in. `A` is the access as written where it is
 * kept: the host's choice with its password (`RoomAccess`), or what a room list shows (`Access`).
 */
export type Reached<A> = { readonly reach: "offline" } | { readonly reach: ServerReach; readonly access: A }

/** The most bots a room can be created with, per team. */
export const MAX_BOTS = 7

/** A room's code as a player types it to join: four characters, cleaned of spaces and case. */
export const RoomCode = z.string().trim().toUpperCase().length(4)

/** What every `create` carries, whatever its reach. */
const createRoom = {
  t: z.literal("create"),
  mode: z.enum(ROOM_MODE_IDS as [RoomModeId, ...RoomModeId[]]),
  map: z.enum(ROOM_MAP_IDS as [RoomMapId, ...RoomMapId[]]),
  minutes: z.number().int().min(2).max(30),
  bots: z.number().int().min(0).max(MAX_BOTS),
  level: z.enum(BOT_LEVEL_IDS as [BotLevel, ...BotLevel[]]),
  ff: z.boolean(),
  primary: z.enum(PRIMARIES)
}

export const ClientMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), name, version: z.number() }),
  z.object({ t: z.literal("list") }),
  z.discriminatedUnion("reach", [
    z.object({ ...createRoom, reach: z.literal("offline") }).strict(),
    z.object({ ...createRoom, reach: z.enum(SERVER_REACHES), access: RoomAccess })
  ]),
  /**
   * The training: an Offline room of its own kind, one player, on the fair in the Dutrine mode.
   * Only the in-browser host makes one; it has no code, no list entry and no host tools.
   */
  z
    .object({
      t: z.literal("training"),
      primary: z.enum(PRIMARIES),
      /** The browser's saved progress (`shared/training/start.ts`); absent, a first training. */
      unlocked: z.number().int().min(1).max(STATION_IDS.length).optional(),
      from: z.enum(STATION_IDS).optional(),
      /** The training was completed once (`TrainingStart.completed`); absent, not. */
      completed: z.boolean().optional()
    })
    .strict(),
  z.object({
    t: z.literal("join"),
    code: RoomCode,
    /** Only for a password room; an open room ignores it. */
    password: Password.optional(),
    primary: z.enum(PRIMARIES)
  }),
  z.object({ t: z.literal("leave") }),
  z.object({ t: z.literal("input"), i: PlayerInputSchema }),
  z.object({ t: z.literal("team"), team }),
  z.object({ t: z.literal("primary"), p: z.enum(PRIMARIES) }),
  z.object({ t: z.literal("chat"), text: visible(120) }),
  z.object({ t: z.literal("start") }),
  z.object({ t: z.literal("bot"), team, delta: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({ t: z.literal("level"), level: z.enum(BOT_LEVEL_IDS as [BotLevel, ...BotLevel[]]) }),
  z.object({ t: z.literal("ping"), c: z.number(), rtt: z.number().min(0).max(RTT_MAX).optional() }),
  /** The match menu opened or closed, the tab hidden or shown. Only an Offline room pauses; the server ignores it. */
  z.object({ t: z.literal("pause"), paused: z.boolean() }),
  /** How the player did something the simulation cannot see (`shared/training/interface.ts`). Only a training accepts it. */
  z.object({ t: z.literal("report"), a: z.enum(INTERFACE_ACTIONS) }),
  /** The player's active device has no control for this step of the training (`shared/training/controls.ts`). Only a training accepts it. */
  z
    .object({ t: z.literal("unavailable"), station: z.enum(STATION_IDS), step: z.custom<StepId>(isStepId), device: z.enum(DEVICES) })
    .refine((m) => isStepOf(m.station, m.step)),
  /** Only in a training: to an unlocked station's start, its setup applied (the current one: restart it). */
  z.object({ t: z.literal("goTo"), station: z.enum(STATION_IDS) }),
  /** Only in a training: back to station 1, with only it unlocked. */
  z.object({ t: z.literal("startOver") })
])
export type ClientMessage = z.infer<typeof ClientMessage>

export interface RosterEntry {
  readonly id: string
  readonly name: string
  readonly team: Team
  /** The primary the member enters the next match with (the one in hand in a live match). */
  readonly primary: PrimaryId
  readonly bot: boolean
  readonly away: boolean
}

/** A room in the room list. Its access says whether it asks for a password, never the password itself. */
export type RoomSummary = Reached<Access> & {
  readonly code: string
  readonly host: string
  readonly mode: ModeId
  readonly map: MapId
  /** Humans in the room; bots give their seat up to a human who joins. */
  readonly players: number
  readonly bots: number
  readonly max: number
  readonly phase: PhaseView["tag"]
}

export type RoomInfo = RoomSummary & {
  readonly hostId: string
  readonly minutes: number
  readonly level: BotLevel
  readonly ff: boolean
  readonly roster: readonly RosterEntry[]
}

/** Another player, compact. */
export interface SnapOther {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly z: number
  readonly yaw: number
  readonly pitch: number
  readonly vx: number
  readonly vy: number
  readonly vz: number
  /** Bits: 1 alive, 2 crouched, 4 grounded, 8 shielded, 16 firing, 32 aiming, 64 carrying the frico, 128 sgnape. */
  readonly f: number
  readonly w: WeaponId
  readonly hp: number
}

export const FLAG_BIT = { alive: 1, crouch: 2, grounded: 4, shield: 8, firing: 16, aiming: 32, carrier: 64, sgnape: 128 } as const

export interface SnapSelf {
  readonly body: Body
  readonly seq: number
  readonly hp: number
  readonly armor: number
  readonly shield: number
  readonly respawn: number
  readonly killer: string | null
  readonly arsenal: ArsenalValue
  readonly alive: boolean
}

export interface Snapshot {
  readonly t: "snap"
  readonly tick: number
  readonly phase: PhaseView
  /** The objective in force: the HUD and the world's markers show its state, and no other's. */
  readonly objective: ObjectiveId
  readonly score: Readonly<Record<Team, number>>
  readonly flags: Readonly<Record<Team, FlagState>>
  readonly hill: HillValue
  /** "1" available, "0" pending, in `PICKUPS` order. */
  readonly pickups: string
  readonly proj: readonly (readonly [kind: ProjectileKind, x: number, y: number, z: number])[]
  /** Only in Spingi il Cjar. */
  readonly cart: CartView | null
  /** Only during a running Tampieste. */
  readonly storm: StormValue | null
  /** The map's turrets, in `map.turrets` order. */
  readonly turrets: ReadonlyArray<TurretState>
  /** Health of the breakable doors, in `map.doors` order (0 = broken down). */
  readonly doors: readonly number[]
  readonly players: readonly SnapOther[]
  readonly you: SnapSelf | null
  /** Only in a training: where the trainee is in it. */
  readonly training: TrainingView | null
  readonly ev: readonly GameEvent[]
}

export interface BoardRow {
  readonly id: string
  readonly name: string
  readonly team: Team
  readonly bot: boolean
  readonly kills: number
  readonly deaths: number
  readonly assists: number
  readonly caps: number
  readonly score: number
  readonly best: number
  readonly headshots: number
  readonly damage: number
  readonly ping: number
}

/** Errors for the client: it picks the text, in its own language. */
export type ErrorCode =
  | "invalid"
  | "version"
  | "notFound"
  | "lanOnly"
  | "full"
  | "busy"
  | "passwordRequired"
  | "wrongPassword"
  /** Too many wrong passwords from this connection: it waits a while before trying again. */
  | "tooManyAttempts"

export type ServerMessage =
  /** `publicUrl`: the game's public address (tunnel or PUBLIC_URL), if the server knows it. */
  | { readonly t: "welcome"; readonly id: string; readonly version: number; readonly publicUrl: string | null }
  /** The server discovered (or changed) the public address. */
  | { readonly t: "public"; readonly url: string }
  | { readonly t: "rooms"; readonly rooms: readonly RoomSummary[] }
  | { readonly t: "joined"; readonly room: RoomInfo; readonly you: string; readonly tick: number }
  | { readonly t: "room"; readonly room: RoomInfo }
  | { readonly t: "left" }
  | Snapshot
  | { readonly t: "board"; readonly rows: readonly BoardRow[] }
  | { readonly t: "chat"; readonly from: string; readonly name: string; readonly team: Team | null; readonly text: string }
  | { readonly t: "error"; readonly code: ErrorCode }
  | { readonly t: "pong"; readonly c: number; readonly tick: number }

export type { PlayerInput, PrimaryId }
