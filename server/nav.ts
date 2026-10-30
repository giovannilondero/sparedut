/**
 * Grafo di navigazione dei bot: i punti di `NAV_POINTS`, collegati solo dove
 * si arriva davvero camminando (lo verifica la fisica, rampe e salti compresi).
 */
import { IDLE_INPUT } from "../shared/input.ts"
import type { MapId, V3 } from "../shared/map.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import type { PhysicsWorld } from "../shared/physics.ts"

export interface NavGraph {
  readonly points: readonly V3[]
  readonly edges: readonly (readonly number[])[]
}

const MAX_EDGE = 26

function walkable(physics: PhysicsWorld, a: V3, b: V3): boolean {
  let body: Body = { x: a[0], y: a[1] + 0.05, z: a[2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false }
  const dist = Math.hypot(b[0] - a[0], b[2] - a[2])
  // nell'acqua bassa si va più piano
  const ticks = Math.ceil((dist / (6.4 * (physics.map.wade?.speed ?? 1))) * 60 * 1.6) + 20
  let best = Infinity
  let since = 0
  for (let i = 0; i < ticks; i++) {
    const dx = b[0] - body.x
    const dz = b[2] - body.z
    const d2 = dx * dx + dz * dz
    if (d2 < 0.6 * 0.6) return Math.abs(body.y - b[1]) < 0.8
    // fermo contro un muro (o un tronco) da mezzo secondo: di lì non si passa
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

/** Un grafo per mappa: la fisica è statica, si calcola una volta per processo. */
const cached = new Map<MapId, NavGraph>()
/** I grafi a metà: gli archi dei primi `next` punti, e il tempo speso finora. */
const partial = new Map<MapId, { edges: number[][]; next: number; ms: number }>()

/** Gli archi che partono dal punto `i`. */
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

/** Avanza il grafo di una mappa di `rows` punti; restituisce il grafo quando è finito. */
function advance(physics: PhysicsWorld, rows: number): NavGraph | null {
  const id = physics.map.id
  const hit = cached.get(id)
  if (hit) return hit
  const points = physics.map.navPoints
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
  console.log(`🧭 Grafo dei bot (${id}): ${points.length} punti, ${count} archi (${Math.round(state.ms)} ms)`)
  return graph
}

export function navGraph(physics: PhysicsWorld): NavGraph {
  return advance(physics, Infinity)!
}

/**
 * Un pezzetto del grafo (un punto di partenza), per scaldarlo senza fermare il server:
 * `true` quando è pronto. Se una partita lo chiede prima, `navGraph` finisce il resto.
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

/** Percorso più corto (Dijkstra, grafo piccolo) da un nodo all'altro, nodi esclusa la partenza. */
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
