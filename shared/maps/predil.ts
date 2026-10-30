/**
 * Cave dal Predil: la miniere di plomp e zinc di Raibl, in te valade strete sot dai
 * crets des Alps Juliis.
 *
 * Tre gradons, di nord a sud: in alt (6) il plaçâl de miniere cul ingrès de galarie
 * (un anel sot la mont cun dôs jessudis) e lis cjasis dai uficis; tal mieç (3) il
 * plaçâl dal Poç Clara cul castelut di aciâr e la laverie cul pian tiere viert; in bas
 * (0) il borc dai minadôrs e la glesie di Sante Barbare. I binaris dai carei a vegnin
 * fûr de galarie e a van jù fin tal borc: il cjar di Spingi il Cjar al cor su di lôr.
 *
 * Assi: x viers est, y in alt, z viers sud. Metris.
 */
import { defineMap, type Block, type Building, type Mat, type PickupSpot, type Spawn, type Team, type V3, type Wedge } from "../map.ts"

export const P_UP = 6
export const P_MID = 3
export const P_LOW = 0
const BOTTOM = -3

const BOUNDS = { minX: -45, maxX: 45, minZ: -105, maxZ: 110 } as const

const blocks: Block[] = []
const box = (min: V3, max: V3, mat: Mat, look?: Block["look"]) => {
  blocks.push(look ? { min, max, mat, look } : { min, max, mat })
}

// --- Gradons e rampis -----------------------------------------------------------
box([BOUNDS.minX, BOTTOM, BOUNDS.minZ], [BOUNDS.maxX, P_UP, -30], "terra", "terreno")
box([BOUNDS.minX, BOTTOM, -30], [BOUNDS.maxX, P_MID, 30], "terra", "terreno")
box([BOUNDS.minX, BOTTOM, 30], [BOUNDS.maxX, P_LOW, BOUNDS.maxZ], "terra", "terreno")

const wedges: Wedge[] = []
for (const [x0, x1] of [[-22, -14], [-6, 6], [28, 36]] as const) wedges.push({ x0, x1, z0: -30, z1: -22, y0: P_UP, y1: P_MID, mat: "terra" })
for (const [x0, x1] of [[-30, -22], [-6, 6], [28, 36]] as const) wedges.push({ x0, x1, z0: 30, z1: 38, y0: P_MID, y1: P_LOW, mat: "terra" })

// --- La mont e la galarie --------------------------------------------------------
/** La mont sore la galarie: roccie fin a `top`, galariis alte fin a `ceiling`. */
export const MONT = { minX: BOUNDS.minX, maxX: -10, minZ: -98, maxZ: -55, floor: P_UP, ceiling: P_UP + 3.4, top: P_UP + 10 } as const
/** I corridôrs de galarie: un anel e dôs jessudis (a est e a sud). */
export const GALARIE: readonly { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }[] = [
  { x0: -40, x1: -14, z0: -94, z1: -90 },
  { x0: -40, x1: -14, z0: -72, z1: -68 },
  { x0: -40, x1: -36, z0: -94, z1: -68 },
  { x0: -18, x1: -14, z0: -94, z1: -68 },
  { x0: -14, x1: -10, z0: -84, z1: -80 },
  { x0: -29, x1: -25, z0: -68, z1: -55 }
]
{
  // Si tae la mont in celis lis ôrs dai corridôrs: lis celis plenis a son roccie fin in
  // alt, chês vueidis a àn la volte de galarie. Lis celis compagnis si unissin par riis.
  const xs = [...new Set([MONT.minX, MONT.maxX, ...GALARIE.flatMap((g) => [g.x0, g.x1])])].sort((a, b) => a - b)
  const zs = [...new Set([MONT.minZ, MONT.maxZ, ...GALARIE.flatMap((g) => [g.z0, g.z1])])].sort((a, b) => a - b)
  const open = (x: number, z: number) => GALARIE.some((g) => x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1)
  for (let j = 0; j < zs.length - 1; j++) {
    const z0 = zs[j], z1 = zs[j + 1], zc = (z0 + z1) / 2
    let i = 0
    while (i < xs.length - 1) {
      const state = open((xs[i] + xs[i + 1]) / 2, zc)
      let k = i + 1
      while (k < xs.length - 1 && open((xs[k] + xs[k + 1]) / 2, zc) === state) k++
      if (state) box([xs[i], MONT.ceiling, z0], [xs[k], MONT.top, z1], "roccia", "copertura")
      else box([xs[i], MONT.floor, z0], [xs[k], MONT.top, z1], "roccia")
      i = k
    }
  }
}
// Il cret a nord, sore dut il plaçâl.
box([BOUNDS.minX, P_UP, BOUNDS.minZ], [BOUNDS.maxX, P_UP + 24, -98], "roccia")

