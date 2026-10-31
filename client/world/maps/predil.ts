/**
 * Cave dal Predil: rails and sleepers, the galarie (mine tunnel) with its timber supports and lamps,
 * the steel headframe of the Poç Clara with its turning wheels, the carei (mine carts), the bell
 * gable of the Sante Barbare church; all around the crags of the Julian Alps and, to the south, Lake Predil.
 */
import * as THREE from "three"
import { CAREI, GALARIE, MONT, P_LOW, P_MID, P_UP, POC, TRAMOGGE } from "../../../shared/maps/predil.ts"
import { fbm, makeHeightfield, smooth } from "../backdrop.ts"
import { boxAt, type V } from "../geo.ts"
import type { Scenery, SceneryKit } from "../scenery.ts"

/** Decorative rails, besides the cjar's: inside the galarie, under the hopper, towards the shaft and the washery. */
const SIDINGS: readonly (readonly (readonly [number, number])[])[] = [
  [[-27, -64], [-27, -70], [-16, -70], [-16, -82], [-12, -82], [-5, -82]],
  [[-27, -70], [-38, -70], [-38, -92], [-16, -92], [-16, -82]],
  [[-27, -50], [-34, -44], [-34, -36]],
  [[0, -14], [10, -2]],
  [[0, 46], [18, 49], [30, 49]]
]

function rails(kit: SceneryKit, pts: readonly V[]) {
  const { B, C, cylBetween } = kit
  const iron = C("#4a4440")
  const wood = C("#6a5038")
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = Math.hypot(b[0] - a[0], b[2] - a[2])
    if (len < 0.01) continue
    const ux = (b[0] - a[0]) / len, uz = (b[2] - a[2]) / len
    const yaw = Math.atan2(ux, uz)
    // sleepers every 0.8 m, rails in pieces from one to the next
    const n = Math.max(1, Math.ceil(len / 0.8))
    for (let k = 0; k <= n; k++) {
      const s = k * (len / n)
      const x = a[0] + ux * s, z = a[2] + uz * s
      const y = a[1] + ((b[1] - a[1]) * s) / len
      B.add("legno", new THREE.BoxGeometry(1.7, 0.1, 0.22).rotateY(yaw).translate(x, y + 0.05, z), wood)
      if (k === n) break
      const s2 = (k + 1) * (len / n)
      const y2 = a[1] + ((b[1] - a[1]) * s2) / len
      for (const side of [-0.55, 0.55]) {
        const ox = uz * side, oz = -ux * side
        B.add("ferro", cylBetween([x + ox, y + 0.14, z + oz], [a[0] + ux * s2 + ox, y2 + 0.14, a[2] + uz * s2 + oz], 0.045, 0.045, 4), iron)
      }
    }
  }
}

/** A mine cart inside its collision box. */
function cart(kit: SceneryKit, min: V, max: V, root: THREE.Group, rust: THREE.Material) {
  const { B, C, cylBetween } = kit
  const alongZ = max[2] - min[2] >= max[0] - min[0]
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2
  const L = (alongZ ? max[2] - min[2] : max[0] - min[0]) / 2
  const W = (alongZ ? max[0] - min[0] : max[2] - min[2]) / 2
  const y0 = min[1], y1 = max[1]
  const g = new THREE.Group()
  // the tub: wider at the top
  const tub = new THREE.CylinderGeometry(1, 0.82, y1 - y0 - 0.38, 4, 1, false, Math.PI / 4)
  tub.scale(W * 1.35, 1, L * 1.35)
  tub.translate(0, (y1 - y0 - 0.38) / 2 + 0.38, 0)
  g.add(new THREE.Mesh(tub, rust))
  if (!alongZ) g.rotation.y = Math.PI / 2
  g.position.set(cx, y0, cz)
  g.traverse((o) => {
    o.castShadow = true
    o.receiveShadow = true
  })
  root.add(g)
  // the ore inside, the frame and the wheels
  const P = (u: number, y: number, w: number): V => (alongZ ? [cx + w, y, cz + u] : [cx + u, y, cz + w])
  B.add("roccia", kit.sphere(P(0, y1 - 0.15, 0), Math.min(L, W) * 0.85, 0.35, 8), C("#6a6460"))
  B.add("ferro", boxAt(alongZ ? [cx - W * 0.7, y0 + 0.2, cz - L] : [cx - L, y0 + 0.2, cz - W * 0.7], alongZ ? [cx + W * 0.7, y0 + 0.38, cz + L] : [cx + L, y0 + 0.38, cz + W * 0.7]), C("#2a2622"))
  for (const u of [-L * 0.6, L * 0.6]) for (const w of [-W * 0.75, W * 0.75]) {
    const a = P(u, y0 + 0.22, w), b = P(u, y0 + 0.22, w + Math.sign(w) * 0.08)
    B.add("ferro", cylBetween(a, b, 0.22, 0.22, 10), C("#2a2622"))
  }
}

