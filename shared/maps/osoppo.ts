/**
 * Il Fuart di Osôf: la fortezza sul colle di Osoppo, come dati.
 *
 * Tre ripiani lungo z: a nord il piazzale basso dei Benandanti (caserma e polveriera),
 * in mezzo l'altopiano erboso del colle (6 m più su) chiuso da due bastioni trasversali
 * con una porta e due gallerie, a sud il piazzale basso dei Malandanti. Sull'altopiano
 * le rovine della chiesa di San Pieri col campanile, i muri delle caserme diroccate, le
 * cisterne e il bastione alto a est. Dai piazzali si sale per la strada militare: tre
 * rampe in terra battuta. La mappa è simmetrica per rotazione di mezzo giro (x→-x, z→-z),
 * salvo chiesa, campanile e bastione est, che stanno a cavallo del centro.
 *
 * Assi: x verso est, y in alto, z verso sud (i Benandanti a nord, z negativa). Metri.
 */
import { defineMap, type Block, type Building, type JumpPad, type Mat, type PickupSpot, type Spawn, type V3, type Wedge } from "../map.ts"

/** Quote: piazzali bassi, altopiano, bastione est, cima dei bastioni trasversali. */
export const O_LOW = 0
export const O_TOP = 6
export const O_BASTION = 9
export const O_RAMPART = 11
const BOTTOM = -3

const BOUNDS = { minX: -40, maxX: 40, minZ: -105, maxZ: 105 } as const

/** Il ciglio fra piazzale e altopiano, e i bastioni trasversali (lato nord; il sud è speculare). */
export const FORT = {
  edge: 48,
  rampart: { z0: 36, z1: 44 },
  /** Varchi nei bastioni: gallerie coperte ai lati, porta aperta in mezzo. */
  tunnels: [[-28, -22], [22, 28]] as const,
  gate: [-5, 5] as const,
  /** Rampe della strada militare (x), dal piazzale (|z| = 64) al ciglio (|z| = 48). */
  ramps: [[-30, -20], [-5, 5], [20, 30]] as const,
  church: { minX: -36, maxX: -16, minZ: -12, maxZ: 12 },
  tower: { minX: -22, maxX: -17, minZ: -20, maxZ: -15, top: O_TOP + 24 },
  bastion: { minX: 26, maxX: 40, minZ: -14, maxZ: 14 },
  powder: { minX: 22, maxX: 36, minZ: -100, maxZ: -88, top: O_LOW + 5 }
} as const

const blocks: Block[] = []
const box = (min: V3, max: V3, mat: Mat, look?: Block["look"]) => {
  blocks.push(look ? { min, max, mat, look } : { min, max, mat })
}
/** Mezzo giro attorno all'asse verticale: il lato dei Malandanti. */
const rotP = (p: V3): V3 => [-p[0], p[1], -p[2]]
const rotBox = (min: V3, max: V3): [V3, V3] => [[-max[0], min[1], -max[2]], [-min[0], max[1], -min[2]]]
/** Specchio nord-sud (per l'altopiano, che è simmetrico attorno a z = 0). */
const mirBox = (min: V3, max: V3): [V3, V3] => [[min[0], min[1], -max[2]], [max[0], max[1], -min[2]]]
const both = (min: V3, max: V3, mat: Mat, look?: Block["look"], mirror: (a: V3, b: V3) => [V3, V3] = rotBox) => {
  box(min, max, mat, look)
  const [a, b] = mirror(min, max)
  box(a, b, mat, look)
}

// ---------------------------------------------------------------------------
// Terreno: piazzali bassi e altopiano.

const E = FORT.edge
box([BOUNDS.minX, BOTTOM, BOUNDS.minZ], [BOUNDS.maxX, O_LOW, -E], "terra", "terreno")
box([BOUNDS.minX, BOTTOM, -E], [BOUNDS.maxX, O_TOP, E], "erba", "terreno")
box([BOUNDS.minX, BOTTOM, E], [BOUNDS.maxX, O_LOW, BOUNDS.maxZ], "terra", "terreno")

