/**
 * Vençon (Venzone): il borgo dentro le mura, rifatto pietra su pietra dopo il '76
 * come Gemona. Stilizzato ma fedele all'idea: la cinta con il camminamento e le
 * torri, due porte (San Genesio a nord, Porta di Sotto a sud) che sono anche
 * torri da cecchino, la via maestra che taglia il borgo, il Duomo di Sant'Andrea
 * col campanile staccato e la cappella tonda di San Michele (la cripta delle
 * mummie), la piazza con la fontana e il Palazzo Comunale gotico con la loggia.
 * Fuori dalle mura un anello di prato fra la cinta e il fossato.
 *
 * Tutto a quota 0, tranne il camminamento (6 m) e le cime delle porte (12 m).
 * Assi: x verso est, y in alto, z verso sud. Metri.
 */
import { defineMap, type Block, type Building, type JumpPad, type Mat, type PickupSpot, type Spawn, type Team, type V3, type Wedge } from "../map.ts"

const BOUNDS = { minX: -45, maxX: 45, minZ: -105, maxZ: 105 } as const

/** La cinta: faccia interna a ±35 (x) e ±95 (z), spessore 3 m, camminamento a 6 m. */
export const WALL = { inX: 35, outX: 38, inZ: 95, outZ: 98, walk: 6, parapet: 0.6, parapetH: 1.1, merlonH: 0.8 } as const
/** Le due porte-torri: passaggio a terra largo 5 m, camminamento attraverso, cima a 12 m. */
export const GATE = { halfX: 5, passHalf: 2.5, passH: 4.5, depthOut: 3, depthIn: 3, walkH: 2.5, top: 12 } as const
export const DUOMO = { minX: 8, maxX: 27, minZ: -82, maxZ: -48, height: 15 } as const
export const CAMPANILE = { minX: 30, maxX: 35, minZ: -66, maxZ: -61, height: 30 } as const
/** San Michele: tondo, raggio visibile 3.2 m (le collisioni sono tre scatole incrociate). */
export const SAN_MICHELE = { x: 24, z: -38, r: 3.2, height: 7 } as const
export const COMUNE = { minX: -24, maxX: -6, minZ: 58, maxZ: 72, loggiaX: -15, loggiaH: 5, roof: 12 } as const
export const CLOCK = { minX: -18, maxX: -14, minZ: 62, maxZ: 66, top: 21 } as const

const blocks: Block[] = []
const box = (min: V3, max: V3, mat: Mat, look?: Block["look"]) => {
  blocks.push(look ? { min, max, mat, look } : { min, max, mat })
}

// --- terreno: selciato dentro le mura, prato fuori -------------------------------------------
box([-WALL.outX, -3, -WALL.outZ], [WALL.outX, 0, WALL.outZ], "porfido", "terreno")
box([BOUNDS.minX, -3, BOUNDS.minZ], [-WALL.outX, 0, BOUNDS.maxZ], "erba", "terreno")
box([WALL.outX, -3, BOUNDS.minZ], [BOUNDS.maxX, 0, BOUNDS.maxZ], "erba", "terreno")
box([-WALL.outX, -3, BOUNDS.minZ], [WALL.outX, 0, -WALL.outZ], "erba", "terreno")
box([-WALL.outX, -3, WALL.outZ], [WALL.outX, 0, BOUNDS.maxZ], "erba", "terreno")

// --- la cinta -----------------------------------------------------------------------------
const { inX, outX, inZ, outZ, walk, parapet, parapetH, merlonH } = WALL
/** Merli veri (si collide, ci si ripara) lungo un parapetto, da `a` a `b` sull'asse lungo. */
function merlons(alongX: boolean, a: number, b: number, across0: number, across1: number) {
  const y0 = walk + parapetH
  for (let u = a + 0.6; u + 1.2 <= b - 0.3; u += 2.4) {
    if (alongX) box([u, y0, across0], [u + 1.2, y0 + merlonH, across1], "pietra")
    else box([across0, y0, u], [across1, y0 + merlonH, u + 1.2], "pietra")
  }
}
// Ovest ed est: tutta la lunghezza.
for (const s of [-1, 1] as const) {
  const x0 = s < 0 ? -outX : inX
  const x1 = s < 0 ? -inX : outX
  box([x0, 0, -outZ], [x1, walk, outZ], "pietra")
  const p0 = s < 0 ? -outX : outX - parapet
  const p1 = s < 0 ? -outX + parapet : outX
  box([p0, walk, -outZ], [p1, walk + parapetH, outZ], "pietra", "parapetto")
  merlons(false, -outZ, outZ, p0, p1)
}
// Nord e sud: interrotte dalle porte.
for (const s of [-1, 1] as const) {
  const z0 = s < 0 ? -outZ : inZ
  const z1 = s < 0 ? -inZ : outZ
  const p0 = s < 0 ? -outZ : outZ - parapet
  const p1 = s < 0 ? -outZ + parapet : outZ
  for (const [a, b] of [[-inX, -GATE.halfX], [GATE.halfX, inX]] as const) {
    box([a, 0, z0], [b, walk, z1], "pietra")
    box([a, walk, p0], [b, walk + parapetH, p1], "pietra", "parapetto")
    merlons(true, a, b, p0, p1)
  }
}

