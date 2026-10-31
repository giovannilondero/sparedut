/**
 * Lagune di Maran: the Focis dal Stele nature reserve, among the barene (salt marshes)
 * and channels of the Maran lagoon.
 *
 * To the north, on dry land, the reserve's foresterie (guesthouse): ground floor with the
 * hall, the kitchen and the bathrooms; first floor with the big dormitories and bathrooms;
 * the flat roof is walkable (and has a small turret with the mitraie). A double staircase
 * goes up from the ground floor to the first floor and then onto the roof. In the middle
 * the arzin (embankment) running north to south, with the wooden boardwalks linking it to
 * the barene. To the east the wood, with two paths among the trees, and the humpback
 * footbridge crossing the channel to the island of the casot (observation hut): its door
 * is shut and has to be broken down, inside is the flamingos' disco. To the south the
 * fishermen's casons. The water is shallow everywhere: you can wade, but slowly (boardwalks,
 * paths and the footbridge are the fast routes).
 *
 * Axes: x east, y up, z south. Metres.
 */
import { defineMap, type Block, type Mat, type PickupSpot, type Spawn, type Team, type V3, type Wedge } from "../map.ts"

/** Dry land, lagoon floor (you wade on it), water surface (for drawing only). */
export const LAND = 0
export const SEA = -0.45
export const WATER = -0.12
const BOTTOM = -3

const BOUNDS = { minX: -70, maxX: 70, minZ: -105, maxZ: 105 } as const

const blocks: Block[] = []
const box = (min: V3, max: V3, mat: Mat, look?: Block["look"]) => {
  blocks.push(look ? { min, max, mat, look } : { min, max, mat })
}

/** An opening in a wall, along its long side: from `a0` to `a1`, from `y0` to `y1`. */
interface Hole {
  readonly a0: number
  readonly a1: number
  readonly y0: number
  readonly y1: number
}

/** The wall openings (doors and windows), for the frames the client draws. */
export const OPENINGS: { readonly min: V3; readonly max: V3; readonly mat: Mat; readonly door: boolean; readonly alongX: boolean }[] = []

/**
 * A wall with doors and windows: it is split into solid blocks between the openings, plus
 * sill and lintel below and above each one.
 */
function wall(min: V3, max: V3, mat: Mat, holes: readonly Hole[] = []) {
  const alongX = max[0] - min[0] >= max[2] - min[2]
  for (const h of holes) {
    OPENINGS.push({
      min: alongX ? [h.a0, h.y0, min[2]] : [min[0], h.y0, h.a0],
      max: alongX ? [h.a1, h.y1, max[2]] : [max[0], h.y1, h.a1],
      mat,
      door: h.y0 <= min[1] + 0.01,
      alongX
    })
  }
  const lo = alongX ? min[0] : min[2]
  const hi = alongX ? max[0] : max[2]
  const piece = (a0: number, a1: number, y0: number, y1: number) => {
    if (a1 - a0 < 1e-6 || y1 - y0 < 1e-6) return
    box(alongX ? [a0, y0, min[2]] : [min[0], y0, a0], alongX ? [a1, y1, max[2]] : [max[0], y1, a1], mat)
  }
  const sorted = [...holes].sort((a, b) => a.a0 - b.a0)
  let at = lo
  for (const h of sorted) {
    piece(at, h.a0, min[1], max[1])
    piece(h.a0, h.a1, min[1], h.y0)
    piece(h.a0, h.a1, h.y1, max[1])
    at = h.a1
  }
  piece(at, hi, min[1], max[1])
}

// --- Land and water --------------------------------------------------------------------

export type P2 = readonly [number, number]

/** A piece of dry land: a polygon (x, z) with an irregular edge, like real barene. */
export interface Land {
  readonly name: string
  readonly poly: readonly P2[]
  readonly mat: Mat
  /** The ground cover colour (the client draws it smooth; the physics splits it into strips). */
  readonly tint: string
}

/**
 * The dry lands. The northern and southern land span the whole width of the map; the arzin
 * shares its edges with them (so the ground covers don't overlap).
 */