// --- Edificis --------------------------------------------------------------------
/** Lis laveriis: pian tiere viert su pilastris, sore il capanon. */
export const LAVERIE = [
  { minX: 24, maxX: 45, minZ: -16, maxZ: 26, floor: P_MID, slab: 4.6, top: 14, rows: [-16, -8, 0, 8, 16, 25.2] },
  { minX: 24, maxX: 45, minZ: 44, maxZ: 74, floor: P_LOW, slab: 4.6, top: 16, rows: [44, 50, 56, 62, 68, 73.2] }
] as const

const buildings: Building[] = [
  { name: "Uficis de Miniere", min: [28, P_UP, -92], max: [45, P_UP + 10, -62], mat: "intonacoOcra", roof: "falde" },
  { name: "Magazin dai minadôrs", min: [-45, P_MID, -14], max: [-30, P_MID + 9, 14], mat: "intonacoBianco", roof: "falde" },
  { name: "Cjasis dai minadôrs (nord)", min: [-45, P_LOW, 44], max: [-12, P_LOW + 10, 60], mat: "intonacoBianco", roof: "falde" },
  { name: "Cjasis dai minadôrs (sud)", min: [-45, P_LOW, 68], max: [-12, P_LOW + 10, 84], mat: "intonacoOcra", roof: "falde" },
  { name: "Ostarie di Raibl", min: [10, P_LOW, 78], max: [22, P_LOW + 9, 92], mat: "intonacoOcra", roof: "falde" },
  { name: "Cjase dal diretôr", min: [28, P_LOW, 80], max: [45, P_LOW + 10, 96], mat: "intonacoBianco", roof: "falde" },
  { name: "Glesie di Sante Barbare", min: [-7, P_LOW, 100], max: [7, P_LOW + 11, 110], mat: "pietra", roof: "falde" }
]
for (const l of LAVERIE) {
  const y = l.floor
  buildings.push({ name: "Laverie", min: [l.minX, y + l.slab + 0.4, l.minZ], max: [l.maxX, y + l.top, l.maxZ], mat: "intonacoBianco", roof: "falde" })
  // il sofit sot dal capanon e i pilastris di aciâr
  box([l.minX, y + l.slab, l.minZ], [l.maxX, y + l.slab + 0.4, l.maxZ], "pietra", "copertura")
  for (const x of [l.minX, 34, l.maxX - 0.8]) for (const z of l.rows) box([x, y, z], [x + 0.8, y + l.slab, z + 0.8], "ferro")
}
// Lis machinis de laverie (frantoi e crivei): ripars bas.
box([31, P_MID, -6], [37, P_MID + 2.2, -2], "ferro")
box([31, P_MID, 10], [37, P_MID + 2.2, 14], "ferro")
box([31, P_LOW, 51.5], [37, P_LOW + 2.2, 55.5], "ferro")

// --- Poç Clara: la sale dai argagns sot dal castelut -----------------------------
/** Il bloc che al ten sù il castelut (il client lu dissegne di modon, il traliç parsore). */
export const POC = { minX: 12, maxX: 20, minZ: -6, maxZ: 2, floor: P_MID, height: 6, tower: 21 } as const
box([POC.minX, POC.floor, POC.minZ], [POC.maxX, POC.floor + POC.height, POC.maxZ], "invisibile")

