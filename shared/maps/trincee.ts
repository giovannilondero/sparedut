/**
 * Trinceis dal Pal Piçul: the Great War on the ridge of the Carnic Alps, 1915-17.
 *
 * Two trench lines facing each other: to the south the Italian one (Benandanti),
 * to the north the Austro-Hungarian one (Malandanti), in between no man's land with shell
 * craters, rocks and a ruined stone hut. Each line has a front-line trench (fire step,
 * traverses, sandbags on the parapet), communication trenches running back and a reserve
 * pit: the Italians have the wooden dugout (the frico), the Austrians the cave with the
 * gun in the cliff. The Decauville railway runs through the middle: it is the cart's path.
 *
 * The ground has two heights: the trench floor (0) and the ground above (1.8).
 * The trenches are the "cuts" (`CUTS`); the high ground is everything else, computed.
 *
 * Axes: x east, y up, z south. Metres.
 */
import { defineMap, type Block, type Building, type PickupSpot, type Spawn, type Team, type V3, type Wedge } from "../map.ts"

/** Heights: trench floor and ground above. */
export const T_FLOOR = 0
export const T_TOP = 1.8
const BOTTOM = -3
const BOUNDS = { minX: -45, maxX: 45, minZ: -100, maxZ: 100 } as const

/** A rectangle on the ground plane: [x0, z0, x1, z1]. */
export type Rect = readonly [number, number, number, number]

/** The trenches of one side (south, positive z); the north side is their mirror image. */
const SOUTH_CUTS: Rect[] = [
  // Front line and the three ramps towards no man's land.
  [-42, 38, 42, 41],
  [-34, 30, -30, 38],
  [-2, 30, 2, 38],
  [30, 30, 34, 38],
  // Central communication trench (the railway) and the two zig-zag ones on the flanks.
  [-2, 41, 2, 76],
  [-28, 41, -25.4, 58],
  [-28, 58, -19.4, 60.6],
  [-22, 60.6, -19.4, 76],
  [25.4, 41, 28, 58],
  [19.4, 58, 28, 60.6],
  [19.4, 60.6, 22, 76],
  // The reserve pit.
  [-24, 76, 24, 92]
]
const mirror = (r: Rect): Rect => [r[0], -r[3], r[2], -r[1]]

/** All the cuts: trenches, Italian dugout, Austrian cave. */
export const CUTS: readonly Rect[] = [
  ...SOUTH_CUTS,
  ...SOUTH_CUTS.map(mirror),
  [-7, 92, 7, 100], // dugout
  [7, -100, 19, -92] // cave
]

/** The narrow trenches (front line and communication trenches): the client lays duckboards on the floor. */
export const NARROW_CUTS: readonly Rect[] = CUTS.filter((r) => Math.min(r[2] - r[0], r[3] - r[1]) <= 4.5 && Math.max(r[2] - r[0], r[3] - r[1]) > 8.5)

const blocks: Block[] = []
const box = (min: V3, max: V3, mat: Block["mat"], look?: Block["look"]) => {
  blocks.push(look ? { min, max, mat, look } : { min, max, mat })
}

// --- ground: the floor everywhere, the high ground outside the cuts ---------------------
box([BOUNDS.minX, BOTTOM, BOUNDS.minZ], [BOUNDS.maxX, T_FLOOR, BOUNDS.maxZ], "terra", "terreno")
{
  const xs = [...new Set([BOUNDS.minX, BOUNDS.maxX, ...CUTS.flatMap((r) => [r[0], r[2]])])].sort((a, b) => a - b)
  const zs = [...new Set([BOUNDS.minZ, BOUNDS.maxZ, ...CUTS.flatMap((r) => [r[1], r[3]])])].sort((a, b) => a - b)
  const carved = (x: number, z: number) => CUTS.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3])
  for (let j = 0; j < zs.length - 1; j++) {
    const zc = (zs[j] + zs[j + 1]) / 2
    // In no man's land the ground is churned up; behind the lines the grass grows.
    const mat = Math.abs(zc) < 38 ? "terra" : "erba"
    let i = 0
    while (i < xs.length - 1) {
      if (carved((xs[i] + xs[i + 1]) / 2, zc)) {
        i++
        continue
      }
      let k = i
      while (k < xs.length - 1 && !carved((xs[k] + xs[k + 1]) / 2, zc)) k++
      box([xs[i], T_FLOOR, zs[j]], [xs[k], T_TOP, zs[j + 1]], mat, "terreno")
      i = k
    }
  }
}

