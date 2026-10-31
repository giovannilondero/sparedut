/**
 * The bots' navigation graph: the points of `NAV_POINTS`, linked only where
 * you can really get by walking (checked by the physics, ramps and jumps included).
 */
import { IDLE_INPUT } from "../shared/input.ts"
import type { MapId, V3 } from "../shared/map.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import type { PhysicsWorld } from "../shared/physics.ts"
import { NAV_GRAPHS } from "./nav-graphs.ts"

export interface NavGraph {
  readonly points: readonly V3[]
  readonly edges: readonly (readonly number[])[]
}

const MAX_EDGE = 26

function walkable(physics: PhysicsWorld, a: V3, b: V3): boolean {
  let body: Body = { x: a[0], y: a[1] + 0.05, z: a[2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false }
  const dist = Math.hypot(b[0] - a[0], b[2] - a[2])
  // shallow water is slower
  const ticks = Math.ceil((dist / (6.4 * (physics.map.wade?.speed ?? 1))) * 60 * 1.6) + 20
  let best = Infinity
  let since = 0
  for (let i = 0; i < ticks; i++) {
    const dx = b[0] - body.x
    const dz = b[2] - body.z
    const d2 = dx * dx + dz * dz
    if (d2 < 0.6 * 0.6) return Math.abs(body.y - b[1]) < 0.8
    // stuck against a wall (or a log) for half a second: no way through
    if (d2 < best - 0.01) {
      best = d2
      since = 0
    } else if (++since > 30) return false
    const yaw = Math.atan2(-dx, -dz)
    const step = stepBody(body, { ...IDLE_INPUT, mz: 1, yaw }, physics, 1)
    if (step.launchedBy) return false
    body = step.body
  }
  return false
}

/** One graph per map: the physics is static, so it's computed once per process. */
const cached = new Map<MapId, NavGraph>()
/** Maps whose precomputed graph we've already checked, good or not. */
const checked = new Set<MapId>()
/** Half-built graphs: the edges of the first `next` points, and the time spent so far. */
const partial = new Map<MapId, { edges: number[][]; next: number; ms: number }>()

/** The edges leaving point `i`. */
function rowOf(physics: PhysicsWorld, i: number): number[] {
  const points = physics.map.navPoints
  const out: number[] = []
  for (let j = 0; j < points.length; j++) {
    if (i === j) continue
    const a = points[i]
    const b = points[j]
    if (Math.hypot(b[0] - a[0], b[2] - a[2]) > MAX_EDGE) continue
    if (walkable(physics, a, b)) out.push(j)
  }
  return out
}

/** Advances a map's graph by `rows` points; returns the graph once it's finished. */
function advance(physics: PhysicsWorld, rows: number): NavGraph | null {
  const id = physics.map.id
  const hit = cached.get(id)
  if (hit) return hit
  const points = physics.map.navPoints
  if (!checked.has(id)) {
    checked.add(id)
    const ready = NAV_GRAPHS[id]
    if (ready && ready.map === mapFingerprint(physics.map)) {
      const graph = { points, edges: ready.edges }
      cached.set(id, graph)
      return graph
    }
    console.warn(`🧭 Bot graph (${id}) needs rebuilding: the map has changed, run \`pnpm nav\``)
  }
  const state = partial.get(id) ?? { edges: [], next: 0, ms: 0 }
  partial.set(id, state)
  const started = performance.now()
  for (let k = 0; k < rows && state.next < points.length; k++) state.edges.push(rowOf(physics, state.next++))
  state.ms += performance.now() - started
  if (state.next < points.length) return null
  const graph = { points, edges: state.edges }
  cached.set(id, graph)
  partial.delete(id)
  const count = graph.edges.reduce((n, e) => n + e.length, 0)
  console.log(`🧭 Bot graph (${id}): ${points.length} points, ${count} edges (${Math.round(state.ms)} ms)`)
  return graph
}

/**
 * A map's graph: the one precomputed in `nav-graphs.ts` if the map hasn't changed,
 * otherwise computed here (seconds of CPU, tens for the Laguna).
 */
export function navGraph(physics: PhysicsWorld): NavGraph {
  return advance(physics, Infinity)!
}

/** Computes the graph from scratch, ignoring the precomputed one: for `pnpm nav` and the tests. */
export function computeNavGraph(physics: PhysicsWorld): NavGraph {
  const points = physics.map.navPoints
  return { points, edges: points.map((_, i) => rowOf(physics, i)) }
}

/**
 * The fingerprint of a map's data (FNV-1a): the precomputed graph holds as long as it doesn't change.
 * Changing movement or physics doesn't affect it: `nav.test.ts` catches that.
 */
export function mapFingerprint(map: PhysicsWorld["map"]): string {
  const text = JSON.stringify(map)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, "0")
}

/**
 * A small piece of the graph (one starting point), to warm it up without stalling the server:
 * `true` once it's ready. If a match asks for it sooner, `navGraph` finishes the rest.
 */
export function warmNavGraph(physics: PhysicsWorld): boolean {
  return advance(physics, 1) !== null
}

export function nearestNode(graph: NavGraph, p: { x: number; y: number; z: number }): number {
  let best = 0
  let bestD = Infinity
  graph.points.forEach((q, i) => {
    const d = (q[0] - p.x) ** 2 + ((q[1] - p.y) * 3) ** 2 + (q[2] - p.z) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** Shortest path (Dijkstra, small graph) from one node to another, excluding the start node. */
export function route(graph: NavGraph, from: number, to: number): number[] {
  const n = graph.points.length
  const dist = Array.from({ length: n }, () => Infinity)
  const prev = Array.from({ length: n }, () => -1)
  const done = Array.from({ length: n }, () => false)
  dist[from] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0 || dist[u] === Infinity) break
    if (u === to) break
    done[u] = true
    for (const v of graph.edges[u]) {
      const a = graph.points[u]
      const b = graph.points[v]
      const d = dist[u] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      if (d < dist[v]) {
        dist[v] = d
        prev[v] = u
      }
    }
  }
  if (dist[to] === Infinity) return []
  const path: number[] = []
  for (let c = to; c !== from && c >= 0; c = prev[c]) path.unshift(c)
  return path
}
