/**
 * Segnaposto: un prato piatto, finché la mappa vera non c'è.
 */
import { defineMap, type V3 } from "../map.ts"

const nav: V3[] = []
for (let x = -30; x <= 30; x += 15) for (let z = -60; z <= 60; z += 15) nav.push([x, 0, z])

export const VENZONE = defineMap({
  id: "venzone",
  bounds: { minX: -40, maxX: 40, minZ: -70, maxZ: 70 },
  blocks: [{ min: [-40, -3, -70], max: [40, 0, 70], mat: "erba", look: "terreno" }],
  wedges: [],
  buildings: [],
  walls: { bottom: -3, top: 40 },
  jumpPads: [],
  spawns: {
    benandanti: [{ at: [-10, 0, -60], yaw: Math.PI }, { at: [10, 0, -60], yaw: Math.PI }],
    malandanti: [{ at: [-10, 0, 60], yaw: 0 }, { at: [10, 0, 60], yaw: 0 }]
  },
  flagBases: { benandanti: [0, 0, -62], malandanti: [0, 0, 62] },
  hill: { at: [0, 0, 0], radius: 7 },
  pickups: [{ kind: "munizions", at: [0, 0, -30] }, { kind: "frico", at: [0, 0, 30] }],
  navPoints: nav,
  track: [[0, 0, -55], [0, 0, 55]],
  killY: -10
})
