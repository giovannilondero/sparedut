/**
 * Sagre dal Frico: the training's map, a small village fair after the frico fair of Carpacco.
 *
 * One street runs west to east between two rows of houses, with the training's stations in a
 * row along it as stalls; at its east end a small square holds the modes and the skirmish.
 * Between each two stations a gate closes the way (`gates`, not in `blocks`): a host closes it
 * until the station is complete. `SAGRE_STATIONS` names what each station's steps use.
 *
 * Axes: x east, y up, z south. Metres. The street is z -6..6, the ground is y 0.
 */
import { defineMap, type Block, type Bounds, type Building, type DoorDef, type GateDef, type Mat, type PickupKind, type PickupSpot, type Spawn, type TurretSpot, type V3 } from "../map.ts"
import type { StationId } from "../training/index.ts"
import type { PrimaryId } from "../weapons.ts"

const BOUNDS = { minX: -156, maxX: 192, minZ: -32, maxZ: 32 } as const
const BOTTOM = -2
/** Half the street's width. */
const STREET = 6
/** The square at the end of the street. */
export const SQUARE = { minX: 124, maxX: 186, minZ: -26, maxZ: 26 } as const
/** Facing east, along the street towards the square, and facing west. */
const EAST = -Math.PI / 2
const WEST = Math.PI / 2

/**
 * Where each station's ground ends to the east (x). Station 1 starts at the west end of the
 * street; stations 11 and 12 split the square, with the last gate across it.
 */
const ENDS = [-134, -100, -64, -50, 6, 20, 50, 72, 108, SQUARE.minX, 154, SQUARE.maxX] as const
const WEST_END = -150

const area = (i: number): Bounds => {
  const minX = i === 0 ? WEST_END : ENDS[i - 1]
  const square = minX >= SQUARE.minX
  return { minX, maxX: ENDS[i], minZ: square ? SQUARE.minZ : -STREET, maxZ: square ? SQUARE.maxZ : STREET }
}
const startAt = (x: number, z = 0): Spawn => ({ at: [x, 0, z], yaw: EAST })

const blocks: Block[] = []
const box = (min: V3, max: V3, mat: Mat, look?: Block["look"]) => {
  blocks.push(look ? { min, max, mat, look } : { min, max, mat })
}

// ---------------------------------------------------------------------------
// Ground, houses and the square.

box([BOUNDS.minX, BOTTOM, BOUNDS.minZ], [BOUNDS.maxX, 0, BOUNDS.maxZ], "porfido", "terreno")

const MATS = ["intonacoOcra", "intonacoRosa", "intonacoBianco", "intonacoGiallo"] as const satisfies readonly Mat[]
const buildings: Building[] = [{ name: "Cjase dal Fonts", min: [BOUNDS.minX, 0, -STREET], max: [WEST_END, 8, STREET], mat: "intonacoGiallo", roof: "falde" }]
/** A row of houses from one x to the next, on one side of the street. */
const row = (side: "north" | "south", xs: readonly number[]) => {
  for (let i = 1; i < xs.length; i++) {
    const [z0, z1] = side === "north" ? [BOUNDS.minZ, -STREET] : [STREET, BOUNDS.maxZ]
    const h = 7 + ((i * 2 + (side === "north" ? 0 : 1)) % 3) * 1.5
    buildings.push({ name: `Cjase ${side === "north" ? "N" : "S"}${i}`, min: [xs[i - 1], 0, z0], max: [xs[i], h, z1], mat: MATS[(i + (side === "north" ? 0 : 2)) % MATS.length], roof: "falde" })
  }
}
const SOUTH_ROW = [BOUNDS.minX, -140, -124, -108, -92, -76, -60, -44, -28, -12, 4, 20, 36, 52, 68, 84, 100, 112, SQUARE.minX]
// The north row leaves room for the shed of station 3 (x -80..-76).
row("north", [BOUNDS.minX, -140, -124, -108, -92, -80])
row("north", [-76, -60, -44, -28, -12, 4, 20, 36, 52, 68, 84, 100, 112, SQUARE.minX])
row("south", SOUTH_ROW)
buildings.push(
  { name: "Cjase de Place (tramontane)", min: [SQUARE.minX, 0, BOUNDS.minZ], max: [BOUNDS.maxX, 9, SQUARE.minZ], mat: "intonacoOcra", roof: "falde" },
  { name: "Cjase de Place (misdì)", min: [SQUARE.minX, 0, SQUARE.maxZ], max: [BOUNDS.maxX, 9, BOUNDS.maxZ], mat: "intonacoRosa", roof: "falde" },
  { name: "Glesie de Place", min: [SQUARE.maxX, 0, SQUARE.minZ], max: [BOUNDS.maxX, 12, SQUARE.maxZ], mat: "pietraChiara", roof: "falde" }
)