// --- ramps out of the trenches (wedges only run along z) --------------------------------
const wedges: Wedge[] = []
for (const x of [-32, 0, 32]) {
  wedges.push({ x0: x - 2, x1: x + 2, z0: 30, z1: 38, y0: T_TOP, y1: T_FLOOR, mat: "terra" })
  wedges.push({ x0: x - 2, x1: x + 2, z0: -38, z1: -30, y0: T_FLOOR, y1: T_TOP, mat: "terra" })
}

// --- front line: traverses, fire step, sandbags ----------------------------------------
/** The traverses (blocks of earth that break up the line): centres in x. */
export const TRAVERSES = [-37.5, -20.25, -12.25, -5.25, 5.25, 12.25, 20.25, 37.5] as const
const RAMP_GAPS: readonly (readonly [number, number])[] = [[-34.5, -29.5], [-2.5, 2.5], [29.5, 34.5]]

/** The pieces of [a, b] that touch none of the holes. */
function spans(a: number, b: number, holes: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = []
  let x = a
  for (const [h0, h1] of [...holes].sort((p, q) => p[0] - q[0])) {
    if (h1 <= x || h0 >= b) continue
    if (h0 > x) out.push([x, h0])
    x = Math.max(x, h1)
  }
  if (x < b) out.push([x, b])
  return out
}

for (const s of [1, -1]) {
  // `s` = 1 Italian line (south), -1 Austrian: the front wall is at z = 38·s.
  const front = 38 * s
  const z = (a: number, b: number): [number, number] => (s > 0 ? [front + a, front + b] : [front - b, front - a])
  const traverseHoles = TRAVERSES.map((c) => [c - 0.75, c + 0.75] as const)
  for (const c of TRAVERSES) {
    const [z0, z1] = z(0, 1.6)
    box([c - 0.75, T_FLOOR, z0], [c + 0.75, T_TOP, z1], "terra", "terreno")
  }
  // Two-step fire step (0.45 and 0.9): from the top you shoot over the sandbags.
  for (const [a, b] of spans(-42, 42, [...traverseHoles, ...RAMP_GAPS])) {
    const [h0, h1] = z(0, 0.6)
    const [l0, l1] = z(0.6, 1.2)
    box([a, T_FLOOR, h0], [b, 0.9, h1], "legno")
    box([a, T_FLOOR, l0], [b, 0.45, l1], "legno")
  }
  // Sandbags on the parapet, with openings for the ramps.
  for (const [a, b] of spans(-45, 45, [[-34, -30], [-2, 2], [30, 34]])) {
    const [z0, z1] = z(-0.8, 0)
    box([a, T_TOP, z0], [b, T_TOP + 0.5, z1], "sacs")
  }
}

// --- Italian dugout (the Benandanti's frico) --------------------------------------------
box([-7, T_FLOOR, 92], [-6, 2.8, 100], "legno")
box([6, T_FLOOR, 92], [7, 2.8, 100], "legno")
box([-6, T_FLOOR, 99], [6, 2.8, 100], "legno")
box([-6, T_FLOOR, 92], [-1.5, 2.8, 93], "legno")
box([1.5, T_FLOOR, 92], [6, 2.8, 93], "legno")
box([-1.5, 2.4, 92], [1.5, 2.8, 93], "legno")
box([-7, 2.8, 92], [7, 3.3, 100], "legno", "copertura")
box([-7, 3.3, 92.4], [7, 3.8, 99.6], "sacs")
// Plank tables and ammo crates inside.
box([-5.6, T_FLOOR, 97], [-3.4, 0.9, 98.6], "legno", "cassa")
box([3.6, T_FLOOR, 94], [5.6, 1.1, 95.4], "legno", "cassa")
// The cliff closing off the pit to the south.
box([BOUNDS.minX, T_TOP, 96], [-7, 5, BOUNDS.maxZ], "roccia")
box([7, T_TOP, 96], [BOUNDS.maxX, 5, BOUNDS.maxZ], "roccia")

