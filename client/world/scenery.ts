/**
 * The contract between the visible world (`client/world.ts`) and each map's scenery.
 *
 * `world.ts` draws by itself everything in the map data: terrain, ramps,
 * buildings (windows, doors, roofs, arcades), blocks by material and `look`, fountains,
 * market stalls, cjars of fen (hay carts) on the jump pads. The scenery adds the map's
 * monuments and decorations (graphics only: nothing you can touch), the backdrop beyond
 * the edges and the menu camera's tour.
 */
import type * as THREE from "three"
import type { MapDef } from "../../shared/map.ts"
import type { Quality } from "../contracts.ts"
import type { Sky } from "./backdrop.ts"
import type { Batch, Inst, V } from "./geo.ts"
import type { Atlas, WorldTextures } from "./tex.ts"

/** The world's materials: every geometry added to the `Batch` picks one. */
export type K =
  | "pietra"
  | "pietraChiara"
  | "intonaco"
  | "porfido"
  | "legno"
  | "cassa"
  | "fen"
  | "coppi"
  | "erba"
  | "marmo"
  | "ferro"
  | "pavimento"
  | "stoffa"
  | "vetro"
  | "luce"
  | "acqua"
  | "terra"
  | "roccia"
  | "sacs"
  | "atlas"

/** The instanced repeats: windows, frames, shutters, doors, flower pots, capitals, bases, chimneys. */
export interface Instances {
  readonly vetro: Inst
  readonly cornice: Inst
  readonly scuri: Inst
  readonly porta: Inst
  readonly vaso: Inst
  readonly capitello: Inst
  readonly base: Inst
  readonly comignolo: Inst
}

export interface SceneryKit {
  readonly map: MapDef
  /** Static geometry merged by material (world-space UVs, per-vertex colour). */
  readonly B: Batch<K>
  readonly I: Instances
  /** The map's group: lights and animated objects go here (discarded on map change). */
  readonly root: THREE.Group
  readonly MATS: Readonly<Record<K, THREE.Material>>
  readonly tex: WorldTextures
  readonly atlas: Atlas
  /** Deterministic randomness. */
  readonly R: () => number
  readonly C: (hex: string) => THREE.Color
  /** Ground height (`terreno` blocks and ramps) at a point. */
  readonly groundAt: (x: number, z: number) => number
  /** One face of a box as a quad (outward normal). */
  readonly face: (min: V, max: V, side: "top" | "bottom" | "east" | "west" | "south" | "north") => THREE.BufferGeometry
  /** Rotates the geometry so its normal faces `dir`. */
  readonly orient: (g: THREE.BufferGeometry, dir: V) => THREE.BufferGeometry
  /** Cylinder between two points. */
  readonly cylBetween: (a: V, b: V, r0: number, r1?: number, seg?: number) => THREE.BufferGeometry
  readonly sphere: (c: V, r: number, sy?: number, seg?: number) => THREE.BufferGeometry
  /** Pitched roof over the rectangle, ridge along the long side. */
  readonly roof: (x0: number, z0: number, x1: number, z1: number, yTop: number, gable: THREE.Color, rise?: number, gableKey?: K) => { ridge: number; alongZ: boolean; rise: number }
  /** Window (glass, frame, shutters if `shutter`) on the face with normal `n`, centred at `p`. */
  readonly win: (n: V, p: V, w: number, h: number, shutter: THREE.Color | null, vase: boolean) => void
  /** Door with its base at `p`. */
  readonly door: (n: V, p: V, w: number, h: number, tint: THREE.Color) => void
}

/** What the scenery animates after construction. */
export interface SceneryLive {
  update?(t: number): void
  setQuality?(q: Quality): void
}

export interface Scenery {
  /** The map's monuments and decorations, inside the `bounds`. */
  build(kit: SceneryKit): SceneryLive | void
  /** The unreachable backdrop beyond the edges (mountains, hills, trees). */
  backdrop(kit: SceneryKit): THREE.Object3D[]
  /** The menu camera's slow tour: points (closed into a loop) and where it looks. */
  readonly menu: { readonly path: readonly V[]; readonly look: readonly V[] }
  /** Light and haze: direction of the sun or moon (towards the body), fog, day or night. */
  readonly light?: { readonly sun?: V; readonly fog?: number; readonly sky?: Sky }
}