// La strada militare: tre rampe per lato, dal piazzale al ciglio.
const wedges: Wedge[] = []
for (const [x0, x1] of FORT.ramps) {
  wedges.push({ x0, x1, z0: -E - 16, z1: -E, y0: O_LOW, y1: O_TOP, mat: "terra" })
  wedges.push({ x0, x1, z0: E, z1: E + 16, y0: O_TOP, y1: O_LOW, mat: "terra" })
}

// ---------------------------------------------------------------------------
// Bastioni trasversali: un terrapieno murato alto 5 m sull'altopiano, con la porta in
// mezzo e due gallerie coperte (3 m di luce). Sopra ci si arriva col cjar di fen.
{
  const { z0, z1 } = FORT.rampart
  const [t0, t1] = FORT.tunnels
  const [g0, g1] = FORT.gate
  const solid: [number, number][] = [[BOUNDS.minX, t0[0]], [t0[1], g0], [g1, t1[0]], [t1[1], BOUNDS.maxX]]
  for (const [a, b] of solid) both([a, O_TOP, -z1], [b, O_RAMPART, -z0], "pietra", "muro", mirBox)
  for (const [a, b] of [t0, t1]) both([a, O_TOP + 3, -z1], [b, O_RAMPART, -z0], "pietra", "muro", mirBox)
  // Parapetto verso il piazzale nemico (fuori), interrotto dalla porta.
  for (const [a, b] of [[BOUNDS.minX, g0], [g1, BOUNDS.maxX]] as const) both([a, O_RAMPART, -z1], [b, O_RAMPART + 1.1, -z1 + 0.35], "pietra", "parapetto", mirBox)
}

// ---------------------------------------------------------------------------
// Chiesa di San Pieri: muri diroccati senza tetto, porta a est e due porte laterali.
{
  const { minX, maxX, minZ, maxZ } = FORT.church
  const f = O_TOP
  const t = 0.8
  // Ovest: tre tratti crollati ad altezze diverse.
  box([minX, f, minZ], [minX + t, f + 6.5, -4], "pietra", "muro")
  box([minX, f, -4], [minX + t, f + 4, 4], "pietra", "muro")
  box([minX, f, 4], [minX + t, f + 5.5, maxZ], "pietra", "muro")
  // Est (verso l'altopiano): la porta grande nel mezzo.
  box([maxX - t, f, minZ], [maxX, f + 5, -3], "pietra", "muro")
  box([maxX - t, f, 3], [maxX, f + 4.5, maxZ], "pietra", "muro")
  // Nord e sud: porta laterale da x -28 a -24.
  box([minX + t, f, minZ], [-28, f + 5, minZ + t], "pietra", "muro")
  box([-24, f, minZ], [maxX - t, f + 3.5, minZ + t], "pietra", "muro")
  box([minX + t, f, maxZ - t], [-28, f + 4, maxZ], "pietra", "muro")
  box([-24, f, maxZ - t], [maxX - t, f + 5.5, maxZ], "pietra", "muro")
  // Macerie dentro: ripari bassi.
  box([-33, f, -4], [-30, f + 1, -2], "pietraChiara", "cassa")
  box([-22, f, 3], [-20, f + 1.2, 5], "pietraChiara", "cassa")
  box([-31, f, 6], [-29.5, f + 0.8, 9], "pietra", "cassa")
}

// Il campanile di San Pieri, a nord della chiesa.
{
  const { minX, maxX, minZ, maxZ, top } = FORT.tower
  box([minX, O_TOP, minZ], [maxX, top, maxZ], "pietra", "muro")
}

// Bastione est: un ripiano alto 3 m con rampe a nord e a sud e un parapetto verso l'altopiano.
const BASTION_RAMP = [28, 38] as const
{
  const { minX, maxX, minZ, maxZ } = FORT.bastion
  box([minX, BOTTOM, minZ], [maxX, O_BASTION, maxZ], "pietra", "terreno")
  wedges.push({ x0: BASTION_RAMP[0], x1: BASTION_RAMP[1], z0: minZ - 8, z1: minZ, y0: O_TOP, y1: O_BASTION, mat: "pietra" })
  wedges.push({ x0: BASTION_RAMP[0], x1: BASTION_RAMP[1], z0: maxZ, z1: maxZ + 8, y0: O_BASTION, y1: O_TOP, mat: "pietra" })
  for (const [a, b] of [[-10, -4], [4, 10]] as const) box([minX, O_BASTION, a], [minX + 0.4, O_BASTION + 1.1, b], "pietra", "parapetto")
  box([maxX - 0.4, O_BASTION, minZ], [maxX, O_BASTION + 1.1, maxZ], "pietra", "parapetto")
}