// ---------------------------------------------------------------------------
// Station 2, the obstacle course: the bar across the street, then the beam, then the run-up.

const BAR: Block = { min: [-124, 0, -STREET], max: [-123.7, 0.8, STREET], mat: "legno", look: "parapetto" }
/** The beam leaves 1.35 m beneath it: enough crouched (1.1 m), not standing (1.8 m). Above it, the stall's sign board. */
const BEAM: Block = { min: [-114, 1.35, -STREET], max: [-113.4, 4, STREET], mat: "legno", look: "muro" }
blocks.push(BAR, BEAM)

// ---------------------------------------------------------------------------
// Station 3: the shed in the north row, with its door onto the street.

const SHED = { minX: -80, maxX: -76, back: -10 } as const
const DOOR: DoorDef = { name: "Puarte dal casot", min: [SHED.minX, 0, -STREET - 0.3], max: [SHED.maxX, 2.6, -STREET - 0.05], hp: 150 }
box([SHED.minX, 0, BOUNDS.minZ], [SHED.maxX, 7, SHED.back], "legno", "muro")
box([SHED.minX, 2.6, -STREET - 0.3], [SHED.maxX, 7, -STREET], "legno", "muro")

// ---------------------------------------------------------------------------
// The stalls: one per primary at station 5 (the Cjampanili's across the street), one at the
// pickups of station 8, one beside the first station's marker.

const stall = (x0: number, side: "north" | "south") =>
  box([x0, 0, side === "north" ? -STREET : STREET - 2.5], [x0 + 6, 2.4, side === "north" ? -STREET + 2.5 : STREET], "legno", "bancarele")
for (const x of [-48, -38, -28, -18]) stall(x, "north")
stall(-48, "south")
stall(58, "north")
stall(-142, "south")

// ---------------------------------------------------------------------------
// The skirmish's half of the square: cover between the two sides.

box([168, 0, -12], [170, 1.3, -9], "legno", "cassa")
box([168, 0, 9], [170, 1.3, 12], "legno", "cassa")
box([173, 0, -1.5], [175, 1.3, 1.5], "legno", "cassa")
box([162, 0, -21], [164, 1.1, -19], "pietra", "parapetto")
box([162, 0, 19], [164, 1.1, 21], "pietra", "parapetto")

// ---------------------------------------------------------------------------
// The gates: across the street at the end of each station (across the square for the last).

const gates: GateDef[] = ENDS.slice(0, -1).map((x, i) => {
  const a = area(i)
  return { name: `Barierie ${i + 1}`, min: [x - 0.4, 0, a.minZ], max: [x, 4, a.maxZ] }
})

// ---------------------------------------------------------------------------
// Pickups: the four kinds at station 8, the Lanciafrico at station 9, ammunition for the skirmish.

const pickups: PickupSpot[] = []
const pickup = (kind: PickupKind, at: V3) => pickups.push({ kind, at }) - 1
const STATION_PICKUPS = {
  frico: pickup("frico", [56, 0, 2]),
  gubane: pickup("gubane", [60, 0, 2]),
  sgnape: pickup("sgnape", [64, 0, 2]),
  munizions: pickup("munizions", [68, 0, 2])
} as const satisfies Record<Exclude<PickupKind, "lanciafrico">, number>
const LANCIAFRICO = pickup("lanciafrico", [100, 0, 3])
pickup("munizions", [170, 0, -20])
pickup("munizions", [170, 0, 20])

const turrets: TurretSpot[] = [{ at: [80, 0, -2], yaw: EAST }]

// ---------------------------------------------------------------------------
// Station 11's objectives, in the west half of the square.

const FLAG_BASES = { benandanti: [130, 0, -18], malandanti: [150, 0, -18] } as const satisfies Record<"benandanti" | "malandanti", V3>
/** The plaçute; the storm closes in on its centre too (`stormAt`). */
const HILL = { at: [140, 0, 4] as V3, radius: 4 }
const TRACK: V3[] = [[128, 0, 20], [150, 0, 20]]

// Station 12: the skirmish's sides, in the east half. The player and teammates are Benandanti.
const spawns = {
  benandanti: [startAt(158, -8), startAt(158, 8), startAt(160, -16), startAt(160, 16)],
  malandanti: [[182, -8], [182, 8], [182, -16], [182, 16]].map(([x, z]): Spawn => ({ at: [x, 0, z], yaw: WEST }))
}

// Bot points: along the middle of the street from station 3 on, then across the square.
const navPoints: V3[] = [
  ...Array.from({ length: 19 }, (_, i): V3 => [-96 + i * 12, 0, 0]),
  ...[130, 142, 160, 178].flatMap((x) => [-18, -6, 6, 18].map((z): V3 => [x, 0, z]))
]

