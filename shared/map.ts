/**
 * Gemona del Friuli, zona Duomo: la mappa di gioco come dati.
 *
 * Una sola fonte per collisioni (Rapier, server e client), rendering (Three.js),
 * spawn, obiettivi e grafo di navigazione dei bot. Stilizzata ma fedele all'ordine
 * dei luoghi: in alto il sagrato col Duomo di Santa Maria Assunta e il campanile,
 * al centro Via Bini coi portici trecenteschi e la plaçute, in basso Piazza del
 * Municipio con la loggia del Palazzo Comunale.
 *
 * Assi: x verso est, y in alto, z verso sud (il Duomo è a nord, z negativa). Metri.
 */

export type V3 = readonly [number, number, number]

export type Team = "benandanti" | "malandanti"
export const TEAMS = ["benandanti", "malandanti"] as const satisfies readonly Team[]

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

// ---------------------------------------------------------------------------
// Quote

export const G_DUOMO = 6
export const G_MID = 3
export const G_LOW = 0
const BOTTOM = -3

export const BOUNDS = { minX: -40, maxX: 40, minZ: -104, maxZ: 100 } as const

// ---------------------------------------------------------------------------
// Edifici

const buildings: Building[] = [
  // Sagrato
  { name: "Canoniche e Museu de Pieve", min: [-40, G_DUOMO, -104], max: [-20, G_DUOMO + 11, -60], mat: "intonacoBianco", roof: "falde" },
  { name: "Palaç Gurisatti (Cineteche dal Friûl)", min: [-40, G_DUOMO, -56], max: [-28, G_DUOMO + 11, -34], mat: "intonacoOcra", roof: "falde" },
  { name: "Cjase dal Plevan", min: [30, G_DUOMO, -104], max: [40, G_DUOMO + 12, -40], mat: "intonacoRosa", roof: "falde" },
  // Via Bini alta
  { name: "Palaç Elti", min: [-40, G_MID, -28], max: [-26, G_MID + 10, 10], mat: "intonacoGiallo", roof: "falde" },
  {
    name: "Cjasis di Vie Bini (ovest)",
    min: [-20, G_MID, -28],
    max: [-5, G_MID + 11, -7],
    mat: "intonacoOcra",
    roof: "falde",
    portico: { side: "east", depth: 3.5, height: 3.8, spacing: 3.5 }
  },
  {
    name: "Palaç Boton",
    min: [5, G_MID, -28],
    max: [22, G_MID + 12, -7],
    mat: "intonacoRosa",
    roof: "falde",
    portico: { side: "west", depth: 3.5, height: 3.8, spacing: 3.5 }
  },
  { name: "Cjasis de Rive", min: [28, G_MID, -28], max: [40, G_MID + 10, 10], mat: "intonacoBianco", roof: "falde" },
  // Via Bini bassa
  { name: "Cjasis dal Borc (ovest)", min: [-40, G_LOW, 10], max: [-26, G_LOW + 10, 45], mat: "intonacoRosa", roof: "falde" },
  {
    name: "Cjasis di Vie Bini (bas, ovest)",
    min: [-20, G_LOW, 20],
    max: [-5, G_LOW + 10, 45],
    mat: "intonacoGiallo",
    roof: "falde",
    portico: { side: "east", depth: 3.5, height: 3.8, spacing: 3.5 }
  },
  {
    name: "Cjasis di Vie Bini (bas, est)",
    min: [5, G_LOW, 20],
    max: [22, G_LOW + 10, 45],
    mat: "intonacoBianco",
    roof: "falde",
    portico: { side: "west", depth: 3.5, height: 3.8, spacing: 3.5 }
  },
  { name: "Cjasis dal Borc (est)", min: [28, G_LOW, 10], max: [40, G_LOW + 10, 45], mat: "intonacoOcra", roof: "falde" },
  // Piazza del Municipio
  { name: "Cjase de Place (ovest)", min: [-40, G_LOW, 45], max: [-34, G_LOW + 10, 80], mat: "intonacoGiallo", roof: "falde" },
  { name: "Cjase de Place (est)", min: [34, G_LOW, 45], max: [40, G_LOW + 10, 80], mat: "intonacoRosa", roof: "falde" },
  { name: "Cjasis dongje il Comun (ovest)", min: [-40, G_LOW, 80], max: [-16, G_LOW + 10, 100], mat: "intonacoOcra", roof: "falde" },
  { name: "Cjasis dongje il Comun (est)", min: [16, G_LOW, 80], max: [40, G_LOW + 10, 100], mat: "intonacoBianco", roof: "falde" }
]

