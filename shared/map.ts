/**
 * La forma di una mappa di gioco, come dati. Ogni mappa (`shared/maps/`) è una sola
 * fonte per collisioni (Rapier, server e client), rendering (Three.js), spawn,
 * obiettivi, percorso del carrello e grafo di navigazione dei bot.
 *
 * Assi: x verso est, y in alto, z verso sud. Metri.
 */
import { Ops } from "@typeonce/ritmo"

export type V3 = readonly [number, number, number]

export type Team = "benandanti" | "malandanti"
export const TEAMS = ["benandanti", "malandanti"] as const satisfies readonly Team[]

export type MapId = "glemone" | "osoppo" | "trincee" | "venzone" | "predil"

export type Mat =
  | "pietra" // pietra grigia del Duomo
  | "pietraChiara"
  | "intonacoOcra"
  | "intonacoRosa"
  | "intonacoBianco"
  | "intonacoGiallo"
  | "porfido" // selciato
  | "legno"
  | "fen" // fieno
  | "coppi"
  | "erba"
  | "marmo"
  | "ferro"
  | "terra" // terra battuta: trincee, sentieri, gallerie
  | "roccia" // roccia viva delle montagne e della miniera
  | "sacs" // sacchetti di sabbia
  | "invisibile"

/** Un parallelepipedo allineato agli assi: collide e si vede. */
export interface Block {
  readonly min: V3
  readonly max: V3
  readonly mat: Mat
  /** Come lo disegna il client: un "muro" ha finestre, un "pilastro" no, ... */
  readonly look?: "muro" | "pilastro" | "terreno" | "copertura" | "cassa" | "fontana" | "bancarele" | "parapetto"
}

/** Una rampa: piano inclinato lungo z, pieno sotto (niente buchi). */
export interface Wedge {
  readonly x0: number
  readonly x1: number
  readonly z0: number
  readonly z1: number
  /** Quota della superficie a z0 e a z1. */
  readonly y0: number
  readonly y1: number
  readonly mat: Mat
}

export interface Portico {
  /** Il lato aperto sulla strada. */
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
  /** Velocità impressa (m/s). */
  readonly launch: V3
}

export type PickupKind = "frico" | "gubane" | "sgnape" | "munizions" | "lanciafrico"

export interface PickupSpot {
  readonly kind: PickupKind
  readonly at: V3
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
  /** Tutto ciò che collide come scatola: terreno, muri, ripari, edifici scomposti, bordi del mondo. */
  readonly blocks: readonly Block[]
  readonly wedges: readonly Wedge[]
  /** Gli edifici interi (il client li disegna con finestre e tetti; i blocchi sono già in `blocks`). */
  readonly buildings: readonly Building[]
  readonly jumpPads: readonly JumpPad[]
  readonly spawns: Readonly<Record<Team, readonly Spawn[]>>
  /** Dove sta il frico di ogni squadra (Cjape il Frico). */
  readonly flagBases: Readonly<Record<Team, V3>>
  /** La zona da tenere (Re de Culine). */
  readonly hill: { readonly at: V3; readonly radius: number }
  readonly pickups: readonly PickupSpot[]
  /** Punti di passaggio per i bot; gli archi li calcola `server/nav.ts` con la fisica. */
  readonly navPoints: readonly V3[]
  /**
   * Il percorso del carrello (Spingi il Cjar): spezzata sul pavimento, dal primo punto
   * (vicino alla base dei Benandanti, che spingono) all'ultimo (dove arriva).
   */
  readonly track: readonly V3[]
  /** Sotto questa quota si è caduti fuori dal mondo. */
  readonly killY: number
}

/** Scompone un edificio (anche con portici) nei blocchi che collidono. */
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
  /** Terreno, muri e ripari; edifici e bordi del mondo li aggiunge `defineMap`. */
  readonly blocks: readonly Block[]
  /** Fondo e cielo dei muri invisibili di bordo. */
  readonly walls: { readonly bottom: number; readonly top: number }
}

/** Completa una mappa: blocchi degli edifici e muri invisibili attorno ai `bounds`. */
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

const dist3 = (a: V3, b: V3) => Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2)

/** Lunghezza di una spezzata (orizzontale e verticale). */
export function trackLength(track: readonly V3[]): number {
  let n = 0
  for (let i = 1; i < track.length; i++) n += dist3(track[i - 1], track[i])
  return n
}

/** Il punto a distanza `d` lungo la spezzata, e la direzione (imbardata) del tratto. */
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
