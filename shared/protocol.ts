/**
 * Messages between client and server (JSON over WebSocket).
 * Client messages are validated with zod: the server doesn't trust them.
 */
import { z } from "zod"
import { BOT_LEVEL_IDS, MODE_IDS, type BotLevel, type ModeId } from "./folklore.ts"
import { PlayerInputSchema, type PlayerInput } from "./input.ts"
import type { MapId, Team } from "./map.ts"
import { MAP_IDS } from "./maps/index.ts"
import type { Body } from "./movement.ts"
import type { GameEvent } from "./sim/events.ts"
import type { ArsenalValue, FlagState, HillValue, TurretState } from "./sim/schema.ts"
import type { StormValue } from "./sim/rules.ts"
import type { CartView, PhaseView } from "./sim/view.ts"
import { PRIMARIES, type PrimaryId, type ProjectileKind, type WeaponId } from "./weapons.ts"

export const PROTOCOL_VERSION = 9
export const MAX_PLAYERS = 16
export const SNAPSHOT_EVERY = 2 // ticks: 30 snapshots per second

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

export const ClientMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), name, version: z.number() }),
  z.object({ t: z.literal("list") }),
  z.object({
    t: z.literal("create"),
    mode: z.enum(MODE_IDS as [ModeId, ...ModeId[]]),
    map: z.enum(MAP_IDS as [MapId, ...MapId[]]),
    minutes: z.number().int().min(2).max(30),
    visibility: z.enum(["lan", "code"]),
    bots: z.number().int().min(0).max(7),
    level: z.enum(BOT_LEVEL_IDS as [BotLevel, ...BotLevel[]]),
    ff: z.boolean(),
    primary: z.enum(PRIMARIES)
  }),
  z.object({ t: z.literal("join"), code: z.string().trim().toUpperCase().length(4), primary: z.enum(PRIMARIES) }),
  z.object({ t: z.literal("leave") }),
  z.object({ t: z.literal("input"), i: PlayerInputSchema }),
  z.object({ t: z.literal("team"), team }),
  z.object({ t: z.literal("primary"), p: z.enum(PRIMARIES) }),
  z.object({ t: z.literal("chat"), text: visible(120) }),
  z.object({ t: z.literal("start") }),
  z.object({ t: z.literal("bot"), team, delta: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({ t: z.literal("level"), level: z.enum(BOT_LEVEL_IDS as [BotLevel, ...BotLevel[]]) }),
  z.object({ t: z.literal("ping"), c: z.number(), rtt: z.number().min(0).max(10000).optional() })
])
export type ClientMessage = z.infer<typeof ClientMessage>

export type Visibility = "lan" | "code"

export interface RosterEntry {
  readonly id: string
  readonly name: string
  readonly team: Team
  readonly bot: boolean
  readonly away: boolean
}

export interface RoomSummary {
  readonly code: string
  readonly host: string
  readonly mode: ModeId
  readonly map: MapId
  readonly visibility: Visibility
  readonly players: number
  readonly bots: number
  readonly max: number
  readonly phase: PhaseView["tag"]
}

export interface RoomInfo extends RoomSummary {
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
export type ErrorCode = "invalid" | "version" | "notFound" | "lanOnly" | "full" | "busy"

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