// --- le porte-torri ------------------------------------------------------------------------
/** Porta San Genesio (s = -1, nord) e Porta di Sotto (s = 1, sud). */
function gate(s: -1 | 1) {
  const { halfX: hx, passHalf: ph, passH, depthOut, depthIn, walkH, top } = GATE
  const zo = s * (outZ + depthOut)
  const zi = s * (inZ - depthIn)
  const za = Math.min(zo, zi)
  const zb = Math.max(zo, zi)
  // Camminamento: la fascia della cinta (fra inZ e outZ) resta libera fra 6 e 8.5 m.
  const wa = s < 0 ? -outZ : inZ
  const wb = s < 0 ? -inZ : outZ
  box([-hx, 0, za], [-ph, walk, zb], "pietra")
  box([ph, 0, za], [hx, walk, zb], "pietra")
  box([-ph, passH, za], [ph, walk, zb], "pietra")
  box([-hx, walk, za], [hx, walk + walkH, wa], "pietra")
  box([-hx, walk, wb], [hx, walk + walkH, zb], "pietra")
  box([-hx, walk + walkH, za], [hx, top, zb], "pietra")
  // Cima: parapetto tutto attorno e merli.
  const p = 0.5
  box([-hx, top, za], [hx, top + 1, za + p], "pietra", "parapetto")
  box([-hx, top, zb - p], [hx, top + 1, zb], "pietra", "parapetto")
  box([-hx, top, za + p], [-hx + p, top + 1, zb - p], "pietra", "parapetto")
  box([hx - p, top, za + p], [hx, top + 1, zb - p], "pietra", "parapetto")
  for (const u of [-4.2, -1.8, 0.6, 3.0]) {
    box([u, top + 1, za], [u + 1.2, top + 1.7, za + p], "pietra")
    box([u, top + 1, zb - p], [u + 1.2, top + 1.7, zb], "pietra")
  }
  for (const u of [za + 1.2, za + 3.6, za + 6]) {
    box([-hx, top + 1, u], [-hx + p, top + 1.7, u + 1.2], "pietra")
    box([hx - p, top + 1, u], [hx, top + 1.7, u + 1.2], "pietra")
  }
}
gate(-1)
gate(1)

// Torri sporgenti fuori dalla cinta, a ovest e a est.
for (const s of [-1, 1] as const) {
  for (const z of [-59, 0, 59]) {
    const x0 = s < 0 ? -outX - 3 : outX
    box([x0, 0, z - 3], [x0 + 3, walk + 3, z + 3], "pietra")
  }
}

// Rampe interne al camminamento (pendono lungo z, addossate alla cinta).
const wedges: Wedge[] = [
  { x0: -inX, x1: -inX + 3, z0: -62, z1: -50, y0: walk, y1: 0, mat: "pietra" },
  { x0: -inX, x1: -inX + 3, z0: 50, z1: 62, y0: 0, y1: walk, mat: "pietra" },
  { x0: inX - 3, x1: inX, z0: -30, z1: -18, y0: walk, y1: 0, mat: "pietra" },
  { x0: inX - 3, x1: inX, z0: 14, z1: 26, y0: 0, y1: walk, mat: "pietra" }
]