// Rovine delle caserme sull'altopiano: muri a L (speculari nord-sud).
both([6, O_TOP, -28], [18, O_TOP + 2.4, -27], "pietraChiara", "muro", mirBox)
both([17, O_TOP, -27], [18, O_TOP + 2.4, -23], "pietraChiara", "muro", mirBox)
both([-16, O_TOP, -26], [-13, O_TOP + 1.2, -24], "pietra", "cassa", mirBox)
// Casse attorno alla zona centrale (il centro, x = 0, resta libero per il cjar).
for (const [x0, x1] of [[4, 6], [-6, -4]] as const) both([x0, O_TOP, -6], [x1, O_TOP + 1.3, -4], "legno", "cassa", mirBox)
// Le cisterne.
both([10, O_TOP, -9], [13, O_TOP + 0.9, -6], "pietraChiara", "fontana", mirBox)

// Parapetti sul ciglio est e ovest dell'altopiano (oltre c'è lo strapiombo).
box([BOUNDS.minX, O_TOP, -36], [BOUNDS.minX + 0.4, O_TOP + 1.1, 36], "pietra", "parapetto")
for (const [a, b] of [[-36, -14], [14, 36]] as const) box([BOUNDS.maxX - 0.4, O_TOP, a], [BOUNDS.maxX, O_TOP + 1.1, b], "pietra", "parapetto")

// ---------------------------------------------------------------------------
// Piazzale nord (Benandanti); il sud è lo stesso girato di mezzo giro.

const buildings: Building[] = [
  { name: "Caserme Napoleoniche (nord)", min: [-40, O_LOW, -104], max: [-22, O_LOW + 10, -84], mat: "intonacoOcra", roof: "falde" },
  { name: "Caserme Napoleoniche (sud)", min: [22, O_LOW, 84], max: [40, O_LOW + 10, 104], mat: "intonacoOcra", roof: "falde" }
]
{
  const { minX, maxX, minZ, maxZ, top } = FORT.powder
  both([minX, O_LOW, minZ], [maxX, top, maxZ], "pietra", "muro")
}
// Il muretto davanti al frico, casse, muretti fra le rampe.
both([-6, O_LOW, -86], [6, O_LOW + 1.2, -85], "pietra", "parapetto")
both([-20, O_LOW, -88], [-17, O_LOW + 1.3, -86], "legno", "cassa")
both([4, O_LOW, -84], [7, O_LOW + 1.3, -82], "legno", "cassa")
both([-10, O_LOW, -66], [-7, O_LOW + 1.3, -64], "legno", "cassa")
both([7, O_LOW, -66], [10, O_LOW + 1.3, -64], "legno", "cassa")
both([-12, O_LOW, -70], [-6, O_LOW + 1.3, -69], "pietra", "parapetto")
// Parapetti sui bordi dei piazzali.
both([BOUNDS.minX, O_LOW, -84], [BOUNDS.minX + 0.4, O_LOW + 1.1, -E - 16], "pietra", "parapetto")
both([BOUNDS.maxX - 0.4, O_LOW, BOUNDS.minZ], [BOUNDS.maxX, O_LOW + 1.1, -E - 16], "pietra", "parapetto")

// ---------------------------------------------------------------------------
// Gioco

const RZ = (FORT.rampart.z0 + FORT.rampart.z1) / 2
/** I cjars di fen dietro i bastioni: tirano sulla cima del terrapieno. */
const jumpPads: JumpPad[] = [
  { name: "Cjar di fen dal Bastion di Tramontane", at: [-34, O_TOP, -29], radius: 1.4, launch: [0, 18, -(RZ - 29) / 1.28] },
  { name: "Cjar di fen dal Bastion di Misdì", at: [34, O_TOP, 29], radius: 1.4, launch: [0, 18, (RZ - 29) / 1.28] }
]