export const LANDS: readonly Land[] = [
  {
    name: "tiere a nord",
    mat: "erba",
    tint: "#ffffff",
    poly: [[-70, -105], [70, -105], [70, -50], [60, -46], [50, -48.5], [40, -44.5], [30, -47], [20, -45], [11, -49], [6, -51], [-6, -51], [-12, -48], [-22, -45.5], [-32, -48], [-42, -44.5], [-52, -47.5], [-62, -45], [-70, -48]]
  },
  {
    name: "arzin",
    mat: "terra",
    tint: "#ffffff",
    poly: [[-6, -51], [-7.2, -38], [-5.6, -24], [-7.6, -8], [-6.2, 8], [-7.4, 24], [-5.8, 40], [-7, 54], [-6, 63], [6, 63], [7.2, 52], [5.6, 38], [6.8, 22], [7.4, 6], [5.8, -10], [7, -26], [6, -40], [6, -51]]
  },
  {
    name: "tiere a sud",
    mat: "erba",
    tint: "#ffffff",
    poly: [[-70, 105], [-70, 64], [-60, 61], [-48, 64], [-36, 60.5], [-24, 63.5], [-14, 60], [-6, 63], [6, 63], [14, 60.5], [24, 64], [36, 61.5], [48, 64.5], [60, 61], [70, 64], [70, 105]]
  },
  {
    name: "barene a ovest",
    mat: "erba",
    tint: "#f0f4e0",
    poly: [[-58, -14], [-56, -28], [-46, -33.5], [-34, -31], [-26, -24], [-27, -12], [-23, -4], [-24, 4], [-29, 14], [-40, 19.5], [-52, 16], [-60, 5]]
  },
  {
    name: "bosc",
    mat: "erba",
    tint: "#c8d8b0",
    poly: [[13, -22], [18, -30], [28, -33], [36, -28], [39, -18], [37, -8], [38, 0], [32, 4.5], [22, 3], [15, -2], [12, -10]]
  },
  {
    name: "isule dal casot",
    mat: "erba",
    tint: "#f4f0d8",
    poly: [[27, 16], [34, 12], [44, 13.5], [54, 11], [62, 16], [63.5, 28], [60, 40], [52, 47], [40, 46], [30, 42], [26, 30], [28, 22]]
  },
  {
    name: "isulute",
    mat: "erba",
    tint: "#f0f4e0",
    poly: [[-40, 36], [-37, 33.5], [-32, 34.5], [-30, 39], [-32.5, 43.5], [-37, 44.5], [-40.5, 41]]
  }
]

/** Is the point inside the polygon? (even-odd rule) */
export function insidePoly(poly: readonly P2[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < xi + ((z - zi) * (xj - xi)) / (zj - zi)) inside = !inside
  }
  return inside
}

/** Distance of a point from the segment `a`–`b` (on the ground plane). */
function segDist(x: number, z: number, a: P2, b: P2): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
  const ex = x - (a[0] + dx * k)
  const ez = z - (a[1] + dz * k)
  return Math.sqrt(ex * ex + ez * ez)
}

/** Distance of a point from the polyline (open) or from the polygon's edge (closed). */
function lineDist(line: readonly P2[], x: number, z: number, closed: boolean): number {
  let d = Infinity
  const n = closed ? line.length : line.length - 1
  for (let i = 0; i < n; i++) d = Math.min(d, segDist(x, z, line[i], line[(i + 1) % line.length]))
  return d
}

/**
 * A piece of land as colliding blocks: half-metre strips along z, each cut where its
 * centre line crosses the edge. Identical consecutive strips are merged.
 */
const ROW = 0.5
function landBlocks(poly: readonly P2[], top: number): Block[] {
  const l = { poly }
  const zs = l.poly.map((p) => p[1])
  const out: Block[] = []
  let open = new Map<string, { x0: number; x1: number; z0: number; z1: number }>()
  const flush = (m: Map<string, { x0: number; x1: number; z0: number; z1: number }>) => {
    for (const r of m.values()) out.push({ min: [r.x0, BOTTOM, r.z0], max: [r.x1, top, r.z1], mat: "invisibile", look: "terreno" })
  }
  for (let z0 = Math.floor(Math.min(...zs) / ROW) * ROW; z0 < Math.max(...zs); z0 += ROW) {
    const zc = z0 + ROW / 2
    const xs: number[] = []
    for (let i = 0, j = l.poly.length - 1; i < l.poly.length; j = i++) {
      const [xi, zi] = l.poly[i]
      const [xj, zj] = l.poly[j]
      if (zi > zc !== zj > zc) xs.push(xi + ((zc - zi) * (xj - xi)) / (zj - zi))
    }
    xs.sort((a, b) => a - b)
    const next = new Map<string, { x0: number; x1: number; z0: number; z1: number }>()
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const key = `${xs[k].toFixed(3)}|${xs[k + 1].toFixed(3)}`
      const prev = open.get(key)
      if (prev) {
        prev.z1 = z0 + ROW
        open.delete(key)
        next.set(key, prev)
      } else next.set(key, { x0: xs[k], x1: xs[k + 1], z0, z1: z0 + ROW })
    }
    flush(open)
    open = next
  }
  flush(open)
  return out
}
/**
 * The polygon grown outwards by `d` (each vertex moves along the bisector of the normals).
 * Good enough for the gentle edges of the barene; very sharp corners get clipped.
 */
export function grow(poly: readonly P2[], d: number): P2[] {
  let area = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    area += a[0] * b[1] - b[0] * a[1]
  }
  const sg = area > 0 ? 1 : -1
  const normal = (a: P2, b: P2): P2 => {
    const len = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)
    return [(sg * (b[1] - a[1])) / len, (sg * -(b[0] - a[0])) / len]
  }
  return poly.map((p, i) => {
    const n0 = normal(poly[(i + poly.length - 1) % poly.length], p)
    const n1 = normal(p, poly[(i + 1) % poly.length])
    const k = d / Math.max(0.5, 1 + n0[0] * n1[0] + n0[1] * n1[1])
    return [p[0] + (n0[0] + n1[0]) * k, p[1] + (n0[1] + n1[1]) * k]
  })
}

/**
 * The shore: an underwater step at half height, `SHELF` wide. A single 45 cm step
 * the character controller doesn't always climb (wading is slow); two of 22 it does.
 */
