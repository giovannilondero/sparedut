/**
 * The sceneries of the maps other than Gemona (which `world.ts` draws itself).
 */
import type { MapId } from "../../../shared/map.ts"
import type { Scenery } from "../scenery.ts"
import { scenery as maran } from "./maran.ts"
import { scenery as osoppo } from "./osoppo.ts"
import { scenery as predil } from "./predil.ts"
import { scenery as trincee } from "./trincee.ts"
import { scenery as venzone } from "./venzone.ts"

export const SCENERY = { osoppo, trincee, venzone, predil, maran } as const satisfies Record<Exclude<MapId, "glemone">, Scenery>