// ---------------------------------------------------------------------------
// Terreno, rampe, Duomo, campanile, loggia, ripari

const blocks: Block[] = []
const box = (min: V3, max: V3, mat: Mat, look?: Block["look"]) => {
  blocks.push(look ? { min, max, mat, look } : { min, max, mat })
}

// Terrazze: sagrato (6), Via Bini alta (3), Via Bini bassa e piazza (0).
box([-40, BOTTOM, -104], [40, G_DUOMO, -28], "porfido", "terreno")
box([-40, BOTTOM, -28], [40, G_MID, 10], "porfido", "terreno")
box([-40, BOTTOM, 10], [40, G_LOW, 100], "porfido", "terreno")

export const wedges: Wedge[] = []
// Su dal mezzo al sagrato: Androne dal Cjiscjel (ovest), Vie Bini, Rive (est).
for (const [x0, x1] of [[-26, -20], [-5, 5], [22, 28]] as const) {
  wedges.push({ x0, x1, z0: -28, z1: -20, y0: G_DUOMO, y1: G_MID, mat: "porfido" })
  wedges.push({ x0, x1, z0: 10, z1: 18, y0: G_MID, y1: G_LOW, mat: "porfido" })
}

// --- Duomo di Santa Maria Assunta ------------------------------------------
export const DUOMO = { minX: -14, maxX: 14, minZ: -100, maxZ: -62, floor: G_DUOMO, height: 18 } as const
{
  const { minX, maxX, minZ, maxZ, floor: f, height: h } = DUOMO
  const t = 1.2
  const top = f + h
  // Facciata (sud) con tre portali.
  const doorTop = f + 6
  const sideDoorTop = f + 4.5
  const fz0 = maxZ - t
  for (const [a, b] of [[minX, -9], [-6.5, -2.5], [2.5, 6.5], [9, maxX]] as const) box([a, f, fz0], [b, top, maxZ], "pietra", "muro")
  box([-2.5, doorTop, fz0], [2.5, top, maxZ], "pietra", "muro")
  box([-9, sideDoorTop, fz0], [-6.5, top, maxZ], "pietra", "muro")
  box([6.5, sideDoorTop, fz0], [9, top, maxZ], "pietra", "muro")
  // Fianchi: a est la porta laterale verso il campanile.
  box([minX, f, minZ], [minX + t, top, fz0], "pietra", "muro")
  box([maxX - t, f, minZ], [maxX, top, -82], "pietra", "muro")
  box([maxX - t, f, -77], [maxX, top, fz0], "pietra", "muro")
  box([maxX - t, f + 4.5, -82], [maxX, top, -77], "pietra", "muro")
  // Abside e tetto.
  box([minX, f, minZ], [maxX, top, minZ + t], "pietra", "muro")
  box([minX, top, minZ], [maxX, top + 0.8, maxZ], "pietra", "copertura")
  // Colonne della navata (inclinate dal '76 nella realtà, dritte qui).
  for (const z of [-69, -75, -81, -87, -93]) {
    box([-5.6, f, z - 0.6], [-4.4, f + 14, z + 0.6], "pietraChiara", "pilastro")
    box([4.4, f, z - 0.6], [5.6, f + 14, z + 0.6], "pietraChiara", "pilastro")
  }
  // Presbiterio (gradino basso: si sale camminando) e altare.
  box([-7, f, -98.8], [7, f + 0.4, -91], "marmo", "terreno")
  box([-2, f + 0.4, -97.5], [2, f + 1.4, -96], "marmo", "cassa")
  // Banche di legno: ripari bassi.
  for (const z of [-71, -77, -83]) {
    box([-3.5, f, z], [-0.8, f + 0.9, z + 1.4], "legno", "cassa")
    box([0.8, f, z], [3.5, f + 0.9, z + 1.4], "legno", "cassa")
  }
}