export const SHELF = 0.7
const SHELF_Y = (LAND + SEA) / 2
box([BOUNDS.minX, BOTTOM, BOUNDS.minZ], [BOUNDS.maxX, SEA, BOUNDS.maxZ], "terra", "terreno")
for (const l of LANDS) blocks.push(...landBlocks(l.poly, LAND), ...landBlocks(grow(l.poly, SHELF), SHELF_Y))

/** The wooden boardwalks over the water, flush with the land, with a few turns among the reeds. */
export const BOARDWALK_Y = LAND
export const BOARDWALKS: readonly { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }[] = [
  // arzin → west barene
  { minX: -16, maxX: -6.5, minZ: -6, maxZ: -3.6 },
  { minX: -18.4, maxX: -16, minZ: -9.4, maxZ: -3.6 },
  { minX: -26, maxX: -18.4, minZ: -9.4, maxZ: -7 },
  // northern land → west barene
  { minX: -42, maxX: -39.6, minZ: -46, maxZ: -31 },
  // arzin → wood
  { minX: 5, maxX: 13, minZ: -13, maxZ: -10.6 },
  // northern land → wood, among the reeds
  { minX: 39.6, maxX: 42, minZ: -46, maxZ: -23.6 },
  { minX: 34.5, maxX: 39.6, minZ: -26, maxZ: -23.6 },
  // arzin → casot island, with the turn
  { minX: 6, maxX: 16.4, minZ: 22, maxZ: 24.4 },
  { minX: 14, maxX: 16.4, minZ: 18, maxZ: 22 },
  { minX: 16.4, maxX: 28.5, minZ: 18, maxZ: 20.4 }
]
// The floor planks are drawn slightly higher: the block is only for walking on.
for (const w of BOARDWALKS) {
  box([w.minX, SEA, w.minZ], [w.maxX, BOARDWALK_Y, w.maxZ], "invisibile")
  box([w.minX - SHELF, SEA, w.minZ - SHELF], [w.maxX + SHELF, SHELF_Y, w.maxZ + SHELF], "invisibile")
}

/** A boardwalk handrail: from point `a` to point `b` (on the edge), at floor height `y`. */
export interface Rail {
  readonly a: P2
  readonly b: P2
  readonly y: number
}

/**
 * The boardwalk handrails: only where there is water outside (not on the ends resting on
 * land, not at the turns where one boardwalk continues into the next). They collide.
 */
export const RAILS: readonly Rail[] = (() => {
  const onFoot = (x: number, z: number) =>
    LANDS.some((l) => insidePoly(l.poly, x, z)) || BOARDWALKS.some((w) => x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ)
  const out: Rail[] = []
  const STEP = 0.25
  for (const w of BOARDWALKS) {
    const edges: [P2, P2, P2][] = [
      [[w.minX, w.minZ], [w.maxX, w.minZ], [0, -1]],
      [[w.minX, w.maxZ], [w.maxX, w.maxZ], [0, 1]],
      [[w.minX, w.minZ], [w.minX, w.maxZ], [-1, 0]],
      [[w.maxX, w.minZ], [w.maxX, w.maxZ], [1, 0]]
    ]
    for (const [a, b, n] of edges) {
      const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
      const dx = (b[0] - a[0]) / len
      const dz = (b[1] - a[1]) / len
      let start = -1
      const close = (end: number) => {
        if (start >= 0 && end - start > 0.6) out.push({ a: [a[0] + dx * start, a[1] + dz * start], b: [a[0] + dx * end, a[1] + dz * end], y: BOARDWALK_Y })
        start = -1
      }
      for (let t = 0; t < len - 1e-6; t += STEP) {
        const m = t + STEP / 2
        const wet = !onFoot(a[0] + dx * m + n[0] * 0.3, a[1] + dz * m + n[1] * 0.3)
        if (wet && start < 0) start = t
        if (!wet) close(t)
      }
      close(len)
    }
  }
  return out
})()
/** The handrail sits on the edge, one metre high; its collider is 12 cm thick. */
export const RAIL_H = 1
for (const r of RAILS) {
  const n = 0.06
  box([Math.min(r.a[0], r.b[0]) - (r.a[0] === r.b[0] ? n : 0), SEA, Math.min(r.a[1], r.b[1]) - (r.a[1] === r.b[1] ? n : 0)], [Math.max(r.a[0], r.b[0]) + (r.a[0] === r.b[0] ? n : 0), r.y + RAIL_H, Math.max(r.a[1], r.b[1]) + (r.a[1] === r.b[1] ? n : 0)], "invisibile")
}