const northSpawns: Spawn[] = [
  { at: [-15, O_LOW, -70], yaw: Math.PI },
  { at: [0, O_LOW, -72], yaw: Math.PI },
  { at: [15, O_LOW, -70], yaw: Math.PI },
  { at: [-10, O_LOW, -84], yaw: Math.PI },
  { at: [10, O_LOW, -88], yaw: Math.PI },
  { at: [-15, O_LOW, -98], yaw: Math.PI },
  { at: [15, O_LOW, -98], yaw: Math.PI },
  { at: [-30, O_LOW, -75], yaw: Math.PI },
  { at: [30, O_LOW, -76], yaw: Math.PI }
]
const spawns = {
  benandanti: northSpawns,
  malandanti: northSpawns.map((s) => ({ at: rotP(s.at), yaw: 0 }))
}

const northPickups: PickupSpot[] = [
  { kind: "frico", at: [-34, O_LOW, -66] },
  { kind: "sgnape", at: [-12, O_LOW, -55] },
  { kind: "munizions", at: [-14, O_LOW, -76] },
  { kind: "munizions", at: [16, O_LOW, -90] },
  { kind: "gubane", at: [-10, O_TOP, -30] }
]
const pickups: PickupSpot[] = [
  ...northPickups,
  ...northPickups.map((p) => ({ kind: p.kind, at: rotP(p.at) })),
  { kind: "frico", at: [-26, O_TOP, 0] },
  { kind: "frico", at: [33, O_BASTION, 0] },
  { kind: "lanciafrico", at: [-12, O_TOP, 0] }
]

// Punti dei bot: piazzale nord (girato per il sud), altopiano (speculare nord-sud).
const northYard: V3[] = [
  [-15, O_LOW, -98], [0, O_LOW, -95], [15, O_LOW, -96],
  [-15, O_LOW, -80], [0, O_LOW, -78], [15, O_LOW, -80], [-32, O_LOW, -76], [30, O_LOW, -80],
  [-25, O_LOW, -66], [0, O_LOW, -66], [25, O_LOW, -66], [-12, O_LOW, -55], [12, O_LOW, -55],
  // cime delle rampe, sul ciglio
  [-25, O_TOP, -46], [0, O_TOP, -46], [25, O_TOP, -46]
]
const northTop: V3[] = [
  [-25, O_TOP, -33], [0, O_TOP, -33], [25, O_TOP, -33],
  [-28, O_TOP, -21], [-8, O_TOP, -24], [12, O_TOP, -31], [12, O_TOP, -22], [33, O_TOP, -26],
  [33, O_BASTION, -8], [18, O_TOP, -12], [0, O_TOP, -14], [-10, O_TOP, -14],
  [-26, O_TOP, -7]
]
const navPoints: V3[] = [
  ...northYard,
  ...northYard.map(rotP),
  ...northTop,
  ...northTop.map((p): V3 => [p[0], p[1], -p[2]]),
  [0, O_TOP, 0], [-10, O_TOP, 0], [-26, O_TOP, 0]
]

/** Il cjar dal piazzale nord, su per la rampa di mezzo, per la porta e l'altopiano, giù a sud. */
const track: V3[] = [
  [0, O_LOW, -76],
  [0, O_LOW, -E - 16],
  [0, O_TOP, -E],
  [0, O_TOP, E],
  [0, O_LOW, E + 16],
  [0, O_LOW, 76]
]

export const OSOPPO = defineMap({
  id: "osoppo",
  bounds: BOUNDS,
  blocks,
  wedges,
  buildings,
  walls: { bottom: BOTTOM, top: 50 },
  jumpPads,
  spawns,
  flagBases: { benandanti: [0, O_LOW, -97], malandanti: [0, O_LOW, 97] },
  /** Il prato in mezzo all'altopiano, fra la chiesa e il bastione est. */
  hill: { at: [0, O_TOP, 0], radius: 7.5 },
  pickups,
  navPoints,
  track,
  killY: -10,
  turrets: [
    { at: [-12, O_TOP, -30], yaw: Math.PI },
    { at: [7, O_TOP, 25], yaw: 0 }
  ],
  doors: []
})
