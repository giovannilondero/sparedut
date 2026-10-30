/**
 * Lagune di Maran: la riserve naturâl des Focis dal Stele, tra lis barenis e i canâi de
 * lagune di Maran.
 *
 * A nord, su la tiere sute, la foresterie de riserve: pian tiere cul salon, la cusine e
 * i bagns; prin plan cu lis grandis cameradis e i bagns; il tet plan si cjamine (e al à
 * une torete cu la mitraie). Une scjale dople e va sù dal pian tiere al prin plan e po
 * sul tet. Tal mieç l'arzin che al cor di nord a sud, cu lis passerelis di len che lu
 * leghin a lis barenis. Su la isule a est il casot di osservazion: la puarte e je sierade
 * e si à di sfondâle, dentri e je la discoteche dai fenicotars. A sud i casons dai
 * pescjadôrs. Dapardut la aghe e je basse: si va a vuat (al tache sul zenoli).
 *
 * Assi: x viers est, y in alt, z viers sud. Metris.
 */
import { defineMap, type Block, type Mat, type PickupSpot, type Spawn, type Team, type V3, type Wedge } from "../map.ts"

/** Tiere sute, font de lagune (si cjamine a vuat), pel de aghe (dome par dissegnâ). */
export const LAND = 0
export const SEA = -0.45
export const WATER = -0.12
const BOTTOM = -3

const BOUNDS = { minX: -70, maxX: 70, minZ: -105, maxZ: 105 } as const

const blocks: Block[] = []
const box = (min: V3, max: V3, mat: Mat, look?: Block["look"]) => {
  blocks.push(look ? { min, max, mat, look } : { min, max, mat })
}

/** Un'apertura in un muro, lungo il lato lungo: da `a0` a `a1`, da `y0` a `y1`. */
interface Hole {
  readonly a0: number
  readonly a1: number
  readonly y0: number
  readonly y1: number
}

/** Le aperture dei muri (porte e finestre), per le cornici che disegna il client. */
export const OPENINGS: { readonly min: V3; readonly max: V3; readonly mat: Mat; readonly door: boolean; readonly alongX: boolean }[] = []

/**
 * Un muro con porte e finestre: si spezza in blocchi pieni fra le aperture, più
 * davanzale e architrave sopra e sotto ognuna.
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

// --- Tiere e aghe ----------------------------------------------------------------------

/** Lis tieris sutis: la tiere a nord, l'arzin, lis barenis, la isule dal casot, il borc dai casons. */
export const LANDS: readonly { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number; readonly mat: Mat }[] = [
  { minX: BOUNDS.minX, maxX: BOUNDS.maxX, minZ: BOUNDS.minZ, maxZ: -48, mat: "erba" },
  { minX: -6, maxX: 6, minZ: -48, maxZ: 62, mat: "terra" },
  { minX: -58, maxX: -24, minZ: -32, maxZ: 18, mat: "erba" },
  { minX: 26, maxX: 62, minZ: 10, maxZ: 46, mat: "erba" },
  { minX: -40, maxX: -30, minZ: 34, maxZ: 44, mat: "erba" },
  { minX: 22, maxX: 32, minZ: -34, maxZ: -24, mat: "erba" },
  { minX: BOUNDS.minX, maxX: BOUNDS.maxX, minZ: 62, maxZ: BOUNDS.maxZ, mat: "erba" }
]
box([BOUNDS.minX, BOTTOM, BOUNDS.minZ], [BOUNDS.maxX, SEA, BOUNDS.maxZ], "terra", "terreno")
for (const l of LANDS) box([l.minX, BOTTOM, l.minZ], [l.maxX, LAND, l.maxZ], l.mat, "terreno")

/** Lis passerelis di len sore la aghe, a râs de tiere (i scjalins bas a fermin il character controller). */
export const BOARDWALK_Y = LAND
export const BOARDWALKS: readonly { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }[] = [
  { minX: -24, maxX: -6, minZ: -6, maxZ: -3.6 },
  { minX: 6, maxX: 26, minZ: 22, maxZ: 24.4 },
  { minX: 40, maxX: 42.4, minZ: -48, maxZ: 10 },
  { minX: -42, maxX: -39.6, minZ: -48, maxZ: -32 }
]
for (const w of BOARDWALKS) box([w.minX, SEA, w.minZ], [w.maxX, BOARDWALK_Y, w.maxZ], "legno")

