/**
 * Gli scenari delle mappe diverse da Gemona (che `world.ts` disegna da sé).
 */
import type { MapId } from "../../../shared/map.ts"
import type { Scenery } from "../scenery.ts"
import { scenery as osoppo } from "./osoppo.ts"
import { scenery as predil } from "./predil.ts"
import { scenery as trincee } from "./trincee.ts"
import { scenery as venzone } from "./venzone.ts"

export const SCENERY = { osoppo, trincee, venzone, predil } as const satisfies Record<Exclude<MapId, "glemone">, Scenery>