export const scenery: Scenery = {
  build(kit) {
    const { B, C, root, map, cylBetween, sphere, R } = kit
    const rust = new THREE.MeshStandardMaterial({ color: "#7a3a24", roughness: 0.85, metalness: 0.35 })
    const red = new THREE.MeshStandardMaterial({ color: "#8a2e22", roughness: 0.6, metalness: 0.5 })

    // --- rails ---
    rails(kit, map.track)
    for (const s of SIDINGS) rails(kit, s.map(([x, z]) => [x, kit.groundAt(x, z), z] as V))

    // --- galarie: timber supports, lamps, beams ---
    const timber = C("#7a5a3a")
    const lampCol = new THREE.Color(2.6, 1.7, 0.8)
    const { floor, ceiling } = MONT
    for (const g of GALARIE) {
      const alongZ = g.z1 - g.z0 > g.x1 - g.x0
      const a0 = alongZ ? g.z0 : g.x0, a1 = alongZ ? g.z1 : g.x1
      const w0 = alongZ ? g.x0 : g.z0, w1 = alongZ ? g.x1 : g.z1
      const P = (a: number, y: number, w: number): V => (alongZ ? [w, y, a] : [a, y, w])
      for (let a = a0 + 1.5; a < a1 - 0.5; a += 3.5) {
        // posts in the wall (inside the rock) and a beam under the vault
        for (const [w, d] of [[w0, 1], [w1, -1]] as const) {
          const p0 = P(a - 0.13, floor, w - d * 0.1), p1 = P(a + 0.13, ceiling - 0.2, w + d * 0.14)
          B.add("legno", boxAt([Math.min(p0[0], p1[0]), p0[1], Math.min(p0[2], p1[2])], [Math.max(p0[0], p1[0]), p1[1], Math.max(p0[2], p1[2])]), timber)
        }
        const c0 = P(a - 0.14, ceiling - 0.26, w0), c1 = P(a + 0.14, ceiling, w1)
        B.add("legno", boxAt([Math.min(c0[0], c1[0]), c0[1], Math.min(c0[2], c1[2])], [Math.max(c0[0], c1[0]), c1[1], Math.max(c0[2], c1[2])]), timber)
      }
      for (let a = a0 + 3; a < a1 - 1; a += 7) {
        const p = P(a, ceiling - 0.45, (w0 + w1) / 2)
        B.add("luce", new THREE.BoxGeometry(0.16, 0.22, 0.16).translate(p[0], p[1], p[2]), lampCol)
        B.add("ferro", cylBetween([p[0], p[1] + 0.1, p[2]], [p[0], ceiling - 0.26, p[2]], 0.012), C("#2a2622"))
      }
    }
    const lights = [
      [-27, ceiling - 0.6, -92],
      [-27, ceiling - 0.6, -70]
    ].map(([x, y, z]) => {
      const l = new THREE.PointLight("#ffb46a", 30, 18, 1.4)
      l.position.set(x, y, z)
      root.add(l)
      return l
    })
    // The exits: timber frame and stone cornice on the rock face.
    const portal = (n: V, c: V, w: number) => {
      const t = Math.abs(n[0]) > 0 ? "x" : "z"
      const along = (u: number, y: number, out: number): V => (t === "x" ? [c[0] + n[0] * out, y, c[2] + u] : [c[0] + u, y, c[2] + n[2] * out])
      for (const u of [-w / 2 - 0.35, w / 2]) {
        const p0 = along(u, floor, -0.3), p1 = along(u + 0.35, ceiling + 0.4, 0.12)
        B.add("legno", boxAt([Math.min(p0[0], p1[0]), p0[1], Math.min(p0[2], p1[2])], [Math.max(p0[0], p1[0]), p1[1], Math.max(p0[2], p1[2])]), C("#6a4a30"))
      }
      const l0 = along(-w / 2 - 0.6, ceiling, -0.3), l1 = along(w / 2 + 0.6, ceiling + 0.6, 0.16)
      B.add("legno", boxAt([Math.min(l0[0], l1[0]), l0[1], Math.min(l0[2], l1[2])], [Math.max(l0[0], l1[0]), l1[1], Math.max(l0[2], l1[2])]), C("#5a3a22"))
      const s0 = along(-w / 2 - 1.2, ceiling + 0.6, -0.3), s1 = along(w / 2 + 1.2, ceiling + 1.6, 0.1)
      B.add("pietra", boxAt([Math.min(s0[0], s1[0]), s0[1], Math.min(s0[2], s1[2])], [Math.max(s0[0], s1[0]), s1[1], Math.max(s0[2], s1[2])]), C("#c8c0b0"))
      const lamp = along(w / 2 + 0.6, ceiling - 0.3, 0.3)
      B.add("luce", new THREE.BoxGeometry(0.18, 0.24, 0.18).translate(...lamp), lampCol)
    }
    portal([1, 0, 0], [MONT.maxX, floor, -82], 4)
    portal([0, 0, 1], [-27, floor, MONT.maxZ], 4)

    // --- Poç Clara: the hoist house and the headframe ---
    const wheels: THREE.Group[] = []
    {
      const { minX, maxX, minZ, maxZ, floor: f, height, tower } = POC
      const top = f + height
      const brick = C("#b25c48")
      for (const s of ["east", "west", "south", "north", "top"] as const) B.add("pietra", kit.face([minX, f, minZ], [maxX, top, maxZ], s), s === "top" ? C("#8a8078") : brick)
      B.add("pietraChiara", boxAt([minX - 0.1, top - 0.35, minZ - 0.1], [maxX + 0.1, top, maxZ + 0.1]), C("#e8dcc8"))
      kit.door([0, 0, 1], [(minX + maxX) / 2, f, maxZ], 1.8, 2.8, C("#4a5a3a"))
      for (const x of [minX + 1.6, maxX - 1.6]) kit.win([0, 0, 1], [x, f + 3.6, maxZ], 1.2, 1.8, null, false)
      for (const z of [minZ + 2, maxZ - 2]) {
        kit.win([1, 0, 0], [maxX, f + 3.4, z], 1.1, 2, null, false)
        kit.win([-1, 0, 0], [minX, f + 3.4, z], 1.1, 2, null, false)
      }
      // the lattice: four tapering legs, rings and St Andrew's crosses
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
      const yt = top + tower
      const foot = (sx: number, sz: number): V => [cx + sx * 3.4, top, cz + sz * 3.4]
      const head = (sx: number, sz: number): V => [cx + sx * 1.5, yt, cz + sz * 1.5]
      const lerp = (a: V, b: V, k: number): V => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
      const steel = C("#8a2e22")
      const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      for (const [sx, sz] of corners) B.add("ferro", cylBetween(foot(sx, sz), head(sx, sz), 0.16, 0.12, 6), steel)
      const levels = 7
      for (let i = 0; i <= levels; i++) {
        const k = i / levels
        for (let c = 0; c < 4; c++) {
          const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4]
          const p = lerp(foot(ax, az), head(ax, az), k), q = lerp(foot(bx, bz), head(bx, bz), k)
          B.add("ferro", cylBetween(p, q, 0.07, 0.07, 4), steel)
          if (i < levels) {
            const k2 = (i + 1) / levels
            const p2 = lerp(foot(ax, az), head(ax, az), k2), q2 = lerp(foot(bx, bz), head(bx, bz), k2)
            B.add("ferro", cylBetween(p, q2, 0.05, 0.05, 4), steel)
            B.add("ferro", cylBetween(q, p2, 0.05, 0.05, 4), steel)
          }
        }
      }
      // slanted support legs, towards the north on the hoist house roof
      for (const sx of [-1, 1]) B.add("ferro", cylBetween([cx + sx * 2.6, top, minZ + 0.4], head(sx, -1), 0.13, 0.1, 6), steel)
      B.add("ferro", boxAt([cx - 2.1, yt, cz - 2.1], [cx + 2.1, yt + 0.25, cz + 2.1]), C("#3a2a24"))
      for (const [sx, sz] of corners) B.add("ferro", cylBetween([cx + sx * 2, yt + 0.25, cz + sz * 2], [cx + sx * 2, yt + 1.3, cz + sz * 2], 0.03), C("#3a2a24"))
      // the wheels (they turn), the cables going down the shaft
      for (const dz of [-0.75, 0.75]) {
        const w = new THREE.Group()
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.09, 6, 28), red)
        rim.rotation.y = Math.PI / 2
        w.add(rim)
        for (let s = 0; s < 8; s++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.1, 0.08), red)
          spoke.rotation.x = (s / 8) * Math.PI
          w.add(spoke)
        }
        w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10).rotateZ(Math.PI / 2), red))
        w.position.set(cx, yt + 2, cz + dz)
        w.traverse((o) => (o.castShadow = true))
        root.add(w)
        wheels.push(w)
        B.add("ferro", cylBetween([cx, yt + 2 - 1.6, cz + dz], [cx, top + 0.05, cz + dz], 0.025, 0.025, 4), C("#1a1816"))
      }
      for (const sx of [-1, 1]) B.add("ferro", cylBetween([cx + sx * 0.6, yt + 0.25, cz], [cx + sx * 0.6, yt + 2, cz], 0.1, 0.1, 6), steel)

      // --- carei (mine carts) ---
      for (const c of CAREI) cart(kit, c.min, c.max, root, rust)

      // --- hopper: timber edges and ore on top ---
      {
        const t = TRAMOGGE
        const y = t.floor + t.top
        B.add("legno", boxAt([t.minX - 0.1, y, t.minZ - 0.1], [t.maxX + 0.1, y + 0.6, t.minZ + 0.15]), timber)
        B.add("legno", boxAt([t.minX - 0.1, y, t.maxZ - 0.15], [t.maxX + 0.1, y + 0.6, t.maxZ + 0.1]), timber)
        B.add("roccia", sphere([(t.minX + t.maxX) / 2, y, (t.minZ + t.maxZ) / 2], 3.4, 0.25, 10), C("#7a7470"))
        for (const x of [t.minX + 0.4, t.maxX - 0.4]) B.add("legno", cylBetween([x, t.floor + t.under, t.minZ + 0.2], [x, t.floor, t.maxZ - 0.2], 0.08), timber)
      }

      // --- the bell gable of the Sante Barbare church ---
      {
        const zf = 100
        const stone = C("#d8d0c4")
        B.add("pietra", boxAt([-1.8, P_LOW + 11, zf], [-1.1, P_LOW + 17, zf + 0.8]), stone)
        B.add("pietra", boxAt([1.1, P_LOW + 11, zf], [1.8, P_LOW + 17, zf + 0.8]), stone)
        B.add("pietra", boxAt([-2, P_LOW + 17, zf], [2, P_LOW + 18, zf + 0.8]), stone)
        B.add("pietra", new THREE.ConeGeometry(0.5, 0.9, 4).rotateY(Math.PI / 4).translate(0, P_LOW + 18.45, zf + 0.4), stone)
        B.add("ferro", sphere([0, P_LOW + 15.6, zf + 0.4], 0.5, 1.1, 10), C("#a07a30"))
        B.add("ferro", cylBetween([0, P_LOW + 18.9, zf + 0.4], [0, P_LOW + 19.8, zf + 0.4], 0.04), C("#2a2622"))
        B.add("ferro", boxAt([-0.3, P_LOW + 19.4, zf + 0.36], [0.3, P_LOW + 19.48, zf + 0.44]), C("#2a2622"))
      }
    }

    // --- boulders up on the mountain and the crag ---
    for (let i = 0; i < 26; i++) {
      const x = MONT.minX + 2 + R() * (MONT.maxX - MONT.minX - 4)
      const z = MONT.minZ + 2 + R() * (MONT.maxZ - MONT.minZ - 4)
      B.add("roccia", sphere([x, MONT.top, z], 1.2 + R() * 2.2, 0.55 + R() * 0.4, 7), C("#ffffff").offsetHSL(0, 0, (R() - 0.5) * 0.12))
    }
    for (let i = 0; i < 30; i++) {
      const x = map.bounds.minX + R() * (map.bounds.maxX - map.bounds.minX)
      B.add("roccia", sphere([x, P_UP + 24, -101.5], 2 + R() * 3, 0.8 + R() * 0.8, 7), C("#ffffff").offsetHSL(0, 0, (R() - 0.5) * 0.12))
    }
    // pines between the village and the washeries, near the edges
    for (const [x, z] of [[-43, 30.5], [43, 31], [-43, 104], [43, 106], [24, 104]] as const) {
      const y = kit.groundAt(x, z)
      B.add("legno", cylBetween([x, y, z], [x, y + 2, z], 0.18, 0.14, 6), C("#5a3a22"))
      for (let k = 0; k < 3; k++) B.add("erba", new THREE.ConeGeometry(1.6 - k * 0.4, 2.2, 7).translate(x, y + 2.2 + k * 1.4, z), C("#3d5e2a"))
    }

    return {
      update(t) {
        // the two wheels turn in opposite directions: one hoists the cage, the other lowers it
        for (const [i, w] of wheels.entries()) w.rotation.x = t * (i % 2 ? -0.9 : 0.9)
      },
      setQuality(q) {
        for (const l of lights) l.visible = q !== "bassa"
      }
    }
  },

  backdrop({ map }) {
    const { minX, maxX, minZ, maxZ } = map.bounds
    const ground = (z: number) => (z < -30 ? P_UP : z < 30 ? P_MID : P_LOW) - 0.4
    const height = (x: number, z: number) => {
      const dx = Math.max(minX - x, x - maxX, 0)
      const dn = Math.max(minZ - z, 0)
      const ds = Math.max(z - maxZ, 0)
      // narrow valley: steep crags east and west, the mountain above the galarie to the north
      const walls = smooth(0, 150, dx) ** 0.7 * (320 + 280 * fbm(x / 210 + 5, z / 210 + 2))
      const north = smooth(0, 220, dn) ** 0.8 * (420 + 220 * fbm(x / 180, z / 180 + 9))
      // to the south the valley slopes gently down to the lake
      const valley = -smooth(80, 420, ds) * 12
      return ground(Math.max(minZ, Math.min(maxZ, z))) + Math.max(walls, north) + valley
    }
    const terrain = makeHeightfield(height, map.bounds, 503)
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(220, 520).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#3c6f80", roughness: 0.08, metalness: 0.25 }))
    lake.position.set(0, -11.5, maxZ + 560)
    lake.receiveShadow = true
    return [terrain, lake]
  },

  menu: {
    path: [
      [0, 14, -62],
      [26, 18, -34],
      [30, 14, 8],
      [10, 12, 40],
      [-20, 16, 62],
      [-26, 18, 10],
      [-20, 20, -40]
    ],
    look: [
      [-20, 8, -60],
      [16, 18, -2],
      [0, 5, 8],
      [0, 4, 80],
      [0, 6, 30],
      [16, 15, -2],
      [-27, 8, -55]
    ]
  },
  light: { sun: [-0.45, 0.62, 0.62], fog: 0.0014 }
}