// --- La foresterie --------------------------------------------------------------------

/** La foresterie: muri esterni, solai (prin plan e tet), scjalis. */
export const FORESTERIE = { minX: -20, maxX: 20, minZ: -82, maxZ: -64, t: 0.4, f1: 4, roof: 8, slab: 0.4, parapet: 1.1 } as const
/** Lis dôs rampis de scjale: la prime dal pian tiere al prin plan, la seconde fin sul tet. */
export const STAIRS = {
  first: { x0: 16.6, x1: 19.6 },
  second: { x0: 13, x1: 16 },
  z0: -76,
  z1: -66
} as const
const wedges: Wedge[] = [
  { x0: STAIRS.first.x0, x1: STAIRS.first.x1, z0: STAIRS.z0, z1: STAIRS.z1, y0: FORESTERIE.f1, y1: LAND, mat: "legno" },
  { x0: STAIRS.second.x0, x1: STAIRS.second.x1, z0: STAIRS.z0, z1: STAIRS.z1, y0: FORESTERIE.f1, y1: FORESTERIE.roof, mat: "legno" }
]
{
  const { minX, maxX, minZ, maxZ, t, f1, roof } = FORESTERIE
  const s1 = f1 - FORESTERIE.slab
  const s2 = roof - FORESTERIE.slab
  const door = (a0: number, a1: number, y0 = 0): Hole => ({ a0, a1, y0, y1: y0 + 2.6 })
  const win = (a0: number, a1: number, y0: number, y1: number): Hole => ({ a0, a1, y0, y1 })
  const mat: Mat = "intonacoBianco"
  // Muri esterni, a plomp fin sul tet.
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

  // Pian tiere: salon (ovest), cusine (nord-est), bagns (sud-est), la sale de scjale (est).
  wall([2, 0, minZ + t], [2.4, s1, maxZ - t], mat, [door(-79, -77.5), door(-70, -68.5)])
  wall([2.4, 0, -73.4], [12.6, s1, -73], mat)
  wall([12.6, 0, minZ + t], [13, s1, maxZ - t], mat, [door(-79, -77.5), door(-69, -67.5)])
  // il mûr fra lis dôs rampis
  box([16, 0, STAIRS.z0], [16.6, f1 + 1.2, STAIRS.z1], mat)
  // i cabinets dai bagns
  for (const x of [4.6, 6.6, 8.6, 10.6]) box([x, 0, -73], [x + 0.1, 2.1, -70.8], "legno")
  // cusine: bancons tor dal mûr e la isule tal mieç
  box([3, 0, minZ + t], [12.2, 0.95, -80.9], "legno")
  box([6, 0, -77.4], [9.5, 0.95, -76.2], "legno")
  // salon: dôs taulis lungjis e il fogolâr
  box([-16, 0, -80], [-15, 0.8, -74], "legno")
  box([-4, 0, -80], [-3, 0.8, -74], "legno")
  box([-19.6, 0, -69.5], [-18.6, 1.2, -67], "pietra")

  // Prin plan: il solâr (cul bûs de scjale), il coridôr a nord, dôs cameradis e i bagns.
  box([minX + t, s1, minZ + t], [STAIRS.second.x0, f1, maxZ - t], "legno")
  box([STAIRS.second.x0, s1, minZ + t], [maxX - t, f1, STAIRS.z0], "legno")
  box([STAIRS.second.x0, s1, STAIRS.z1], [maxX - t, f1, maxZ - t], "legno")
  wall([minX + t, f1, -78], [12.6, s2, -77.6], mat, [door(-14, -12.5, f1), door(-1, 0.5, f1), door(8, 9.5, f1)])
  wall([-6, f1, -77.6], [-5.6, s2, maxZ - t], mat)
  wall([6, f1, -77.6], [6.4, s2, maxZ - t], mat)
  wall([12.6, f1, -77.6], [13, s2, maxZ - t], mat)
  for (const x of [8.6, 10.6]) box([x, f1, maxZ - t - 2.2], [x + 0.1, f1 + 2.1, maxZ - t], "legno")
  // i jets a cjast, in file sui doi lâts lungs (la cuciete parsore le dissegne il client)
  for (const [x0, x1] of [[-19.6, -6], [-5.6, 6]] as const) {
    for (let x = x0 + 0.4; x + 0.9 <= x1 - 0.3; x += 1.9) {
      box([x, f1, maxZ - t - 2], [x + 0.9, f1 + 0.6, maxZ - t], "legno")
      // a nord si lasse libare la puarte
      const doorX = x0 < -6 ? [-14, -12.5] : [-1, 0.5]
      if (x + 0.9 < doorX[0] - 0.6 || x > doorX[1] + 0.6) box([x, f1, -77.6], [x + 0.9, f1 + 0.6, -75.6], "legno")
    }
  }

  // Il tet plan: si cjamine, cul parapet ator e la ringhiere tor dal bûs de seconde rampe.
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

// --- Il casot di osservazion ---------------------------------------------------------------

/** Il casot su la isule a est: si jentre dome sfondant la puarte a ovest. */
export const CASOT = { minX: 40, maxX: 52, minZ: 22, maxZ: 32, floor: LAND, top: 3.4, t: 0.3 } as const
/** Il scjalin di len sot dai balcons (si cjale fûr pes fressuris); il cjoc al dûr cul cjâf parsore. */
export const SCJALIN = { minX: 49.8, maxX: CASOT.maxX - CASOT.t, minZ: CASOT.minZ + CASOT.t, maxZ: CASOT.maxZ - CASOT.t, top: CASOT.floor + 0.35 } as const
/** La pignate de bire. */
export const PIGNATE = { minX: 47.4, maxX: 48.4, minZ: 28.8, maxZ: 29.8, top: CASOT.floor + 0.65 } as const
/** Dulà che e sune la musiche: la bale di spieli tal mieç dal casot. */
export const DISCO: V3 = [44, 2.7, 27]
/** La fressure par cjalâ i ucei: strete, si spare ma no si passe. */
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

// --- Casons dai pescjadôrs, ripars --------------------------------------------------------

/** I casons: mûrs di cane e tet di pae fin cuasi par tiere (il client ju dissegne). */
export const CASONS: readonly { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }[] = [
  { minX: -34, maxX: -26, minZ: 70, maxZ: 76 },
  { minX: 24, maxX: 32, minZ: 74, maxZ: 80 },
  { minX: -14, maxX: -8, minZ: 84, maxZ: 92 },
  { minX: 40, maxX: 48, minZ: 88, maxZ: 94 },
  { minX: -52, maxX: -44, minZ: -10, maxZ: -4 }
]
export const CASON_TOP = 3.8
for (const c of CASONS) box([c.minX, LAND, c.minZ], [c.maxX, LAND + CASON_TOP, c.maxZ], "invisibile")

// Ballis di cane su l'arzin (il cjar al passe tal mieç), cassis di pes, la cjarbonere.
for (const [x, z] of [[-4, -20], [2.5, -30], [-4, 30], [2.5, 40], [2.5, 4], [-4, 14]] as const) box([x, LAND, z], [x + 1.5, LAND + 1.2, z + 1.5], "fen")
for (const [x, z] of [[-40, -62], [36, -58], [-46, 6], [52, 40], [14, 70], [-40, 90], [55, 75]] as const) box([x, LAND, z], [x + 3, LAND + 1.3, z + 2.4], "legno", "cassa")
// I sacs de torete dal borc.
box([-19.5, LAND, 62.2], [-16.5, LAND + 0.9, 62.8], "sacs")

// --- Zûc -------------------------------------------------------------------------------------

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
  // Il premi par cui che al sfonde la puarte dal casot.
  { kind: "lanciafrico", at: [44.5, CASOT.floor, 27] }
]