/** The wooden humpback footbridge over the channel between the wood and the casot island (you can also go under it, crouching). */
export const PONT = { x0: 28.6, x1: 31.4, z0: 2, up: 5, down: 11, z1: 14, deck: 0.95, under: 0.75, rail: 1 } as const
const wedges: Wedge[] = [
  { x0: PONT.x0, x1: PONT.x1, z0: PONT.z0, z1: PONT.up, y0: LAND, y1: PONT.deck, mat: "legno" },
  { x0: PONT.x0, x1: PONT.x1, z0: PONT.down, z1: PONT.z1, y0: PONT.deck, y1: LAND, mat: "legno" }
]
box([PONT.x0, PONT.under, PONT.up], [PONT.x1, PONT.deck, PONT.down], "legno")
for (const [x0, x1] of [[PONT.x0 - 0.12, PONT.x0], [PONT.x1, PONT.x1 + 0.12]] as const) {
  box([x0, SEA, PONT.z0], [x1, PONT.deck + PONT.rail, PONT.up], "invisibile")
  box([x0, PONT.under, PONT.up], [x1, PONT.deck + PONT.rail, PONT.down], "invisibile")
  box([x0, SEA, PONT.down], [x1, PONT.deck + PONT.rail, PONT.z1], "invisibile")
}

/** The packed-earth paths: in the wood (two) and on the island up to the casot's door. */
export const PATHS: readonly (readonly P2[])[] = [
  [[12, -11.8], [17, -13], [22, -19], [28, -20.5], [32, -14], [28, -7], [30, -1], [30, 2.5]],
  [[36, -24.8], [33.5, -19], [32, -14]],
  [[30, 14], [32.5, 19.2], [36, 24], [39.6, 27]],
  [[28, 19.2], [32.5, 19.2]]
]

// --- The foresterie -------------------------------------------------------------------

/** The foresterie: outer walls, floors (first floor and roof), stairs. */
export const FORESTERIE = { minX: -20, maxX: 20, minZ: -82, maxZ: -64, t: 0.4, f1: 4, roof: 8, slab: 0.4, parapet: 1.1 } as const
/** The two flights of the staircase: the first from the ground floor to the first floor, the second up to the roof. */
export const STAIRS = {
  first: { x0: 16.6, x1: 19.6 },
  second: { x0: 13, x1: 16 },
  z0: -76,
  z1: -66
} as const
wedges.push(
  { x0: STAIRS.first.x0, x1: STAIRS.first.x1, z0: STAIRS.z0, z1: STAIRS.z1, y0: FORESTERIE.f1, y1: LAND, mat: "legno" },
  { x0: STAIRS.second.x0, x1: STAIRS.second.x1, z0: STAIRS.z0, z1: STAIRS.z1, y0: FORESTERIE.f1, y1: FORESTERIE.roof, mat: "legno" }
)
{
  const { minX, maxX, minZ, maxZ, t, f1, roof } = FORESTERIE
  const s1 = f1 - FORESTERIE.slab
  const s2 = roof - FORESTERIE.slab
  const door = (a0: number, a1: number, y0 = 0): Hole => ({ a0, a1, y0, y1: y0 + 2.6 })
  const win = (a0: number, a1: number, y0: number, y1: number): Hole => ({ a0, a1, y0, y1 })
  const mat: Mat = "intonacoBianco"
  // Outer walls, straight up to the roof.
  wall([minX, 0, maxZ - t], [maxX, roof, maxZ], mat, [
    win(-18, -16, 1, 2.4), door(-11, -8), win(-5, -3, 1, 2.4), win(4, 5.4, 1.6, 2.4), door(13.4, 15.6),
    win(-17, -15, 5, 6.6), win(-11, -9, 5, 6.6), win(-3, -1, 5, 6.6), win(3, 5, 5, 6.6), win(9, 11, 5.8, 6.6), win(17, 19, 5, 6.6)
  ])
  wall([minX, 0, minZ], [maxX, roof, minZ + t], mat, [
    win(-15, -13, 1, 2.4), win(-6, -4, 1, 2.4), win(5, 7, 1, 2.4), door(9, 10.5),
    win(-16, -14, 5, 6.6), win(-8, -6, 5, 6.6), win(0, 2, 5, 6.6), win(8, 10, 5.8, 6.6)
  ])
  wall([minX, 0, minZ + t], [minX + t, roof, maxZ - t], mat, [door(-74, -72), win(-79, -77, 1, 2.4), win(-75, -71, 5, 6.6)])
  wall([maxX - t, 0, minZ + t], [maxX, roof, maxZ - t], mat, [win(-80, -78, 1, 2.4), win(-74, -70, 5, 6.6)])

  // Ground floor: hall (west), kitchen (north-east), bathrooms (south-east), the stairwell (east).
  wall([2, 0, minZ + t], [2.4, s1, maxZ - t], mat, [door(-79, -77.5), door(-70, -68.5)])
  wall([2.4, 0, -73.4], [12.6, s1, -73], mat)
  wall([12.6, 0, minZ + t], [13, s1, maxZ - t], mat, [door(-79, -77.5), door(-69, -67.5)])
  // the wall between the two flights
  box([16, 0, STAIRS.z0], [16.6, f1 + 1.2, STAIRS.z1], mat)
  // the bathroom stalls
  for (const x of [4.6, 6.6, 8.6, 10.6]) box([x, 0, -73], [x + 0.1, 2.1, -70.8], "legno")
  // kitchen: counters along the wall and the island in the middle
  box([3, 0, minZ + t], [12.2, 0.95, -80.9], "legno")
  box([6, 0, -77.4], [9.5, 0.95, -76.2], "legno")
  // hall: two long tables and the fogolâr
  box([-16, 0, -80], [-15, 0.8, -74], "legno")
  box([-4, 0, -80], [-3, 0.8, -74], "legno")
  box([-19.6, 0, -69.5], [-18.6, 1.2, -67], "pietra")

  // First floor: the floor slab (with the stairwell opening), the north corridor, two dormitories and the bathrooms.
  box([minX + t, s1, minZ + t], [STAIRS.second.x0, f1, maxZ - t], "legno")
  box([STAIRS.second.x0, s1, minZ + t], [maxX - t, f1, STAIRS.z0], "legno")
  box([STAIRS.second.x0, s1, STAIRS.z1], [maxX - t, f1, maxZ - t], "legno")
  wall([minX + t, f1, -78], [12.6, s2, -77.6], mat, [door(-14, -12.5, f1), door(-1, 0.5, f1), door(8, 9.5, f1)])
  wall([-6, f1, -77.6], [-5.6, s2, maxZ - t], mat)
  wall([6, f1, -77.6], [6.4, s2, maxZ - t], mat)
  wall([12.6, f1, -77.6], [13, s2, maxZ - t], mat)
  for (const x of [8.6, 10.6]) box([x, f1, maxZ - t - 2.2], [x + 0.1, f1 + 2.1, maxZ - t], "legno")
  // the bunk beds, in rows along the two long sides (the client draws the upper bunk)
  for (const [x0, x1] of [[-19.6, -6], [-5.6, 6]] as const) {
    for (let x = x0 + 0.4; x + 0.9 <= x1 - 0.3; x += 1.9) {
      box([x, f1, maxZ - t - 2], [x + 0.9, f1 + 0.6, maxZ - t], "legno")
      // on the north side the door is left clear
      const doorX = x0 < -6 ? [-14, -12.5] : [-1, 0.5]
      if (x + 0.9 < doorX[0] - 0.6 || x > doorX[1] + 0.6) box([x, f1, -77.6], [x + 0.9, f1 + 0.6, -75.6], "legno")
    }
  }

  // The flat roof: walkable, with the parapet around it and the railing around the second flight's opening.
  box([minX + t, s2, minZ + t], [STAIRS.second.x0, roof, maxZ - t], "pietra")
  box([STAIRS.second.x1, s2, minZ + t], [maxX - t, roof, maxZ - t], "pietra")
  box([STAIRS.second.x0, s2, minZ + t], [STAIRS.second.x1, roof, STAIRS.z0], "pietra")
  box([STAIRS.second.x0, s2, STAIRS.z1], [STAIRS.second.x1, roof, maxZ - t], "pietra")
  const p = roof + FORESTERIE.parapet
  box([minX, roof, maxZ - 0.3], [maxX, p, maxZ], "pietra", "parapetto")
  box([minX, roof, minZ], [maxX, p, minZ + 0.3], "pietra", "parapetto")
  box([minX, roof, minZ + 0.3], [minX + 0.3, p, maxZ - 0.3], "pietra", "parapetto")
  box([maxX - 0.3, roof, minZ + 0.3], [maxX, p, maxZ - 0.3], "pietra", "parapetto")
  box([STAIRS.second.x0 - 0.3, roof, STAIRS.z0 - 0.3], [STAIRS.second.x1 + 0.3, p, STAIRS.z0], "ferro", "parapetto")
  box([STAIRS.second.x0 - 0.3, roof, STAIRS.z0], [STAIRS.second.x0, p, STAIRS.z1], "ferro", "parapetto")
  box([STAIRS.second.x1, roof, STAIRS.z0], [STAIRS.second.x1 + 0.3, p, STAIRS.z1], "ferro", "parapetto")
}