// --- Tramoggia sui pîts, carei, cassis --------------------------------------------
/** La tramoggia dal minerâl: si passe sot. */
export const TRAMOGGE = { minX: -38, maxX: -30, minZ: -48, maxZ: -40, floor: P_UP, under: 2, top: 5 } as const
{
  const t = TRAMOGGE
  box([t.minX, t.floor + t.under, t.minZ], [t.maxX, t.floor + t.top, t.maxZ], "ferro")
  for (const x of [t.minX, t.maxX - 0.4]) for (const z of [t.minZ, t.maxZ - 0.4]) box([x, t.floor, z], [x + 0.4, t.floor + t.under, z + 0.4], "legno")
}
/** I carei fers (il client ju dissegne; chi a son dome lis scjatulis che a tocjin). */
export const CAREI: readonly { readonly min: V3; readonly max: V3 }[] = [
  { min: [14, P_UP, -60], max: [15.4, P_UP + 1.4, -57.6] },
  { min: [-12, P_MID, 4], max: [-10.6, P_MID + 1.4, 6.4] },
  { min: [4, P_MID, 16], max: [6.4, P_MID + 1.4, 17.4] },
  { min: [6, P_LOW, 44], max: [7.4, P_LOW + 1.4, 46.4] }
]
for (const c of CAREI) box(c.min, c.max, "invisibile")

box([8, P_UP, -50], [11, P_UP + 1.3, -47], "legno", "cassa")
box([20, P_UP, -40], [23, P_UP + 1.4, -37], "legno", "cassa")
box([-12, P_UP, -36], [-9, P_UP + 1.3, -33], "legno", "cassa")
box([38, P_UP, -52], [41, P_UP + 1.4, -49], "legno", "cassa")
box([-18, P_MID, -14], [-15, P_MID + 1.3, -11], "legno", "cassa")
box([-9, P_MID, 20], [-6, P_MID + 1.3, 23], "legno", "cassa")
box([4, P_LOW, 56], [7, P_LOW + 1.3, 59], "legno", "cassa")
box([-10, P_LOW, 72], [-7.5, P_LOW + 1.3, 74.5], "legno", "cassa")
// Tetis no calpestabii: sore lis laveriis e lis cjasis.
box([24, P_MID + 14, -16], [45, P_MID + 26, 26], "invisibile")

// --- Zûc ----------------------------------------------------------------------------

const spawns: Record<Team, readonly Spawn[]> = {
  benandanti: [
    { at: [-4, P_UP, -90], yaw: Math.PI },
    { at: [8, P_UP, -88], yaw: Math.PI },
    { at: [20, P_UP, -86], yaw: Math.PI },
    { at: [8, P_UP, -74], yaw: Math.PI },
    { at: [20, P_UP, -70], yaw: Math.PI },
    { at: [-4, P_UP, -72], yaw: Math.PI },
    { at: [4, P_UP, -58], yaw: Math.PI },
    { at: [24, P_UP, -56], yaw: Math.PI }
  ],
  malandanti: [
    { at: [-6, P_LOW, 86], yaw: 0 },
    { at: [6, P_LOW, 86], yaw: 0 },
    { at: [-14, P_LOW, 94], yaw: 0 },
    { at: [14, P_LOW, 98], yaw: 0 },
    { at: [25, P_LOW, 86], yaw: 0 },
    { at: [36, P_LOW, 102], yaw: 0 },
    { at: [-30, P_LOW, 92], yaw: 0 },
    { at: [-38, P_LOW, 100], yaw: 0 }
  ]
}

const pickups: PickupSpot[] = [
  { kind: "frico", at: [-27, P_UP, -92] },
  { kind: "frico", at: [-26, P_MID, 16] },
  { kind: "frico", at: [29, P_MID, 4] },
  { kind: "frico", at: [-30, P_LOW, 64] },
  { kind: "gubane", at: [36, P_UP, -44] },
  { kind: "gubane", at: [16, P_LOW, 62] },
  { kind: "sgnape", at: [0, P_MID, -12] },
  { kind: "sgnape", at: [0, P_LOW, 70] },
  { kind: "munizions", at: [-14, P_UP, -48] },
  { kind: "munizions", at: [24, P_UP, -48] },
  { kind: "munizions", at: [-26, P_LOW, 40] },
  { kind: "munizions", at: [42, P_LOW, 40] },
  { kind: "lanciafrico", at: [16, P_MID, 8] }
]

