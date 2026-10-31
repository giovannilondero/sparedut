/**
 * The shape of a game map, as data. Each map (`shared/maps/`) is the single
 * source for collisions (Rapier, server and client), rendering (Three.js), spawns,
 * objectives, the cart's path and the bots' navigation graph.
 *
 * Axes: x east, y up, z south. Metres.
 */
import { Ops } from "@typeonce/ritmo"
import { TURRET } from "./weapons.ts"

export type V3 = readonly [number, number, number]

export type Team = "benandanti" | "malandanti"
export const TEAMS = ["benandanti", "malandanti"] as const satisfies readonly Team[]

export type MapId = "glemone" | "osoppo" | "trincee" | "venzone" | "predil" | "maran"

export type Mat =
  | "pietra" // grey stone of the Duomo
  | "pietraChiara"
  | "intonacoOcra"
  | "intonacoRosa"
  | "intonacoBianco"
  | "intonacoGiallo"
  | "porfido" // cobblestones
  | "legno"
  | "fen" // hay
  | "coppi"
  | "erba"
  | "marmo"
  | "ferro"
  | "terra" // packed earth: trenches, paths, tunnels
  | "roccia" // bare rock of the mountains and the mine
  | "sacs" // sandbags
  | "invisibile"

/** An axis-aligned box: it collides and is drawn. */
export interface Block {
  readonly min: V3
  readonly max: V3
  readonly mat: Mat
  /** How the client draws it: a "muro" has windows, a "pilastro" doesn't, ... */
  readonly look?: "muro" | "pilastro" | "terreno" | "copertura" | "cassa" | "fontana" | "bancarele" | "parapetto"
}

/** A ramp: a plane sloping along z, solid underneath (no gaps). */
export interface Wedge {
  readonly x0: number
  readonly x1: number
  readonly z0: number
  readonly z1: number
  /** Surface height at z0 and at z1. */
  readonly y0: number
  readonly y1: number
  readonly mat: Mat
}

export interface Portico {
  /** The side open onto the street. */
  readonly side: "east" | "west" | "north" | "south"
  readonly depth: number
  readonly height: number
  readonly spacing: number
}

export interface Building {
  readonly name: string
  readonly min: V3
  readonly max: V3
  readonly mat: Mat
  readonly roof: "falde" | "piano"
  readonly portico?: Portico
}

export interface JumpPad {
  readonly name: string
  readonly at: V3
  readonly radius: number
  /** Velocity imparted (m/s). */
  readonly launch: V3
}

export type PickupKind = "frico" | "gubane" | "sgnape" | "munizions" | "lanciafrico"

export interface PickupSpot {
  readonly kind: PickupKind
  readonly at: V3
}

/** A turret with the mitraie: `at` is the foot of the gun, `yaw` where it faces at rest. */
export interface TurretSpot {
  readonly at: V3
  readonly yaw: number
}

/** A breakable door: it collides while it has health, then it's gone. */
export interface DoorDef {
  readonly name: string
  readonly min: V3
  readonly max: V3
  readonly hp: number
}

export interface Spawn {
  readonly at: V3
  readonly yaw: number
}