// --- Campanile -------------------------------------------------------------
export const CAMPANILE = { minX: 18, maxX: 25, minZ: -84, maxZ: -77, floor: G_DUOMO, height: 40, balcony: G_DUOMO + 22 } as const
{
  const { minX, maxX, minZ, maxZ, floor, height, balcony } = CAMPANILE
  box([minX, floor, minZ], [maxX, floor + height, maxZ], "pietra", "muro")
  // Ballatoio dei cecchini, con parapetto.
  const w = 1.6
  box([minX - w, balcony - 0.4, minZ - w], [maxX + w, balcony, minZ], "pietra", "copertura")
  box([minX - w, balcony - 0.4, maxZ], [maxX + w, balcony, maxZ + w], "pietra", "copertura")
  box([minX - w, balcony - 0.4, minZ], [minX, balcony, maxZ], "pietra", "copertura")
  box([maxX, balcony - 0.4, minZ], [maxX + w, balcony, maxZ], "pietra", "copertura")
  const p = 0.25
  box([minX - w, balcony, maxZ + w - p], [maxX + w, balcony + 1, maxZ + w], "pietra", "parapetto")
  box([minX - w, balcony, minZ - w], [maxX + w, balcony + 1, minZ - w + p], "pietra", "parapetto")
  box([minX - w, balcony, minZ - w], [minX - w + p, balcony + 1, maxZ + w], "pietra", "parapetto")
  box([maxX + w - p, balcony, minZ - w], [maxX + w, balcony + 1, maxZ + w], "pietra", "parapetto")
}

// --- Palazzo Comunale con la loggia ----------------------------------------
export const COMUNE = { minX: -16, maxX: 16, minZ: 80, maxZ: 94, floor: G_LOW, loggiaDepth: 6, loggiaHeight: 6, roof: G_LOW + 12 } as const
{
  const { minX, maxX, minZ, maxZ, floor: f, loggiaDepth, loggiaHeight, roof } = COMUNE
  for (const x of [-15.5, -9.5, -3.5, 2.5, 8.5, 14.5]) box([x, f, minZ], [x + 1, f + loggiaHeight, minZ + 1], "pietraChiara", "pilastro")
  box([minX, f + loggiaHeight, minZ], [maxX, roof, maxZ], "intonacoBianco", "muro")
  box([minX, f, minZ + loggiaDepth], [maxX, f + loggiaHeight, maxZ], "intonacoBianco", "muro")
  // Terrazza sul tetto (si arriva col cjar di fen) e torre dell'orologio.
  const p = 0.25
  box([minX, roof, minZ], [maxX, roof + 1, minZ + p], "pietraChiara", "parapetto")
  box([minX, roof, minZ], [minX + p, roof + 1, maxZ], "pietraChiara", "parapetto")
  box([maxX - p, roof, minZ], [maxX, roof + 1, maxZ], "pietraChiara", "parapetto")
  box([-3, roof, 88], [3, roof + 9, 94], "intonacoBianco", "muro")
}

// --- Ripari, bancarelle, fontana -------------------------------------------
// Sagrato
box([-14, G_DUOMO, -45], [-11, G_DUOMO + 1.1, -43.5], "pietraChiara", "cassa")
box([11, G_DUOMO, -45], [14, G_DUOMO + 1.1, -43.5], "pietraChiara", "cassa")
box([-3, G_DUOMO, -38], [3, G_DUOMO + 1.1, -36.5], "pietraChiara", "cassa")
box([22, G_DUOMO, -58], [25, G_DUOMO + 1.4, -55], "legno", "cassa")
box([-24, G_DUOMO, -62], [-21, G_DUOMO + 1.4, -59], "legno", "cassa")
// Plaçute di Vie Bini: la fontane in mezzo, re de culine.
box([-1.6, G_MID, 0.4], [1.6, G_MID + 0.9, 3.6], "pietraChiara", "fontana")
box([-14, G_MID, -3], [-11.5, G_MID + 1.3, -1], "legno", "cassa")
box([11.5, G_MID, 5], [14, G_MID + 1.3, 7], "legno", "cassa")
// Cortîi sotto la plaçute
box([-16, G_LOW, 13], [-13, G_LOW + 1.3, 16], "legno", "cassa")
box([14, G_LOW, 13], [17, G_LOW + 1.3, 16], "legno", "cassa")
// Piazza del Municipio: bancarelle del mercato e un monumento.
box([-22, G_LOW, 55], [-16, G_LOW + 2.4, 57.5], "legno", "bancarele")
box([16, G_LOW, 55], [22, G_LOW + 2.4, 57.5], "legno", "bancarele")
box([-2, G_LOW, 62], [2, G_LOW + 1.8, 66], "pietraChiara", "fontana")
box([-26, G_LOW, 70], [-23, G_LOW + 1.3, 72.5], "legno", "cassa")
box([23, G_LOW, 70], [26, G_LOW + 1.3, 72.5], "legno", "cassa")