const navPoints: V3[] = [
  // Galarie
  [-38, P_UP, -92], [-27, P_UP, -92], [-16, P_UP, -92], [-38, P_UP, -81], [-16, P_UP, -82],
  [-38, P_UP, -70], [-27, P_UP, -70], [-16, P_UP, -70], [-12, P_UP, -82], [-27, P_UP, -62],
  // Plaçâl alt
  [-5, P_UP, -82], [-5, P_UP, -94], [8, P_UP, -94], [22, P_UP, -94], [36, P_UP, -95], [8, P_UP, -80], [22, P_UP, -78],
  [-5, P_UP, -66], [8, P_UP, -64], [22, P_UP, -62], [36, P_UP, -56],
  [-27, P_UP, -50], [-42, P_UP, -52], [-14, P_UP, -48], [0, P_UP, -48], [14, P_UP, -42], [24, P_UP, -48], [36, P_UP, -44],
  [-42, P_UP, -35], [-27, P_UP, -37], [-18, P_UP, -32], [0, P_UP, -32], [32, P_UP, -32],
  // Plaçâl dal Poç
  [-18, P_MID, -19], [0, P_MID, -19], [32, P_MID, -19], [-38, P_MID, -19],
  [-26, P_MID, -6], [-26, P_MID, 8], [-26, P_MID, 22], [-38, P_MID, 20],
  [-12, P_MID, -10], [-14, P_MID, 14], [0, P_MID, -6], [0, P_MID, 8], [8, P_MID, -12], [16, P_MID, -12], [8, P_MID, 12], [16, P_MID, 10], [22, P_MID, -4],
  [29, P_MID, -12], [39, P_MID, -12], [29, P_MID, 4], [39, P_MID, 4], [29, P_MID, 20], [39, P_MID, 20],
  [0, P_MID, 27], [-26, P_MID, 27], [32, P_MID, 28],
  // Borc
  [0, P_LOW, 40], [-26, P_LOW, 40], [32, P_LOW, 40], [-40, P_LOW, 40], [42, P_LOW, 40],
  [0, P_LOW, 52], [0, P_LOW, 66], [0, P_LOW, 80], [-6, P_LOW, 92],
  [-30, P_LOW, 64], [-40, P_LOW, 64], [-10, P_LOW, 64], [16, P_LOW, 48], [16, P_LOW, 62], [16, P_LOW, 74], [25, P_LOW, 86], [16, P_LOW, 98], [36, P_LOW, 100],
  [-14, P_LOW, 96], [-30, P_LOW, 92], [36, P_LOW, 77],
  [29, P_LOW, 47], [39, P_LOW, 47], [29, P_LOW, 65], [39, P_LOW, 65]
]

/**
 * I binaris dal cjar: fûr de jessude a sud de galarie, a traviers il plaçâl alt, jù
 * pe rampe tal plaçâl dal Poç e ancjemò jù fin tal borc, denant de glesie.
 */
const track: V3[] = [
  [-27, P_UP, -64],
  [-27, P_UP, -50],
  [-10, P_UP, -42],
  [0, P_UP, -36],
  [0, P_UP, -30],
  [0, P_MID, -22],
  [0, P_MID, 30],
  [0, P_LOW, 38],
  [0, P_LOW, 88]
]

export const PREDIL = defineMap({
  id: "predil",
  bounds: BOUNDS,
  blocks,
  wedges,
  buildings,
  walls: { bottom: BOTTOM, top: 40 },
  jumpPads: [],
  spawns,
  /** Il frico dai Benandants tal fonts de galarie, chel dai Malandants denant de glesie. */
  flagBases: { benandanti: [-38, P_UP, -80], malandanti: [0, P_LOW, 96] },
  /** Il plaçâl sot dal castelut dal Poç Clara. */
  hill: { at: [0, P_MID, 8], radius: 7.5 },
  pickups,
  navPoints,
  track,
  killY: -10,
  turrets: [
    { at: [14, P_UP, -52], yaw: Math.PI },
    { at: [12, P_LOW, 70], yaw: 0 }
  ],
  doors: []
})