export interface Bounds {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

export interface MapDef {
  readonly id: MapId
  readonly bounds: Bounds
  /** Everything that collides as a box: ground, walls, cover, decomposed buildings, world edges. */
  readonly blocks: readonly Block[]
  readonly wedges: readonly Wedge[]
  /** Whole buildings (the client draws them with windows and roofs; their blocks are already in `blocks`). */
  readonly buildings: readonly Building[]
  readonly jumpPads: readonly JumpPad[]
  readonly spawns: Readonly<Record<Team, readonly Spawn[]>>
  /** Where each team's frico sits (Cjape il Frico). */
  readonly flagBases: Readonly<Record<Team, V3>>
  /** The zone to hold (Re de Culine). */
  readonly hill: { readonly at: V3; readonly radius: number }
  readonly pickups: readonly PickupSpot[]
  /** Waypoints for the bots; `server/nav.ts` computes the edges with the physics. */
  readonly navPoints: readonly V3[]
  /**
   * The cart's path (Spingi il Cjar): a polyline on the floor, from the first point
   * (near the base of the Benandanti, who push) to the last (where it arrives).
   */
  readonly track: readonly V3[]
  /** Below this height you've fallen out of the world. */
  readonly killY: number
  /** Shallow water to wade: with your feet below `level` you move at `speed` of normal speed. */
  readonly wade?: { readonly level: number; readonly speed: number }
  /** The turrets with the mitraie. */
  readonly turrets: readonly TurretSpot[]
  /** The doors to break down (not in `blocks`: the physics removes them when they give way). */
  readonly doors: readonly DoorDef[]
}

/** Breaks a building (porticoes included) down into the blocks that collide. */
export function buildingBlocks(b: Building): Block[] {
  const out: Block[] = []
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const p = b.portico
  if (!p) return [{ min: b.min, max: b.max, mat: b.mat, look: "muro" }]
  const top = y0 + p.height
  out.push({ min: [x0, top, z0], max: [x1, y1, z1], mat: b.mat, look: "muro" })
  const col = 0.8
  if (p.side === "east" || p.side === "west") {
    const open0 = p.side === "east" ? x1 - p.depth : x0
    const open1 = p.side === "east" ? x1 : x0 + p.depth
    out.push(p.side === "east"
      ? { min: [x0, y0, z0], max: [open0, top, z1], mat: b.mat, look: "muro" }
      : { min: [open1, y0, z0], max: [x1, top, z1], mat: b.mat, look: "muro" })
    const cx = p.side === "east" ? x1 - col : x0
    const count = Math.max(2, Math.round((z1 - z0) / p.spacing) + 1)
    for (let i = 0; i < count; i++) {
      const z = z0 + ((z1 - z0 - col) * i) / (count - 1)
      out.push({ min: [cx, y0, z], max: [cx + col, top, z + col], mat: "pietraChiara", look: "pilastro" })
    }
  } else {
    const open0 = p.side === "south" ? z1 - p.depth : z0
    const open1 = p.side === "south" ? z1 : z0 + p.depth
    out.push(p.side === "south"
      ? { min: [x0, y0, z0], max: [x1, top, open0], mat: b.mat, look: "muro" }
      : { min: [x0, y0, open1], max: [x1, top, z1], mat: b.mat, look: "muro" })
    const cz = p.side === "south" ? z1 - col : z0
    const count = Math.max(2, Math.round((x1 - x0) / p.spacing) + 1)
    for (let i = 0; i < count; i++) {
      const x = x0 + ((x1 - x0 - col) * i) / (count - 1)
      out.push({ min: [x, y0, cz], max: [x + col, top, cz + col], mat: "pietraChiara", look: "pilastro" })
    }
  }
  return out
}

export interface MapInput extends Omit<MapDef, "blocks"> {
  /** Ground, walls and cover; `defineMap` adds buildings and world edges. */
  readonly blocks: readonly Block[]
  /** Bottom and top of the invisible edge walls. */
  readonly walls: { readonly bottom: number; readonly top: number }
}

/** Completes a map: building blocks and invisible walls around the `bounds`. */
export function defineMap(input: MapInput): MapDef {
  const { walls, blocks, ...rest } = input
  const { minX, maxX, minZ, maxZ } = input.bounds
  const { bottom, top } = walls
  const edge: Block[] = [
    { min: [minX - 1, bottom, minZ], max: [minX, top, maxZ], mat: "invisibile" },
    { min: [maxX, bottom, minZ], max: [maxX + 1, top, maxZ], mat: "invisibile" },
    { min: [minX, bottom, minZ - 1], max: [maxX, top, minZ], mat: "invisibile" },
    { min: [minX, bottom, maxZ], max: [maxX, top, maxZ + 1], mat: "invisibile" },
    { min: [minX, top, minZ], max: [maxX, top + 1, maxZ], mat: "invisibile" }
  ]
  return { ...rest, blocks: [...blocks, ...edge, ...input.buildings.flatMap(buildingBlocks)] }
}

/** Where a turret's user stands: behind the gun, on the same level. */
export function turretSeat(t: TurretSpot): V3 {
  return [t.at[0] + Ops.sin(t.yaw) * TURRET.seat, t.at[1], t.at[2] + Ops.cos(t.yaw) * TURRET.seat]
}

/** The turret user's aim, clamped to the arc the gun turns through. */
export function turretAim(t: TurretSpot, yaw: number, pitch: number): { readonly yaw: number; readonly pitch: number } {
  let d = yaw - t.yaw
  d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI
  return { yaw: t.yaw + Math.max(-TURRET.arc, Math.min(TURRET.arc, d)), pitch: Math.max(-TURRET.pitchDown, Math.min(TURRET.pitchUp, pitch)) }
}

const dist3 = (a: V3, b: V3) => Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2)

/** Length of a polyline (horizontal and vertical). */
export function trackLength(track: readonly V3[]): number {
  let n = 0
  for (let i = 1; i < track.length; i++) n += dist3(track[i - 1], track[i])
  return n
}

/** The point at distance `d` along the polyline, and the heading (yaw) of that segment. */
export function trackPoint(track: readonly V3[], d: number): { readonly at: V3; readonly yaw: number } {
  let left = Math.max(0, d)
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]
    const b = track[i]
    const len = dist3(a, b)
    const yaw = Ops.atan2(-(b[0] - a[0]), -(b[2] - a[2]))
    if (left <= len || i === track.length - 1) {
      const k = len > 0 ? Math.min(1, left / len) : 0
      return { at: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], yaw }
    }
    left -= len
  }
  return { at: track[0], yaw: 0 }
}
