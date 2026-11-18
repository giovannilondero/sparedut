/**
 * The game maps: a closed set. Every table that must cover a map covers all of them; a regular
 * room chooses among `ROOM_MAP_IDS` only.
 */
import type { MapDef, MapId } from "../map.ts"
import { GLEMONE } from "./glemone.ts"
import { MARAN } from "./maran.ts"
import { OSOPPO } from "./osoppo.ts"
import { PREDIL } from "./predil.ts"
import { SAGRE } from "./sagre.ts"
import { TRINCEE } from "./trincee.ts"
import { VENZONE } from "./venzone.ts"

export const MAPS = {
  glemone: GLEMONE,
  osoppo: OSOPPO,
  trincee: TRINCEE,
  venzone: VENZONE,
  predil: PREDIL,
  maran: MARAN,
  sagre: SAGRE
} as const satisfies Record<MapId, MapDef>

/** Every map, the training's included. */
export const MAP_IDS = Object.keys(MAPS) as MapId[]

/**
 * Whether a regular room can choose the map. The training's fair cannot: the create form does not
 * offer it and the regular create request refuses it. A new map does not compile until it says.
 */
const CHOOSABLE = {
  glemone: true,
  osoppo: true,
  trincee: true,
  venzone: true,
  predil: true,
  maran: true,
  sagre: false
} as const satisfies Record<MapId, boolean>

/** A map a regular room can be created on. */
export type RoomMapId = { [K in MapId]: (typeof CHOOSABLE)[K] extends true ? K : never }[MapId]

const isRoomMap = (id: MapId): id is RoomMapId => CHOOSABLE[id]

/** The maps a regular room can choose, in the order of `MAPS`. */
export const ROOM_MAP_IDS: readonly RoomMapId[] = MAP_IDS.filter(isRoomMap)