// --- Austrian cave with the gun (the Malandanti's frico) --------------------------------
box([7, T_FLOOR, -100], [8, 8, -92], "roccia")
box([18, T_FLOOR, -100], [19, 8, -92], "roccia")
box([8, T_FLOOR, -100], [18, 8, -99], "roccia")
box([8, 3.2, -99], [18, 8, -92], "roccia")
box([BOUNDS.minX, T_TOP, BOUNDS.minZ], [7, 8, -93], "roccia")
box([19, T_TOP, BOUNDS.minZ], [BOUNDS.maxX, 8, -93], "roccia")
// The gun carriage: you can hide behind it.
box([11, T_FLOOR, -97], [15, 1.1, -95], "legno", "cassa")
box([9, T_FLOOR, -98.6], [10.6, 0.9, -97], "legno", "cassa")

// --- no man's land: rocks and the ruined hut -------------------------------------------
/** The boulders: centres and height above the ground. */
export const ROCKS: readonly (readonly [number, number, number])[] = [
  [-30, 21, 2.2], [-18, 7, 1.7], [18, -7, 1.7], [30, -21, 2.2],
  [6, 21, 1.4], [-6, -21, 1.4], [18, 21, 2.6], [-30, -7, 2.6]
]
for (const [x, z, h] of ROCKS) box([x - 1.5, T_TOP, z - 1.5], [x + 1.5, T_TOP + h, z + 1.5], "roccia")
// A stone hut: the walls are at different heights, the roof is gone.
box([-11, T_TOP, -4], [-10.4, T_TOP + 2.2, 2], "pietra")
box([-11, T_TOP, -4], [-8.5, T_TOP + 1.4, -3.4], "pietra")
box([-7, T_TOP, -4], [-5, T_TOP + 1.0, -3.4], "pietra")
box([-5.6, T_TOP, -1], [-5, T_TOP + 2.6, 2], "pietra")
box([-11, T_TOP, 1.4], [-9, T_TOP + 2.0, 2], "pietra")
box([-6.5, T_TOP, 1.4], [-5, T_TOP + 2.0, 2], "pietra")
// Abandoned ammo crates.
box([12, T_TOP, 9], [13.4, T_TOP + 1.0, 10.4], "legno", "cassa")
box([-14, T_TOP, -11], [-12.6, T_TOP + 1.0, -9.6], "legno", "cassa")

// --- command buildings ------------------------------------------------------------------
const buildings: Building[] = [
  { name: "Comant talian", min: [12, T_FLOOR, 86], max: [21, 3.6, 91], mat: "intonacoBianco", roof: "piano" },
  { name: "Kommando", min: [-21, T_FLOOR, -91], max: [-12, 3.6, -86], mat: "intonacoGiallo", roof: "falde" }
]

// --- game ------------------------------------------------------------------------------

const spawns: Record<Team, readonly Spawn[]> = {
  benandanti: [
    { at: [-20, T_FLOOR, 80], yaw: 0 },
    { at: [-8, T_FLOOR, 84], yaw: 0 },
    { at: [4, T_FLOOR, 80], yaw: 0 },
    { at: [-12, T_FLOOR, 88], yaw: 0 },
    { at: [20, T_FLOOR, 80], yaw: 0 },
    { at: [4, T_FLOOR, 90], yaw: 0 },
    { at: [-2, T_FLOOR, 78], yaw: 0 },
    { at: [16, T_FLOOR, 78], yaw: 0 }
  ],
  malandanti: [
    { at: [-20, T_FLOOR, -80], yaw: Math.PI },
    { at: [-8, T_FLOOR, -84], yaw: Math.PI },
    { at: [4, T_FLOOR, -80], yaw: Math.PI },
    { at: [12, T_FLOOR, -86], yaw: Math.PI },
    { at: [20, T_FLOOR, -80], yaw: Math.PI },
    { at: [-4, T_FLOOR, -90], yaw: Math.PI },
    { at: [-2, T_FLOOR, -78], yaw: Math.PI },
    { at: [-16, T_FLOOR, -78], yaw: Math.PI }
  ]
}