export const SAGRE = defineMap({
  id: "sagre",
  bounds: BOUNDS,
  blocks,
  wedges: [],
  buildings,
  walls: { bottom: BOTTOM, top: 30 },
  jumpPads: [],
  spawns,
  flagBases: FLAG_BASES,
  hill: HILL,
  pickups,
  navPoints,
  track: TRACK,
  killY: -10,
  turrets,
  doors: [DOOR],
  gates
})

/** A bot's route: it walks from point to point and back; a single point is a bot standing still. */
type Route = readonly V3[]

/** What every station has: its ground, where the player starts it, and the gate onward (index in `SAGRE.gates`). */
interface StationArea {
  readonly area: Bounds
  readonly start: Spawn
  readonly gate: number | null
}

/** One station's entry: its common fields checked, its own props kept as written. */
const station = <const T extends StationArea>(s: T): T => s

/**
 * The training's twelve stations, keyed by station (their order is `STATION_IDS`'s), with the map
 * data each station's steps use. Indices refer to `SAGRE`'s arrays (`doors`, `pickups`, `turrets`, `gates`).
 */
export const SAGRE_STATIONS = {
  /** 1. Look and move. */
  look: station({ area: area(0), start: startAt(-148), gate: 0, marker: [-138, 0, 0] as V3 }),
  /** 2. Obstacle course: jump the bar, crouch under the beam, sprint from `sprintFrom` past x = `sprintLine`. */
  course: station({ area: area(1), start: startAt(-132), gate: 1, bar: BAR, beam: BEAM, sprintFrom: [-112, 0, 0] as V3, sprintLine: -103 }),
  /** 3. Always with you: targets for the Mandi, for aiming and for the mescul; the shed's door. */
  always: station({
    area: area(2),
    start: startAt(-98),
    gate: 2,
    targets: {
      mandi: [[-86, 0, -3], [-86, 0, 3]] as Route,
      aim: [[-68, 0, 2]] as Route,
      mescul: [[-94, 0, 2]] as Route
    },
    door: 0,
    /** Where to stand to kick the door, facing north. */
    doorFront: [(SHED.minX + SHED.maxX) / 2, 0, -STREET + 1] as V3
  }),
  /** 4. Changing weapon. */
  switch: station({ area: area(3), start: startAt(-62), gate: 3 }),
  /** 5. The stalls: where to stand (facing east) for each primary, and its target's route. */
  stalls: station({
    area: area(4),
    start: startAt(-48, 1),
    gate: 4,
    stalls: {
      cramar: { at: startAt(-45, -1.5), target: [[-33, 0, -2.5], [-33, 0, 3]] as Route },
      doplete: { at: startAt(-35, -1.5), target: [[-30.5, 0, -1.5]] as Route },
      cjampanili: { at: startAt(-45, 2), target: [[2, 0, 2]] as Route },
      mulin: { at: startAt(-25, -1.5), target: [[-12, 0, -2.5], [-12, 0, 3]] as Route },
      gjalinis: { at: startAt(-15, -1.5), target: [[0, 0, -3], [0, 0, 4]] as Route }
    } satisfies Record<Exclude<PrimaryId, "miedi" | "motosee">, { readonly at: Spawn; readonly target: Route }>
  }),
  /** 6. The armoury. */
  armoury: station({ area: area(5), start: startAt(8), gate: 5 }),
  /** 7. Bombs and mines: throw from `bombAt` at the bots standing at `bombTargets`; plant at `mineAt`, on the route a bot walks. */
  throw: station({
    area: area(6),
    start: startAt(22),
    gate: 6,
    bombAt: [24, 0, 0] as V3,
    bombTargets: [[34, 0, -2], [35, 0, 0], [34, 0, 2]] as readonly V3[],
    mineAt: [42, 0, 0] as V3,
    mineRoute: [[42, 0, -4], [42, 0, 4]] as Route
  }),
  /** 8. Pickups: one of each kind (index in `SAGRE.pickups`). */
  pickups: station({ area: area(7), start: startAt(52), gate: 7, pickups: STATION_PICKUPS }),
  /** 9. The turret (index in `SAGRE.turrets`, facing east down the street) and the Lanciafrico (index in `SAGRE.pickups`). */
  turret: station({ area: area(8), start: startAt(74), gate: 8, turret: 0, lanciafrico: LANCIAFRICO }),
  /** 10. The medic: where the wounded teammate stands. */
  medic: station({ area: area(9), start: startAt(110), gate: 9, wounded: { at: [118, 0, 0], yaw: WEST } as Spawn }),
  /** 11. The modes: `SAGRE.flagBases`, the plaçute `SAGRE.hill`, the cjar's `SAGRE.track` and the storm's centre. */
  modes: station({ area: area(10), start: startAt(126), gate: 10, storm: HILL.at }),
  /** 12. The skirmish: the sides are `SAGRE.spawns`. */
  skirmish: station({ area: area(11), start: startAt(156), gate: null })
} as const satisfies Record<StationId, StationArea>