// --- The observation casot --------------------------------------------------------------

/** The casot on the island to the east: the only way in is to break down the west door. */
export const CASOT = { minX: 40, maxX: 52, minZ: 22, maxZ: 32, floor: LAND, top: 3.4, t: 0.3 } as const
/** The wooden step under the viewing slits (you look out through the slits); the drunk keeps his head above them. */
export const SCJALIN = { minX: 49.8, maxX: CASOT.maxX - CASOT.t, minZ: CASOT.minZ + CASOT.t, maxZ: CASOT.maxZ - CASOT.t, top: CASOT.floor + 0.35 } as const
/** The beer pot. */
export const PIGNATE = { minX: 47.4, maxX: 48.4, minZ: 28.8, maxZ: 29.8, top: CASOT.floor + 0.65 } as const
/** Where the music plays: the mirror ball in the middle of the casot. */
export const DISCO: V3 = [44, 2.7, 27]
/** The birdwatching slit: narrow, you can shoot through it but not pass. */
const SLIT = { y0: 1.85, y1: 2.25 } as const
const DOOR = { z0: 26.2, z1: 27.8, top: CASOT.floor + 2.1 } as const
{
  const { minX, maxX, minZ, maxZ, floor, top, t } = CASOT
  const slit = (a0: number, a1: number): Hole => ({ a0, a1, ...SLIT })
  wall([minX, floor, minZ], [minX + t, top, maxZ], "legno", [{ a0: DOOR.z0, a1: DOOR.z1, y0: floor, y1: DOOR.top }])
  wall([maxX - t, floor, minZ], [maxX, top, maxZ], "legno", [slit(23, 25), slit(26, 28), slit(29, 31)])
  wall([minX + t, floor, minZ], [maxX - t, top, minZ + t], "legno", [slit(43, 46), slit(47, 50.5)])
  wall([minX + t, floor, maxZ - t], [maxX - t, top, maxZ], "legno", [slit(43, 46), slit(47, 50.5)])
  box([minX - 0.4, top, minZ - 0.4], [maxX + 0.4, top + 0.3, maxZ + 0.4], "legno")
  box([SCJALIN.minX, floor, SCJALIN.minZ], [SCJALIN.maxX, SCJALIN.top, SCJALIN.maxZ], "legno")
  box([PIGNATE.minX, floor, PIGNATE.minZ], [PIGNATE.maxX, PIGNATE.top, PIGNATE.maxZ], "invisibile")
}

