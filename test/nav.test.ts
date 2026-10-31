import { expect, test } from "bun:test"
import { createPhysicsWorld, initPhysics } from "../shared/physics.ts"
import { computeNavGraph, mapFingerprint, navGraph, route } from "../server/nav.ts"
import { NAV_GRAPHS } from "../server/nav-graphs.ts"
import { MAP_IDS, MAPS } from "../shared/maps/index.ts"

for (const id of MAP_IDS) {
  test(`the bot graph links every point of ${id} in both directions`, async () => {
    await initPhysics()
    const map = MAPS[id]
    // From scratch, not the precomputed one: this way we also see whether the precomputed one is stale.
    const g = computeNavGraph(createPhysicsWorld(map))
    const points = map.navPoints
    const isolated = g.edges.map((e, i) => (e.length === 0 ? i : -1)).filter((i) => i >= 0)
    if (isolated.length) console.log(id, "isolated", isolated.map((i) => points[i]))
    // Every node must reach every other: it's enough that all go to and come back from the first.
    const unreachable: string[] = []
    for (let i = 1; i < points.length; i++) {
      if (route(g, 0, i).length === 0) unreachable.push(`${points[0]}→${points[i]}`)
      if (route(g, i, 0).length === 0) unreachable.push(`${points[i]}→${points[0]}`)
    }
    if (unreachable.length) console.log(id, unreachable)
    expect(unreachable).toEqual([])
    // The server uses the one in `nav-graphs.ts`: if the map, movement or physics change, `pnpm nav`.
    expect(NAV_GRAPHS[id]).toEqual({ map: mapFingerprint(map), edges: g.edges as number[][] })
  }, 60000)
}

test("at Gemona the graph leads from the Duomo to the piazza", async () => {
  await initPhysics()
  const map = MAPS.glemone
  const g = navGraph(createPhysicsWorld(map))
  const duomo = map.navPoints.findIndex((p) => p[2] === -90)
  const piazza = map.navPoints.findIndex((p) => p[2] === 83 && p[0] === 0)
  expect(route(g, duomo, piazza).length).toBeGreaterThan(2)
  expect(route(g, piazza, duomo).length).toBeGreaterThan(2)
}, 30000)