// --- Duomo di Sant'Andrea -----------------------------------------------------------------
{
  const { minX, maxX, minZ, maxZ, height: h } = DUOMO
  const t = 1.2
  const fz = maxZ - t
  // Facciata a sud, sul sagrato: portale maggiore e due minori.
  for (const [a, b] of [[minX, 10.5], [12.5, 15.5], [19.5, 22], [24, maxX]] as const) box([a, 0, fz], [b, h, maxZ], "pietra", "muro")
  box([10.5, 4, fz], [12.5, h, maxZ], "pietra", "muro")
  box([15.5, 5.5, fz], [19.5, h, maxZ], "pietra", "muro")
  box([22, 4, fz], [24, h, maxZ], "pietra", "muro")
  // Fianco ovest con la porta sulla via maestra; fianco est e abside pieni.
  box([minX, 0, minZ], [minX + t, h, -66], "pietra", "muro")
  box([minX, 0, -63], [minX + t, h, fz], "pietra", "muro")
  box([minX, 4, -66], [minX + t, h, -63], "pietra", "muro")
  box([maxX - t, 0, minZ], [maxX, h, fz], "pietra", "muro")
  box([minX, 0, minZ], [maxX, h, minZ + t], "pietra", "muro")
  box([minX, h, minZ], [maxX, h + 0.8, maxZ], "pietra", "copertura")
  // Navata: due file di pilastri, banchi bassi ai lati del corridoio.
  for (const z of [-54, -60, -66, -72]) {
    box([12.4, 0, z - 0.6], [13.6, 12, z + 0.6], "pietraChiara", "pilastro")
    box([21.4, 0, z - 0.6], [22.6, 12, z + 0.6], "pietraChiara", "pilastro")
  }
  for (const z of [-58, -63, -69]) {
    box([14, 0, z], [16.6, 0.9, z + 1.2], "legno")
    box([18.4, 0, z], [21, 0.9, z + 1.2], "legno")
  }
  // Presbiterio (gradino) e altare.
  box([minX + t, 0, minZ + t], [maxX - t, 0.4, -74], "marmo", "terreno")
  box([15.5, 0.4, -80], [19.5, 1.4, -78.5], "marmo", "cassa")
}

// Campanile staccato, addossato alla cinta est.
box([CAMPANILE.minX, 0, CAMPANILE.minZ], [CAMPANILE.maxX, CAMPANILE.height, CAMPANILE.maxZ], "pietra")

// San Michele: le collisioni del tondo (lo disegna lo scenario).
{
  const { x, z, height: h } = SAN_MICHELE
  box([x - 3.45, 0, z - 1.6], [x + 3.45, h, z + 1.6], "invisibile")
  box([x - 1.6, 0, z - 3.45], [x + 1.6, h, z + 3.45], "invisibile")
  box([x - 2.7, 0, z - 2.7], [x + 2.7, h, z + 2.7], "invisibile")
}

// --- Palazzo Comunale con la loggia --------------------------------------------------------
{
  const { minX, maxX, minZ, maxZ, loggiaX, loggiaH, roof } = COMUNE
  box([minX, 0, minZ], [loggiaX, loggiaH, maxZ], "pietraChiara", "muro")
  box([minX, loggiaH, minZ], [maxX, roof, maxZ], "pietraChiara", "muro")
  for (const z of [58, 62.33, 66.67, 71]) box([maxX - 1, 0, z], [maxX, loggiaH, z + 1], "pietraChiara", "pilastro")
  box([-11.5, 0, minZ], [-10.5, loggiaH, minZ + 1], "pietraChiara", "pilastro")
  box([-11.5, 0, maxZ - 1], [-10.5, loggiaH, maxZ], "pietraChiara", "pilastro")
  box([CLOCK.minX, roof, CLOCK.minZ], [CLOCK.maxX, CLOCK.top, CLOCK.maxZ], "pietra")
}

// --- piazza: fontana, bancarelle, casse ----------------------------------------------------
box([-6, 0, -1.5], [-3, 0.9, 1.5], "pietraChiara", "fontana")
box([-26, 0, -16], [-20, 2.4, -13.5], "legno", "bancarele")
box([20, 0, 13.5], [26, 2.4, 16], "legno", "bancarele")
box([8, 0, -10], [10.5, 1.3, -8], "legno", "cassa")
box([-13, 0, 8], [-10.5, 1.3, 10], "legno", "cassa")
box([10, 0, 12], [12, 1.3, 14], "legno", "cassa")
box([-21, 0, -4], [-19, 1.3, -2], "legno", "cassa")
box([18, 0, -20], [20.5, 1.3, -18], "legno", "cassa")
box([-20.5, 0, 18], [-18, 1.3, 20], "legno", "cassa")
// Davanti alle porte, dentro: casse per ripararsi uscendo.
box([-14, 0, -92], [-11.5, 1.3, -90.5], "legno", "cassa")
box([11.5, 0, 90.5], [14, 1.3, 92], "legno", "cassa")
box([14, 0, -88], [16.5, 1.3, -86.5], "legno", "cassa")
box([-16.5, 0, 86.5], [-14, 1.3, 88], "legno", "cassa")

