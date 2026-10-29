import { expect, test } from "bun:test"
import { createPhysicsWorld, initPhysics } from "../shared/physics.ts"
import { navGraph, route } from "../server/nav.ts"
import { NAV_POINTS } from "../shared/map.ts"

test("il grafo dei bot collega Duomo e piazza in entrambi i sensi", async () => {
  await initPhysics()
  const g = navGraph(createPhysicsWorld())
  const isolated = g.edges.map((e, i) => (e.length === 0 ? i : -1)).filter((i) => i >= 0)
  if (isolated.length) console.log("isolati", isolated.map((i) => NAV_POINTS[i]))
  const duomo = NAV_POINTS.findIndex((p) => p[2] === -90)
  const piazza = NAV_POINTS.findIndex((p) => p[2] === 83 && p[0] === 0)
  // Ogni nodo deve raggiungere ogni altro.
  const unreachable: string[] = []
  for (let i = 0; i < NAV_POINTS.length; i++) {
    if (i !== duomo && route(g, duomo, i).length === 0) unreachable.push(`duomo→${NAV_POINTS[i]}`)
    if (i !== duomo && route(g, i, duomo).length === 0) unreachable.push(`${NAV_POINTS[i]}→duomo`)
  }
  if (unreachable.length) console.log(unreachable)
  expect(route(g, duomo, piazza).length).toBeGreaterThan(2)
  expect(route(g, piazza, duomo).length).toBeGreaterThan(2)
  expect(unreachable).toEqual([])
}, 30000)
