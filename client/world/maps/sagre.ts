/**
 * Sagre dal Frico, the training's fair: a placeholder scenery. The houses, the stalls and the
 * gates' street come from the data (`shared/maps/sagre.ts`); here only flat Friulian plain
 * beyond the edges and the menu camera's walk along the street. The fair's dressing is to come.
 */
import { fbm, makeHeightfield, smooth } from "../backdrop.ts"
import type { Scenery } from "../scenery.ts"

export const scenery: Scenery = {
  build() {},
  backdrop({ map }) {
    const { minX, maxX, minZ, maxZ } = map.bounds
    const out = (x: number, z: number) => Math.hypot(Math.max(minX - x, x - maxX, 0), Math.max(minZ - z, z - maxZ, 0))
    // The plain around Carpacco, with the Prealps far to the north.
    const height = (x: number, z: number) => -0.5 + fbm(x / 120, z / 120) * 2 * smooth(4, 40, out(x, z)) + smooth(-500, -1100, z) * (260 + 380 * fbm(x / 240, z / 240 + 4))
    return [makeHeightfield(height, map.bounds, 1952)]
  },
  menu: {
    path: [[-140, 12, 0], [-40, 14, -2], [60, 13, 2], [150, 18, -10], [170, 22, 16], [40, 15, 0]],
    look: [[-100, 2, 0], [0, 2, 0], [100, 2, 0], [170, 1, 0], [140, 1, 4], [-60, 2, 0]]
  }
}