// --- le case -------------------------------------------------------------------------------
const portico = (side: "east" | "west" | "north" | "south") => ({ side, depth: 3.5, height: 3.8, spacing: 3.5 })
const buildings: Building[] = [
  { name: "Cjasis di Vençon (nord, ovest)", min: [-30, 0, -86], max: [-16, 10, -70], mat: "pietraChiara", roof: "falde" },
  { name: "Cjasis de Contrade (nord)", min: [-13, 0, -86], max: [-5, 10, -70], mat: "intonacoBianco", roof: "falde", portico: portico("east") },
  { name: "Palaç Orgnani", min: [-30, 0, -64], max: [-16, 11, -44], mat: "intonacoOcra", roof: "falde" },
  { name: "Cjasis de Contrade (mieç)", min: [-13, 0, -64], max: [-5, 10, -44], mat: "pietra", roof: "falde", portico: portico("east") },
  { name: "Palaç Radiussi", min: [-30, 0, -38], max: [-5, 11, -28], mat: "pietraChiara", roof: "falde", portico: portico("south") },
  { name: "Cjasis di Porte di Sot (ovest)", min: [-30, 0, 30], max: [-6, 10, 52], mat: "intonacoGiallo", roof: "falde", portico: portico("north") },
  { name: "Cjasis de place (est)", min: [6, 0, 30], max: [30, 11, 48], mat: "intonacoRosa", roof: "falde", portico: portico("west") },
  { name: "Palaç Scaligero", min: [6, 0, 54], max: [18, 10, 72], mat: "pietraChiara", roof: "falde", portico: portico("west") },
  { name: "Cjasis dal Tor", min: [22, 0, 54], max: [30, 10, 72], mat: "intonacoBianco", roof: "falde" },
  { name: "Cjasis di Porte di Sot (sud, ovest)", min: [-30, 0, 76], max: [-6, 10, 86], mat: "pietra", roof: "falde" },
  { name: "Cjasis di Porte di Sot (sud, est)", min: [6, 0, 76], max: [30, 10, 86], mat: "intonacoOcra", roof: "falde" }
]

// --- gioco ---------------------------------------------------------------------------------
const jumpPads: JumpPad[] = [
  // Cjars di fen dentro le porte: lanciano sulla cima della torre (nido da cecchino).
  { name: "Cjar di fen di Puarte San Genesi", at: [-9, 0, -92.5], radius: 1.4, launch: [5.2, 27, -2.2] },
  { name: "Cjar di fen di Puarte di Sot", at: [9, 0, 92.5], radius: 1.4, launch: [-5.2, 27, 2.2] }
]

const spawns: Record<Team, readonly Spawn[]> = {
  benandanti: [
    { at: [-26, 0, -91], yaw: Math.PI },
    { at: [-20, 0, -89], yaw: Math.PI },
    { at: [-3, 0, -90], yaw: Math.PI },
    { at: [6, 0, -88], yaw: Math.PI },
    { at: [20, 0, -91], yaw: Math.PI },
    { at: [28, 0, -88], yaw: Math.PI },
    { at: [31, 0, -78], yaw: Math.PI },
    { at: [-31, 0, -80], yaw: Math.PI }
  ],
  malandanti: [
    { at: [26, 0, 91], yaw: 0 },
    { at: [20, 0, 89], yaw: 0 },
    { at: [3, 0, 90], yaw: 0 },
    { at: [-6, 0, 88], yaw: 0 },
    { at: [-20, 0, 91], yaw: 0 },
    { at: [-28, 0, 88], yaw: 0 },
    { at: [-31, 0, 78], yaw: 0 },
    { at: [31, 0, 80], yaw: 0 }
  ]
}

/** Il frico davanti all'altare di Sant'Andrea e sotto la loggia del Comune. */
const flagBases: Record<Team, V3> = {
  benandanti: [17.5, 0.4, -76.5],
  malandanti: [-10.5, 0, 65]
}

const pickups: PickupSpot[] = [
  { kind: "frico", at: [-20, 0, -20] },
  { kind: "frico", at: [20, 0, 20] },
  { kind: "frico", at: [-31, 0, -5] },
  { kind: "frico", at: [31, 0, 5] },
  { kind: "gubane", at: [-18, 0, -41] },
  { kind: "gubane", at: [-18, 0, 55] },
  { kind: "gubane", at: [18, 0, 51] },
  { kind: "sgnape", at: [-8, 0, -67] },
  { kind: "sgnape", at: [24, 0, 74] },
  { kind: "munizions", at: [-20, 0, -93] },
  { kind: "munizions", at: [21, 0, -86] },
  { kind: "munizions", at: [20, 0, 93] },
  { kind: "munizions", at: [-21, 0, 88] },
  { kind: "lanciafrico", at: [14, 0, -2] }
]

