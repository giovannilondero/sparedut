import { expect, test } from "bun:test"
import { createPhysicsWorld, initPhysics } from "../shared/physics.ts"
import { computeNavGraph, mapFingerprint, navGraph, route } from "../server/nav.ts"
import { NAV_GRAPHS } from "../server/nav-graphs.ts"
import { MAP_IDS, MAPS } from "../shared/maps/index.ts"

for (const id of MAP_IDS) {
  test(`il grafo dei bot collega ogni punto di ${id} in entrambi i sensi`, async () => {
    await initPhysics()
    const map = MAPS[id]
    // Da capo, non quello precalcolato: così si vede anche se il precalcolato è vecchio.
    const g = computeNavGraph(createPhysicsWorld(map))
    const points = map.navPoints
    const isolated = g.edges.map((e, i) => (e.length === 0 ? i : -1)).filter((i) => i >= 0)
    if (isolated.length) console.log(id, "isolati", isolated.map((i) => points[i]))
    // Ogni nodo deve raggiungere ogni altro: basta che tutti vadano e tornino dal primo.
    const unreachable: string[] = []
    for (let i = 1; i < points.length; i++) {
      if (route(g, 0, i).length === 0) unreachable.push(`${points[0]}→${points[i]}`)
      if (route(g, i, 0).length === 0) unreachable.push(`${points[i]}→${points[0]}`)
    }
    if (unreachable.length) console.log(id, unreachable)
    expect(unreachable).toEqual([])
    // Il server usa quello di `nav-graphs.ts`: se la mappa, il movimento o la fisica cambiano, `pnpm nav`.
    expect(NAV_GRAPHS[id]).toEqual({ map: mapFingerprint(map), edges: g.edges as number[][] })
  }, 60000)
}

test("a Gemona il grafo porta dal Duomo in piazza", async () => {
  await initPhysics()
  const map = MAPS.glemone
  const g = navGraph(createPhysicsWorld(map))
  const duomo = map.navPoints.findIndex((p) => p[2] === -90)
  const piazza = map.navPoints.findIndex((p) => p[2] === 83 && p[0] === 0)
  expect(route(g, duomo, piazza).length).toBeGreaterThan(2)
  expect(route(g, piazza, duomo).length).toBeGreaterThan(2)
}, 30000)