// --- Fishermen's casons, cover ------------------------------------------------------------

/** The casons: reed walls and a thatched roof reaching almost to the ground (the client draws them). */
export const CASONS: readonly { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }[] = [
  { minX: -34, maxX: -26, minZ: 70, maxZ: 76 },
  { minX: 24, maxX: 32, minZ: 74, maxZ: 80 },
  { minX: -14, maxX: -8, minZ: 84, maxZ: 92 },
  { minX: 40, maxX: 48, minZ: 88, maxZ: 94 },
  { minX: -52, maxX: -44, minZ: -10, maxZ: -4 }
]
export const CASON_TOP = 3.8
for (const c of CASONS) box([c.minX, LAND, c.minZ], [c.maxX, LAND + CASON_TOP, c.maxZ], "invisibile")

// Reed bales on the arzin (the cjar passes through the middle), fish crates, the charcoal pile.
for (const [x, z] of [[-4, -20], [2.5, -30], [-4, 30], [2.5, 40], [2.5, 4], [-4, 14]] as const) box([x, LAND, z], [x + 1.5, LAND + 1.2, z + 1.5], "fen")
for (const [x, z] of [[-40, -62], [36, -58], [-46, 6], [52, 40], [14, 70], [-40, 90], [55, 75]] as const) box([x, LAND, z], [x + 3, LAND + 1.3, z + 2.4], "legno", "cassa")
// The sandbags of the village turret.
box([-19.5, LAND, 62.2], [-16.5, LAND + 0.9, 62.8], "sacs")

// --- Game ------------------------------------------------------------------------------------

const spawns: Record<Team, readonly Spawn[]> = {
  benandanti: [
    { at: [-30, LAND, -92], yaw: Math.PI },
    { at: [-10, LAND, -94], yaw: Math.PI },
    { at: [10, LAND, -94], yaw: Math.PI },
    { at: [30, LAND, -92], yaw: Math.PI },
    { at: [-40, LAND, -72], yaw: Math.PI },
    { at: [40, LAND, -72], yaw: Math.PI },
    { at: [-30, LAND, -56], yaw: Math.PI },
    { at: [30, LAND, -56], yaw: Math.PI }
  ],
  malandanti: [
    { at: [-30, LAND, 90], yaw: 0 },
    { at: [-4, LAND, 98], yaw: 0 },
    { at: [12, LAND, 98], yaw: 0 },
    { at: [30, LAND, 92], yaw: 0 },
    { at: [-52, LAND, 80], yaw: 0 },
    { at: [56, LAND, 82], yaw: 0 },
    { at: [-20, LAND, 70], yaw: 0 },
    { at: [16, LAND, 68], yaw: 0 }
  ]
}

const pickups: PickupSpot[] = [
  { kind: "frico", at: [-10, LAND, -77] },
  { kind: "frico", at: [-38, LAND, -16] },
  { kind: "frico", at: [34, LAND, 40] },
  { kind: "frico", at: [20, LAND, 86] },
  { kind: "gubane", at: [-13, FORESTERIE.f1, -71] },
  { kind: "gubane", at: [-58, LAND, 70] },
  { kind: "sgnape", at: [-10, FORESTERIE.roof, -72] },
  { kind: "sgnape", at: [4.5, LAND, -12] },
  { kind: "munizions", at: [10, LAND, -52] },
  { kind: "munizions", at: [-10, LAND, 66] },
  { kind: "munizions", at: [-34, LAND, 8] },
  { kind: "munizions", at: [56, LAND, 16] },
  // The prize for whoever breaks down the casot's door.
  { kind: "lanciafrico", at: [44.5, CASOT.floor, 27] }
]

