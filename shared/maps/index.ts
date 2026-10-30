/**
 * Le mappe di gioco: un insieme chiuso, scelto da chi crea la partita.
 */
import type { MapDef, MapId } from "../map.ts"
import { GLEMONE } from "./glemone.ts"
import { MARAN } from "./maran.ts"
import { OSOPPO } from "./osoppo.ts"
import { PREDIL } from "./predil.ts"
import { TRINCEE } from "./trincee.ts"
import { VENZONE } from "./venzone.ts"

export const MAPS = {
  glemone: GLEMONE,
  osoppo: OSOPPO,
  trincee: TRINCEE,
  venzone: VENZONE,
  predil: PREDIL,
  maran: MARAN
} as const satisfies Record<MapId, MapDef>

export const MAP_IDS = Object.keys(MAPS) as MapId[]