const F = FORESTERIE
const B = BOARDWALK_Y
const navPoints: V3[] = [
  // Tiere a nord
  [-60, LAND, -95], [-35, LAND, -95], [-10, LAND, -95], [10, LAND, -95], [35, LAND, -95], [60, LAND, -95],
  [-60, LAND, -75], [-35, LAND, -75], [-24, LAND, -73], [24, LAND, -73], [35, LAND, -75], [60, LAND, -75],
  [-60, LAND, -55], [-35, LAND, -55], [-20, LAND, -58], [-9.5, LAND, -60], [0, LAND, -54], [14.5, LAND, -60], [24, LAND, -58], [35, LAND, -55], [60, LAND, -55],
  [-40.8, LAND, -51], [41.2, LAND, -51],
  // Foresterie: pian tiere
  [-9.5, LAND, -66.5], [-9.5, LAND, -73], [-9.5, LAND, -79], [-17.6, LAND, -73], [-17.6, LAND, -79], [0, LAND, -78.2], [0, LAND, -69.2],
  [4, LAND, -78.3], [11, LAND, -78.3], [5, LAND, -69.2], [11, LAND, -68.2],
  [15, LAND, -78.3], [14.5, LAND, -70], [14.5, LAND, -65.3], [18.1, LAND, -65.3],
  // scjalis e prin plan
  [18.1, F.f1, -77.5], [14.5, F.f1, -77.5],
  [-16, F.f1, -79.6], [-5, F.f1, -79.6], [5, F.f1, -79.6], [10, F.f1, -79.6], [-13.25, F.f1, -79.6], [-0.25, F.f1, -79.6], [8.75, F.f1, -79.6],
  [-13.25, F.f1, -76.6], [-13, F.f1, -71], [-0.25, F.f1, -76.6], [0, F.f1, -71], [8.75, F.f1, -76.6], [9.5, F.f1, -71],
  // tet
  [14.5, F.roof, -65.2], [5, F.roof, -66], [-10, F.roof, -66], [-10, F.roof, -78], [5, F.roof, -78], [18.2, F.roof, -65.2], [18.2, F.roof, -75],
  // Arzin e passerelis
  [0, LAND, -46], [0, LAND, -30], [0, LAND, -14], [0, LAND, 0], [0, LAND, 14], [0, LAND, 30], [0, LAND, 46], [0, LAND, 60],
  [4.5, LAND, -24], [-4.5, LAND, 8], [4.5, LAND, 23.2], [-4.5, LAND, -4.8],
  [8, B, 23.2], [16, B, 23.2], [24, B, 23.2],
  [-8, B, -4.8], [-16, B, -4.8], [-22, B, -4.8],
  [41.2, B, -44], [41.2, B, -30], [41.2, B, -16], [41.2, B, -2], [41.2, B, 8],
  [-40.8, B, -45], [-40.8, B, -35],
  // Barene a ovest
  [-28, LAND, -4.8], [-40.8, LAND, -29], [-35, LAND, -18], [-35, LAND, 5], [-50, LAND, 12], [-55, LAND, -20], [-46, LAND, -15], [-40, LAND, 15],
  // Isule dal casot (fûr)
  [30, LAND, 23.2], [34, LAND, 14], [41.2, LAND, 13], [34, LAND, 40], [37, LAND, 27], [46, LAND, 16], [46, LAND, 38], [57, LAND, 27], [57, LAND, 14], [57, LAND, 40],
  // Isulis piçulis e aghe
  [-35, LAND, 39], [27, LAND, -29],
  [-15, SEA, -30], [-15, SEA, 30], [15, SEA, -20], [15, SEA, 0], [20, SEA, 45], [-20, SEA, 50], [-45, SEA, 40], [-60, SEA, 30],
  [-62, SEA, -40], [55, SEA, -20], [62, SEA, 0], [50, SEA, 55], [-24, SEA, -40], [24, SEA, -42], [-48, SEA, 52],
  // Borc dai casons a sud
  [-60, LAND, 70], [-45, LAND, 66], [-20, LAND, 68], [-4, LAND, 68], [0, LAND, 76], [16, LAND, 68], [36, LAND, 68], [60, LAND, 70],
  [-50, LAND, 85], [-30, LAND, 84], [-20, LAND, 96], [-4, LAND, 88], [10, LAND, 96], [20, LAND, 88], [36, LAND, 84], [55, LAND, 85],
  [60, LAND, 100], [-60, LAND, 100], [0, LAND, 98], [36, LAND, 100]
]

/** Il cjar: de foresterie jù pal arzin fin tal borc dai casons. */
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
  /** Il frico dai Benandants tal salon de foresterie, chel dai Malandants dongje de cavane. */
  flagBases: { benandanti: [-9.5, LAND, -70], malandanti: [0, LAND, 94] },
  /** Il mieç dal arzin. */
  hill: { at: [0, LAND, 8], radius: 7.5 },
  pickups,
  navPoints,
  track,
  killY: -10,
  turrets: [
    { at: [0, FORESTERIE.roof, -65.2], yaw: Math.PI },
    { at: [-18, LAND, 63.6], yaw: 0 }
  ],
  doors: [{ name: "Puarte dal casot", min: [CASOT.minX + 0.05, CASOT.floor, DOOR.z0], max: [CASOT.minX + 0.25, DOOR.top, DOOR.z1], hp: 150 }]
})