const F = FORESTERIE
const B = BOARDWALK_Y
const navPoints: V3[] = [
  // Northern land
  [-60, LAND, -95], [-35, LAND, -95], [-10, LAND, -95], [10, LAND, -95], [35, LAND, -95], [60, LAND, -95],
  [-60, LAND, -75], [-35, LAND, -75], [-24, LAND, -73], [24, LAND, -73], [35, LAND, -75], [60, LAND, -75],
  [-60, LAND, -55], [-35, LAND, -55], [-20, LAND, -58], [-9.5, LAND, -60], [0, LAND, -54], [14.5, LAND, -60], [24, LAND, -58], [35, LAND, -55], [60, LAND, -55],
  [-40.8, LAND, -51], [40.8, LAND, -51],
  // Foresterie: ground floor
  [-9.5, LAND, -66.5], [-9.5, LAND, -73], [-9.5, LAND, -79], [-17.6, LAND, -73], [-17.6, LAND, -79], [0, LAND, -78.2], [0, LAND, -69.2],
  [4, LAND, -78.3], [11, LAND, -78.3], [5, LAND, -69.2], [11, LAND, -68.2],
  [15, LAND, -78.3], [14.5, LAND, -70], [14.5, LAND, -65.3], [18.1, LAND, -65.3],
  // stairs and first floor
  [18.1, F.f1, -77.5], [14.5, F.f1, -77.5],
  [-16, F.f1, -79.6], [-5, F.f1, -79.6], [5, F.f1, -79.6], [10, F.f1, -79.6], [-13.25, F.f1, -79.6], [-0.25, F.f1, -79.6], [8.75, F.f1, -79.6],
  [-13.25, F.f1, -76.6], [-13, F.f1, -71], [-0.25, F.f1, -76.6], [0, F.f1, -71], [8.75, F.f1, -76.6], [9.5, F.f1, -71],
  // roof
  [14.5, F.roof, -65.2], [5, F.roof, -66], [-10, F.roof, -66], [-10, F.roof, -78], [5, F.roof, -78], [18.2, F.roof, -65.2], [18.2, F.roof, -75],
  // Arzin and boardwalks
  [0, LAND, -46], [0, LAND, -30], [0, LAND, -14], [0, LAND, 0], [0, LAND, 14], [0, LAND, 30], [0, LAND, 46], [0, LAND, 60],
  [4.5, LAND, -24], [-4.5, LAND, 8], [4.5, LAND, 23.2], [-4.5, LAND, -4.8], [4.5, LAND, -11.8],
  [10, B, 23.2], [15.2, B, 23.2], [15.2, B, 19.2], [22, B, 19.2], [28, LAND, 19.2],
  [-10, B, -4.8], [-17.2, B, -4.8], [-17.2, B, -8.2], [-22, B, -8.2],
  [40.8, B, -44], [40.8, B, -35], [40.8, B, -27.5],
  [-40.8, B, -45], [-40.8, B, -35],
  // West barene
  [-28, LAND, -8.2], [-40.8, LAND, -29], [-35, LAND, -18], [-35, LAND, 5], [-50, LAND, 12], [-55, LAND, -20], [-46, LAND, -15], [-40, LAND, 15],
  // Wood: the two paths and the footbridge
  [9, B, -11.8], [13.5, LAND, -11.8], [17, LAND, -13], [22, LAND, -19], [28, LAND, -20.5], [32, LAND, -14], [28, LAND, -7], [30, LAND, -1], [30, LAND, 2.5],
  [30, PONT.deck, 6], [30, PONT.deck, 10], [30, LAND, 15],
  [38, B, -24.8], [36, LAND, -24.8], [33.5, LAND, -19],
  // Casot island (outside)
  [32.5, LAND, 19.2], [36, LAND, 24], [34, LAND, 14], [42, LAND, 16], [34, LAND, 40], [37, LAND, 27], [46, LAND, 16], [46, LAND, 38], [57, LAND, 27], [57, LAND, 14], [57, LAND, 40], [30, LAND, 32],
  // Islet and water
  [-35, LAND, 39],
  [-15, SEA, -30], [-15, SEA, 30], [10, SEA, -25], [15, SEA, 4], [20, SEA, 45], [-20, SEA, 50], [-45, SEA, 40], [-60, SEA, 30],
  [-62, SEA, -40], [55, SEA, -20], [62, SEA, 0], [50, SEA, 55], [-24, SEA, -40], [24, SEA, -42], [-48, SEA, 52], [45, SEA, -10],
  // Village of casons to the south
  [-60, LAND, 70], [-45, LAND, 66], [-20, LAND, 68], [-4, LAND, 68], [0, LAND, 76], [16, LAND, 68], [36, LAND, 68], [60, LAND, 70],
  [-50, LAND, 85], [-30, LAND, 84], [-20, LAND, 96], [-4, LAND, 88], [10, LAND, 96], [20, LAND, 88], [36, LAND, 84], [55, LAND, 85],
  [60, LAND, 100], [-60, LAND, 100], [0, LAND, 98], [36, LAND, 100]
]

// --- Trees ---------------------------------------------------------------------------------

/** A tree: the trunk collides (you can take cover and can't pass), the foliage is high up. */
export interface Tree {
  readonly x: number
  readonly z: number
  /** Size (1 = 3 m trunk). */
  readonly s: number
}

