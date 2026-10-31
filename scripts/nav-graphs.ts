/**
 * Precalcola i grafi dei bot di tutte le mappe in `server/nav-graphs.ts`: costano decine di
 * secondi di CPU, che il server non deve spendere a ogni avvio (su Cloudflare, a ogni risveglio).
 * Da rilanciare quando cambia una mappa, il movimento o la fisica: `pnpm nav`.
 */
import { MAP_IDS, MAPS } from "../shared/maps/index.ts"
import { createPhysicsWorld, initPhysics } from "../shared/physics.ts"
import { computeNavGraph, mapFingerprint } from "../server/nav.ts"

await initPhysics()
const lines: string[] = []
for (const id of MAP_IDS) {
  const started = performance.now()
  const { edges } = computeNavGraph(createPhysicsWorld(MAPS[id]))
  console.log(`🧭 ${id}: ${edges.length} punti in ${Math.round(performance.now() - started)} ms`)
  lines.push(`  ${id}: { map: "${mapFingerprint(MAPS[id])}", edges: ${JSON.stringify(edges)} },`)
}

const source = `// Generato da \`pnpm nav\` (scripts/nav-graphs.ts): non modificare a mano.
import type { MapId } from "../shared/map.ts"

/** Per ogni mappa, gli archi del grafo dei bot e l'impronta della mappa da cui vengono. */
export const NAV_GRAPHS: Partial<Record<MapId, { readonly map: string; readonly edges: number[][] }>> = {
${lines.join("\n")}
}
`
await Bun.write(new URL("../server/nav-graphs.ts", import.meta.url), source)