const W = walk
/** Centro del camminamento (fra il parapetto e la faccia interna). */
const WX = inX + (outX - parapet - inX) / 2
const WZ = inZ + (outZ - parapet - inZ) / 2
const navPoints: V3[] = [
  // Piazzette dentro le porte
  [-31, 0, -89], [-18, 0, -89], [-5, 0, -89], [0, 0, -89], [5, 0, -89], [18, 0, -89], [31, 0, -89],
  [-31, 0, 89], [-18, 0, 89], [-5, 0, 89], [0, 0, 89], [5, 0, 89], [18, 0, 89], [31, 0, 89],
  // Androni delle porte (fuori dalle mura i bot non vanno)
  [0, 0, -96.5], [0, 0, 96.5],
  // Vicolo lungo la cinta, a ovest
  [-31, 0, -67], [-31, 0, -41], [-31, 0, -20], [-31, 0, 0], [-31, 0, 20], [-31, 0, 41], [-31, 0, 55], [-31, 0, 74],
  // ... e a est (il campanile si gira a ovest)
  [31, 0, -76], [28.5, 0, -63.5], [31, 0, -51], [31, 0, -31], [31, 0, -12], [31, 0, 10], [31, 0, 30], [31, 0, 51], [31, 0, 74],
  // Via maestra
  [0, 0, -67], [0, 0, -41], [0, 0, -26], [0, 0, -10], [0, 0, 10], [0, 0, 26], [0, 0, 41], [0, 0, 55], [0, 0, 66], [0, 0, 74],
  // Vicoli a ovest della via
  [-14.5, 0, -78], [-14.5, 0, -67], [-14.5, 0, -55], [-14.5, 0, -41], [-22, 0, -67], [-8, 0, -67], [-22, 0, -41], [-8, 0, -41],
  [-18, 0, 55], [-8, 0, 55], [-27, 0, 65], [-18, 0, 74], [-8, 0, 74],
  // Loggia del Comune
  [-10.5, 0, 65],
  // Vicoli a est della via
  [12, 0, 51], [20, 0, 51], [20, 0, 63], [12, 0, 74], [20, 0, 74],
  // Fianco del Duomo, sagrato, San Michele
  [5.5, 0, -78], [5.5, 0, -64.5], [5.5, 0, -52], [12, 0, -44], [17.5, 0, -45], [24, 0, -44.5], [24, 0, -31], [16, 0, -32], [18, 0, -86],
  // Dentro il Duomo
  [11, 0, -64.5], [17.5, 0, -52], [17.5, 0, -64], [17.5, 0, -72.5], [17.5, 0.4, -76.5],
  // Piazza
  [-20, 0, -22], [12, 0, -22], [-16, 0, -6], [-10, 0, 0], [12, 0, -4], [-16, 0, 12], [16, 0, 6], [-12, 0, 24], [16, 0, 24],
  // Rampe del camminamento: piede, cima, passo sulla cinta
  [-33.5, 0, -48], [-33.5, 5.75, -61.5], [-WX, W, -61.5],
  [-33.5, 0, 48], [-33.5, 5.75, 61.5], [-WX, W, 61.5],
  [33.5, 0, -16], [33.5, 5.75, -29.5], [WX, W, -29.5],
  [33.5, 0, 12], [33.5, 5.75, 25.5], [WX, W, 25.5],
  // Il camminamento
  [-WX, W, -WZ], [-WX, W, -80], [-WX, W, -40], [-WX, W, -20], [-WX, W, 0], [-WX, W, 20], [-WX, W, 40], [-WX, W, 80], [-WX, W, WZ],
  [WX, W, -WZ], [WX, W, -80], [WX, W, -50], [WX, W, -10], [WX, W, 10], [WX, W, 45], [WX, W, 65], [WX, W, 80], [WX, W, WZ],
  [-20, W, -WZ], [0, W, -96.5], [20, W, -WZ], [-20, W, WZ], [0, W, 96.5], [20, W, WZ]
]

/** Il cjar giù per la via maestra, da Porta San Genesio a Porta di Sotto. */
const track: V3[] = [
  [2, 0, -86],
  [2, 0, -30],
  [2, 0, 30],
  [2, 0, 86]
]

export const VENZONE = defineMap({
  id: "venzone",
  bounds: BOUNDS,
  blocks,
  wedges,
  buildings,
  walls: { bottom: -3, top: 50 },
  jumpPads,
  spawns,
  flagBases,
  /** La piazza attorno alla fontana. */
  hill: { at: [0, 0, 0], radius: 8 },
  pickups,
  navPoints,
  track,
  killY: -10
})