// Tetti non calpestabili: sopra il Duomo e le case accanto al Comune (le falde disegnate coprirebbero chi ci sta).
box([DUOMO.minX, DUOMO.floor + DUOMO.height + 0.8, DUOMO.minZ], [DUOMO.maxX, DUOMO.floor + DUOMO.height + 10, DUOMO.maxZ], "invisibile")
box([-40, G_LOW + 10, 80], [-16, G_LOW + 22, 100], "invisibile")
box([16, G_LOW + 10, 80], [40, G_LOW + 22, 100], "invisibile")

// Bordo del mondo: muri invisibili.
const H = 60
box([BOUNDS.minX - 1, BOTTOM, BOUNDS.minZ], [BOUNDS.minX, H, BOUNDS.maxZ], "invisibile")
box([BOUNDS.maxX, BOTTOM, BOUNDS.minZ], [BOUNDS.maxX + 1, H, BOUNDS.maxZ], "invisibile")
box([BOUNDS.minX, BOTTOM, BOUNDS.minZ - 1], [BOUNDS.maxX, H, BOUNDS.minZ], "invisibile")
box([BOUNDS.minX, BOTTOM, BOUNDS.maxZ], [BOUNDS.maxX, H, BOUNDS.maxZ + 1], "invisibile")
box([BOUNDS.minX, H, BOUNDS.minZ], [BOUNDS.maxX, H + 1, BOUNDS.maxZ], "invisibile")

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

export const BUILDINGS: readonly Building[] = buildings
/** Tutto ciò che collide come scatola: terreno, muri, ripari ed edifici scomposti. */
export const BLOCKS: readonly Block[] = [...blocks, ...buildings.flatMap(buildingBlocks)]
export const WEDGES: readonly Wedge[] = wedges

// ---------------------------------------------------------------------------
// Gioco

export const JUMP_PADS: readonly JumpPad[] = [
  // Il cjar di fen ai piedi del campanile: ti tira su fino al ballatoio.
  { name: "Cjar di fen dal Campanili", at: [21.5, G_DUOMO, -71.5], radius: 1.4, launch: [0, 33, -2.4] },
  // Quello in piazza: sulla terrazza del Comun.
  { name: "Cjar di fen dal Comun", at: [0, G_LOW, 74], radius: 1.4, launch: [0, 26, 5] }
]

export const SPAWNS: Record<Team, readonly Spawn[]> = {
  benandanti: [
    { at: [-15, G_DUOMO, -40], yaw: Math.PI },
    { at: [0, G_DUOMO, -46], yaw: Math.PI },
    { at: [15, G_DUOMO, -40], yaw: Math.PI },
    { at: [-8, G_DUOMO, -55], yaw: Math.PI },
    { at: [8, G_DUOMO, -55], yaw: Math.PI },
    { at: [-8, G_DUOMO, -72], yaw: Math.PI },
    { at: [8, G_DUOMO, -86], yaw: Math.PI },
    { at: [22, G_DUOMO, -50], yaw: Math.PI }
  ],
  malandanti: [
    { at: [-20, G_LOW, 62], yaw: 0 },
    { at: [0, G_LOW, 56], yaw: 0 },
    { at: [20, G_LOW, 62], yaw: 0 },
    { at: [-10, G_LOW, 72], yaw: 0 },
    { at: [10, G_LOW, 72], yaw: 0 },
    { at: [-8, G_LOW, 84], yaw: 0 },
    { at: [8, G_LOW, 84], yaw: 0 },
    { at: [-28, G_LOW, 52], yaw: 0 }
  ]
}