const pickups: PickupSpot[] = [
  { kind: "frico", at: [-26.7, T_FLOOR, 50] },
  { kind: "frico", at: [26.7, T_FLOOR, 50] },
  { kind: "frico", at: [-26.7, T_FLOOR, -50] },
  { kind: "frico", at: [26.7, T_FLOOR, -50] },
  { kind: "gubane", at: [-38, T_FLOOR, 40.3] },
  { kind: "gubane", at: [38, T_FLOOR, -40.3] },
  { kind: "sgnape", at: [0, T_FLOOR, 60] },
  { kind: "sgnape", at: [0, T_FLOOR, -60] },
  { kind: "munizions", at: [-15, T_FLOOR, 80] },
  { kind: "munizions", at: [15, T_FLOOR, 80] },
  { kind: "munizions", at: [-15, T_FLOOR, -80] },
  { kind: "munizions", at: [15, T_FLOOR, -80] },
  { kind: "lanciafrico", at: [-8, T_TOP, -1] }
]

const navPoints: V3[] = []
{
  const F = T_FLOOR
  for (const s of [1, -1]) {
    // Front line (on the back walkway, away from the fire step).
    for (let x = -40; x <= 40; x += 8) navPoints.push([x, F, 40.3 * s])
    // Communication trenches.
    for (const z of [46, 58, 70]) navPoints.push([0, F, z * s])
    for (const x of [-26.7, 26.7]) navPoints.push([x, F, 50 * s], [x, F, 59.3 * s])
    for (const x of [-20.7, 20.7]) navPoints.push([x, F, 66 * s], [x, F, 74 * s])
    // Tops of the side ramps.
    for (const x of [-32, 32]) navPoints.push([x, T_TOP, 27 * s])
    // Reserve pit.
    for (const x of [-18, 0, 18]) navPoints.push([x, F, 79 * s])
  }
  navPoints.push([-18, F, 89], [0, F, 89], [8, F, 89], [0, F, 96])
  navPoints.push([-8, F, -89], [4, F, -89], [13, F, -88], [22, F, -88], [13, F, -93.5], [16.5, F, -93.5], [16.5, F, -97])
  // No man's land.
  for (const x of [-36, -24, -12, 0, 12, 24, 36]) for (const z of [28, 14, 0, -14, -28]) navPoints.push([x, T_TOP, z])
  navPoints.push([-8, T_TOP, -1])
}

/**
 * The Decauville railway: from the Italian pit along the central communication trench, up
 * the ramp, across no man's land and down into the Austrian front line.
 */
const track: V3[] = [
  [0, T_FLOOR, 88],
  [0, T_FLOOR, 38],
  [0, T_TOP, 30],
  [0, T_TOP, -30],
  [0, T_FLOOR, -38],
  [0, T_FLOOR, -40]
]

export const TRINCEE = defineMap({
  id: "trincee",
  bounds: BOUNDS,
  blocks,
  wedges,
  buildings,
  walls: { bottom: BOTTOM, top: 40 },
  jumpPads: [],
  spawns,
  flagBases: { benandanti: [0, T_FLOOR, 97], malandanti: [16.5, T_FLOOR, -97.5] },
  hill: { at: [-2, T_TOP, 0], radius: 8 },
  pickups,
  navPoints,
  track,
  killY: -10,
  turrets: [
    { at: [-1, T_FLOOR, 87], yaw: 0 },
    { at: [-1, T_FLOOR, -87], yaw: Math.PI }
  ],
  doors: []
})
