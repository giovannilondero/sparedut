/**
 * Segnaposto: colline attorno, nessun monumento.
 */
import { fbm, makeHeightfield, smooth } from "../backdrop.ts"
import type { Scenery } from "../scenery.ts"

export const scenery: Scenery = {
  build() {},
  backdrop({ map }) {
    const { minX, maxX, minZ, maxZ } = map.bounds
    const out = (x: number, z: number) => Math.hypot(Math.max(minX - x, x - maxX, 0), Math.max(minZ - z, z - maxZ, 0))
    return [makeHeightfield((x, z) => -0.5 + smooth(40, 500, out(x, z)) * (120 + 160 * fbm(x / 240, z / 240)), map.bounds)]
  },
  menu: {
    path: [[0, 30, -80], [60, 30, 0], [0, 30, 80], [-60, 30, 0]],
    look: [[0, 2, 0], [0, 2, 0], [0, 2, 0], [0, 2, 0]]
  }
}