/** The trees: the hand-placed ones on the lands and the dense wood around the paths. */
export const TREES: readonly Tree[] = (() => {
  const out: Tree[] = [
    [-50, -90], [-28, -100], [26, -100], [52, -88], [-56, -60], [56, -62], [-45, 14], [-52, -24], [54, 36], [-62, 96], [62, 92], [30, 100]
  ].map(([x, z], i) => ({ x, z, s: 0.95 + ((i * 37) % 10) / 20 }))
  // deterministic randomness, identical on server and client
  let seed = 4242
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const clear = (x: number, z: number) =>
    navPoints.every((p) => (p[0] - x) ** 2 + (p[2] - z) ** 2 > 2.2 * 2.2) &&
    pickups.every((p) => (p.at[0] - x) ** 2 + (p.at[2] - z) ** 2 > 2.5 * 2.5) &&
    PATHS.every((p) => lineDist(p, x, z, false) > 2.4) &&
    BOARDWALKS.every((w) => x < w.minX - 2 || x > w.maxX + 2 || z < w.minZ - 2 || z > w.maxZ + 2) &&
    (x < CASOT.minX - 2.5 || x > CASOT.maxX + 2.5 || z < CASOT.minZ - 2.5 || z > CASOT.maxZ + 2.5) &&
    (x < PONT.x0 - 3 || x > PONT.x1 + 3 || z < PONT.z0 - 3 || z > PONT.z1 + 3)
  const grove = (land: Land, step: number, minX = -Infinity, maxX = Infinity) => {
    const xs = land.poly.map((p) => p[0])
    const zs = land.poly.map((p) => p[1])
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += step) {
        const tx = x + (rnd() - 0.5) * step * 0.7
        const tz = z + (rnd() - 0.5) * step * 0.7
        const s = 0.85 + rnd() * 0.45
        if (tx < minX || tx > maxX) continue
        if (!insidePoly(land.poly, tx, tz) || lineDist(land.poly, tx, tz, true) < 1.4 || !clear(tx, tz)) continue
        out.push({ x: tx, z: tz, s })
      }
    }
  }
  grove(LANDS.find((l) => l.name === "bosc")!, 3.1)
  grove(LANDS.find((l) => l.name === "isule dal casot")!, 4.6, 0, CASOT.minX)
  return out
})()
for (const t of TREES) {
  const r = 0.2 * t.s
  box([t.x - r, LAND, t.z - r], [t.x + r, LAND + 3 * t.s, t.z + r], "invisibile")
}

/** The channel bricole: three poles tied together at the top; they collide (you go around). */
export const BRICOLE: readonly P2[] = [[-15, -38], [15, -38], [-15, 0], [10, -20], [-15, 40], [15, 50], [-62, 10], [62, -8], [35, 56], [-40, 56]]
for (const [x, z] of BRICOLE) box([x - 0.45, SEA, z - 0.45], [x + 0.45, WATER + 3.2, z + 0.45], "invisibile")

// --- Lanterns (the map is at night) -----------------------------------------------------------

/** The lanterns on poles along the paths and boardwalks: the pole collides; `real` = it casts real light. */
export const LANTERNS: readonly { readonly x: number; readonly z: number; readonly y: number; readonly real: boolean }[] = (
  [
    [-12.4, -62.6, LAND, true], // the foresterie's doors
    [16.6, -62.6, LAND, false],
    [-2, -49, LAND, false], // the head of the arzin
    [6.6, -10.2, B, true], // the wood boardwalk
    [17, -11, LAND, false],
    [27, -18.4, LAND, false],
    [31.6, -4, LAND, false],
    [27.6, 1.6, LAND, true], // the footbridge
    [32.4, 14.6, LAND, false],
    [34.6, 21.6, LAND, false],
    [38, 24.4, LAND, true], // the casot's door
    [42.4, -40, B, false], // the boardwalk among the reeds
    [42.4, -27, B, true],
    [16.8, 24.8, B, true], // the turn of the casot boardwalk
    [7, 21.6, B, false],
    [-18.8, -3.2, B, true], // the barene boardwalk
    [-39.2, -40, B, false],
    [-2, 61, LAND, false], // the village
    [-16, 66, LAND, true],
    [20, 70, LAND, false]
  ] as const
).map(([x, z, y, real]) => ({ x, z, y, real }))
for (const l of LANTERNS) box([l.x - 0.08, l.y, l.z - 0.08], [l.x + 0.08, l.y + 2.1, l.z + 0.08], "invisibile")

/** The cjar: from the foresterie down the arzin to the village of casons. */
const track: V3[] = [
  [0, LAND, -56],
  [0, LAND, -46],
  [0, LAND, 62],
  [0, LAND, 84]
]

export const MARAN = defineMap({
  id: "maran",
  bounds: BOUNDS,
  blocks,
  wedges,
  buildings: [],
  walls: { bottom: BOTTOM, top: 40 },
  jumpPads: [],
  spawns,
  /** The Benandanti's frico in the foresterie's hall, the Malandanti's next to the cavane. */
  flagBases: { benandanti: [-9.5, LAND, -70], malandanti: [0, LAND, 94] },
  /** The middle of the arzin. */
  hill: { at: [0, LAND, 8], radius: 7.5 },
  pickups,
  navPoints,
  track,
  killY: -10,
  wade: { level: WATER, speed: 0.6 },
  turrets: [
    { at: [0, FORESTERIE.roof, -65.2], yaw: Math.PI },
    { at: [-18, LAND, 63.6], yaw: 0 }
  ],
  doors: [{ name: "Puarte dal casot", min: [CASOT.minX + 0.05, CASOT.floor, DOOR.z0], max: [CASOT.minX + 0.25, DOOR.top, DOOR.z1], hp: 150 }]
})