/** Dove sta il frico di ogni squadra (Cjape il Frico). */
export const FLAG_BASES: Record<Team, V3> = {
  benandanti: [0, G_DUOMO + 0.4, -94],
  malandanti: [0, G_LOW, 84]
}

/** La plaçute di Vie Bini: chi la tiene, vince (Re de Culine). */
export const HILL = { at: [0, G_MID, 2] as V3, radius: 7.5 } as const

export const PICKUPS: readonly PickupSpot[] = [
  { kind: "frico", at: [-23, G_MID, 0] },
  { kind: "frico", at: [25, G_MID, 0] },
  { kind: "frico", at: [-10, G_LOW, 14] },
  { kind: "frico", at: [10, G_LOW, 14] },
  { kind: "gubane", at: [-23, G_MID, -15] },
  { kind: "gubane", at: [25, G_MID, -15] },
  { kind: "sgnape", at: [0, G_MID, -14] },
  { kind: "sgnape", at: [0, G_LOW, 34] },
  { kind: "munizions", at: [-18, G_DUOMO, -35] },
  { kind: "munizions", at: [18, G_DUOMO, -35] },
  { kind: "munizions", at: [-18, G_LOW, 52] },
  { kind: "munizions", at: [18, G_LOW, 52] },
  { kind: "lanciafrico", at: [9, G_MID, -2] }
]

/** Punti di passaggio per i bot; gli archi li calcola `nav.ts` con la fisica. */
export const NAV_POINTS: readonly V3[] = [
  // Sagrato e Duomo
  [-17, G_DUOMO, -64], [-10, G_DUOMO, -58], [0, G_DUOMO, -58], [10, G_DUOMO, -58], [24, G_DUOMO, -62],
  [-18, G_DUOMO, -44], [0, G_DUOMO, -44], [18, G_DUOMO, -44], [26, G_DUOMO, -46],
  [-23, G_DUOMO, -31], [0, G_DUOMO, -31], [25, G_DUOMO, -31],
  [0, G_DUOMO, -66], [0, G_DUOMO, -78], [0, G_DUOMO, -90], [-9, G_DUOMO, -78], [9, G_DUOMO, -79.5],
  [17, G_DUOMO, -79.5], [16, G_DUOMO, -70], [27, G_DUOMO, -72],
  // Rampe in su (cime e piedi)
  [-23, G_MID, -18], [0, G_MID, -18], [25, G_MID, -18],
  // Via Bini alta e plaçute
  [-23, G_MID, -8], [-7, G_MID, -14], [7, G_MID, -14], [25, G_MID, -8],
  [-12, G_MID, 0], [0, G_MID, -3], [12, G_MID, 0], [-8, G_MID, 7], [8, G_MID, 7], [-23, G_MID, 6], [25, G_MID, 6],
  [-23, G_MID, 9], [0, G_MID, 9], [25, G_MID, 9],
  // Piedi delle rampe giù
  [-23, G_LOW, 19], [0, G_LOW, 19], [25, G_LOW, 19],
  [-12, G_LOW, 13], [12, G_LOW, 13],
  // Via Bini bassa
  [-23, G_LOW, 32], [-7, G_LOW, 32], [0, G_LOW, 32], [7, G_LOW, 32], [25, G_LOW, 32],
  [-23, G_LOW, 46], [0, G_LOW, 46], [25, G_LOW, 46],
  // Piazza
  [-28, G_LOW, 56], [-10, G_LOW, 54], [10, G_LOW, 54], [28, G_LOW, 56],
  [-20, G_LOW, 66], [0, G_LOW, 59], [20, G_LOW, 66],
  [-10, G_LOW, 74], [0, G_LOW, 70], [10, G_LOW, 74],
  [-12, G_LOW, 83], [0, G_LOW, 83], [12, G_LOW, 83]
]

/** Altezza del terreno sotto i punti fuori mappa: se cadi sotto, rinasci. */
export const KILL_Y = -10
