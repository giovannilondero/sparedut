/**
 * Attrezzi geometrici del mondo: un "cesto" che fonde le primitive per materiale,
 * un raccoglitore di istanze, archi, volte, quadrilateri e un PRNG deterministico.
 */
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

export type V = readonly [number, number, number]

export const rng = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** UV proiettate in coordinate mondo (metri / scala): le texture restano a misura d'uomo. */
export function worldUV(g: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  const p = g.getAttribute("position")
  const n = g.getAttribute("normal")
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
    let u: number, v: number
    if (ay >= ax && ay >= az) [u, v] = [x, z]
    else if (ax >= az) [u, v] = [z, y]
    else [u, v] = [x, y]
    uv[i * 2] = u / scale
    uv[i * 2 + 1] = v / scale
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
  return g
}

const WHITE = new THREE.Color(1, 1, 1)

/** Raccoglie geometrie per chiave di materiale e alla fine le fonde in una mesh ciascuna. */
export class Batch<K extends string> {
  private parts = new Map<K, THREE.BufferGeometry[]>()
  /** `ownKeys`: materiali che tengono sempre le UV proprie (atlante). */
  constructor(private readonly scales: Record<K, number>, private readonly ownKeys: readonly K[] = []) {}

  /** `ownUV`: tiene le UV della primitiva invece di proiettarle in mondo. */
  add(key: K, g: THREE.BufferGeometry, color: THREE.Color = WHITE, ownUV = false): void {
    if (this.ownKeys.includes(key)) ownUV = true
    if (!ownUV || !g.getAttribute("uv")) worldUV(g, this.scales[key])
    let ng = g.index ? g.toNonIndexed() : g
    if (ng === g) ng = g.clone()
    for (const name of Object.keys(ng.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") ng.deleteAttribute(name)
    ng.clearGroups()
    const count = ng.getAttribute("position").count
    const col = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) col.set([color.r, color.g, color.b], i * 3)
    ng.setAttribute("color", new THREE.BufferAttribute(col, 3))
    const list = this.parts.get(key) ?? []
    list.push(ng)
    this.parts.set(key, list)
    g.dispose()
  }

  build(materials: Record<K, THREE.Material>, opts: { cast?: (k: K) => boolean } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = []
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false)
      for (const g of list) g.dispose()
      if (!merged) continue
      merged.computeBoundingSphere()
      const m = new THREE.Mesh(merged, materials[key])
      m.name = `mondo:${key}`
      m.castShadow = opts.cast ? opts.cast(key) : true
      m.receiveShadow = true
      m.matrixAutoUpdate = false
      out.push(m)
    }
    this.parts.clear()
    return out
  }
}

/** Raccoglie matrici (e colori) per una InstancedMesh. */
export class Inst {
  readonly mats: THREE.Matrix4[] = []
  readonly cols: THREE.Color[] = []
  push(m: THREE.Matrix4, c?: THREE.Color): void {
    this.mats.push(m.clone())
    if (c) this.cols.push(c.clone())
  }
  build(geo: THREE.BufferGeometry, mat: THREE.Material, cast = false): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, this.mats.length))
    im.count = this.mats.length
    this.mats.forEach((m, i) => im.setMatrixAt(i, m))
    if (this.cols.length === this.mats.length && this.cols.length) this.cols.forEach((c, i) => im.setColorAt(i, c))
    im.castShadow = cast
    im.receiveShadow = true
    im.matrixAutoUpdate = false
    im.computeBoundingSphere()
    return im
  }
}

// --- primitive -------------------------------------------------------------------------

export function boxAt(min: V, max: V): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  return g
}

/** Quadrilatero a-b-c-d (antiorario visto dal davanti), UV 0..su lungo a→b, 0..sv lungo a→d. */
export function quad(a: V, b: V, c: V, d: V, su = 1, sv = 1): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3))
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, su, 0, su, sv, 0, sv], 2))
  g.setIndex([0, 1, 2, 0, 2, 3])
  g.computeVertexNormals()
  return g
}

export function tri(a: V, b: V, c: V): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c], 3))
  g.computeVertexNormals()
  return g
}

/** Punti di un arco (tondo con c=0, acuto con c>0) da (-a,0) all'imposta destra (a,0). */
export function archPoints(a: number, c: number, n = 10): [number, number][] {
  const R = a + c
  const tEnd = Math.acos(-c / R)
  const left: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const t = Math.PI + ((tEnd - Math.PI) * i) / n
    left.push([c + R * Math.cos(t), R * Math.sin(t)])
  }
  const right = left.slice(0, -1).reverse().map(([x, y]) => [-x, y] as [number, number])
  return [...left, ...right]
}

/** Pennacchi: rettangolo largo 2a e alto h con un arco ritagliato dal basso. Estruso lungo z per `d`. */
export function spandrel(a: number, h: number, d: number, c = 0): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-a, 0)
  s.lineTo(-a, h)
  s.lineTo(a, h)
  s.lineTo(a, 0)
  const pts = archPoints(a, c).reverse()
  for (const [x, y] of pts.slice(1, -1)) s.lineTo(x, Math.min(y, h - 0.05))
  s.lineTo(-a, 0)
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false })
  g.translate(0, 0, -d / 2)
  return g
}

/** Ghiera d'arco (archivolto) fra raggio interno `a1` e esterno `a2`, estrusa per `d`. */
export function archRing(a1: number, a2: number, d: number, c = 0, n = 14): THREE.BufferGeometry {
  const s = new THREE.Shape()
  const outer = archPoints(a2, c * (a2 / a1), n)
  const inner = archPoints(a1, c, n).reverse()
  s.moveTo(outer[0][0], outer[0][1])
  for (const [x, y] of outer.slice(1)) s.lineTo(x, y)
  for (const [x, y] of inner) s.lineTo(x, y)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false })
  g.translate(0, 0, -d / 2)
  return g
}

/** Superficie piana a forma d'arco (riempimento di finestre, lunette). */
export function archPanel(a: number, hRect: number, c = 0): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-a, -hRect)
  s.lineTo(a, -hRect)
  for (const [x, y] of archPoints(a, c).reverse()) s.lineTo(x, y)
  s.closePath()
  return new THREE.ShapeGeometry(s)
}

/** Volta a botte ribassata: asse lungo z (0..L), corda 2a lungo x, freccia `rise`; si vede da sotto. */
export function vault(a: number, rise: number, L: number, n = 10): THREE.BufferGeometry {
  const R = (a * a + rise * rise) / (2 * rise)
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= n; i++) {
    const s = -a + (2 * a * i) / n
    const y = Math.sqrt(R * R - s * s) - (R - rise)
    const nx = -s / R, ny = -(y + R - rise) / R
    pos.push(s, y, 0, s, y, L)
    nor.push(nx, ny, 0, nx, ny, 0)
    if (i < n) {
      const k = i * 2
      idx.push(k, k + 2, k + 1, k + 2, k + 3, k + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  return g
}

/** Matrice di una facciata: x lungo il muro, y in alto, z uscente (normale `n`), origine `p`. */
export function faceMatrix(n: V, p: V, out = new THREE.Matrix4()): THREE.Matrix4 {
  const nz = new THREE.Vector3(...n)
  const up = new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(up, nz)
  return out.makeBasis(u, up, nz).setPosition(p[0], p[1], p[2])
}

export const tf = (g: THREE.BufferGeometry, m: THREE.Matrix4) => g.applyMatrix4(m)
