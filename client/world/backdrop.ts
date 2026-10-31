/**
 * The unreachable backdrop: gradient sky with a low sun and, for Gemona, the Prealps to
 * the north and east (Chiampon, Glemina), the castle hill, the rest of the town and the
 * plain to the south. The other maps use `makeHeightfield` with their own relief.
 */
import * as THREE from "three"
import type { Bounds } from "../../shared/map.ts"
import { G_DUOMO, G_LOW, G_MID, GLEMONE } from "../../shared/maps/glemone.ts"
import { boxAt, Inst, rng } from "./geo.ts"

/** A map's sky: by day (late afternoon, with a low sun) or by night (with the moon). */
export type Sky = "di" | "gnot"

export interface SkyPalette {
  readonly zenith: string
  readonly mid: string
  /** Horizon, scene background and fog colour. */
  readonly horizon: string
  /** The wide glow around the body, the tight one and the disc (in HDR). */
  readonly glow: V3
  readonly halo: V3
  readonly disc: V3
  /** Cosine of the disc radius: smaller = bigger disc. */
  readonly discCos: number
  /** Clouds: in shadow and against the light, and how much they cover. */
  readonly cloudDark: V3
  readonly cloudLit: V3
  readonly cloudAlpha: number
  readonly stars: number
  /** Sky and ground light, and the body that casts the shadows. */
  readonly hemi: { readonly sky: string; readonly ground: string; readonly intensity: number }
  readonly sun: { readonly color: string; readonly intensity: number }
}
type V3 = readonly [number, number, number]

export const SKIES = {
  di: {
    zenith: "#4a79b8",
    mid: "#a7bfd8",
    horizon: "#f0c592",
    glow: [0.55, 0.341, 0.165],
    halo: [0.9, 0.72, 0.495],
    disc: [6, 5.52, 4.8],
    discCos: 0.9993,
    cloudDark: [1.05, 0.82, 0.65],
    cloudLit: [1.05, 0.98, 0.89],
    cloudAlpha: 0.75,
    stars: 0,
    hemi: { sky: "#cfe0f5", ground: "#9a7a55", intensity: 1.25 },
    sun: { color: "#ffd3a0", intensity: 3.1 }
  },
  gnot: {
    zenith: "#050a18",
    mid: "#0f1a33",
    horizon: "#1c2a44",
    glow: [0.05, 0.07, 0.12],
    halo: [0.22, 0.26, 0.34],
    disc: [2.6, 2.6, 2.35],
    discCos: 0.9988,
    cloudDark: [0.06, 0.08, 0.13],
    cloudLit: [0.42, 0.46, 0.56],
    cloudAlpha: 0.55,
    stars: 1,
    hemi: { sky: "#5a6c98", ground: "#1c1c26", intensity: 0.75 },
    sun: { color: "#a8bce8", intensity: 1.3 }
  }
} as const satisfies Record<Sky, SkyPalette>

/** Sky on a unit sphere drawn at the far plane (no need to make it big). */
export function makeSky(sunDir: THREE.Vector3, sky: Sky = "di"): THREE.Mesh {
  const p = SKIES[sky]
  const v = (c: V3) => new THREE.Vector3(...c)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(p.zenith) },
      uMid: { value: new THREE.Color(p.mid) },
      uHorizon: { value: new THREE.Color(p.horizon) },
      uSun: { value: sunDir.clone().normalize() },
      uTime: { value: 0 },
      uGlow: { value: v(p.glow) },
      uHalo: { value: v(p.halo) },
      uDisc: { value: v(p.disc) },
      uDiscCos: { value: p.discCos },
      uCloudDark: { value: v(p.cloudDark) },
      uCloudLit: { value: v(p.cloudLit) },
      uCloudAlpha: { value: p.cloudAlpha },
      uStars: { value: p.stars }
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // just inside the far plane: always behind everything, never clipped
        gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uMid, uHorizon, uSun, uGlow, uHalo, uDisc, uCloudDark, uCloudLit;
      uniform float uTime, uDiscCos, uCloudAlpha, uStars;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
        col = mix(col, uZenith, smoothstep(0.18, 0.75, h));
        col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.2, h));
        float s = max(dot(d, uSun), 0.0);
        // stars: a bunch of points on the sphere, twinkling
        if (uStars > 0.0 && h > 0.0) {
          vec2 g = floor(vec2(atan(d.z, d.x) * 260.0, asin(h) * 260.0));
          float r = hash(g);
          float tw = 0.6 + 0.4 * sin(uTime * (1.5 + r * 3.0) + r * 40.0);
          col += vec3(0.85, 0.9, 1.0) * step(0.9965, r) * tw * smoothstep(0.03, 0.3, h) * uStars * (0.5 + 2.0 * fract(r * 913.0));
        }
        col += uGlow * pow(s, 8.0);
        col += uHalo * pow(s, 64.0);
        // the disc, with some markings (the moon) or clean (the sun)
        float disc = smoothstep(uDiscCos, uDiscCos + 0.0004, s);
        col += uDisc * disc * (1.0 - uStars * 0.3 * noise(d.xy * 1400.0 + d.z * 700.0));
        // streaky clouds, denser towards the horizon
        if (h > 0.0) {
          vec2 q = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, 0.0);
          float n = noise(q * vec2(0.6, 2.2)) * 0.6 + noise(q * vec2(1.3, 4.0)) * 0.3 + noise(q * 5.0) * 0.1;
          float c = smoothstep(0.55, 0.85, n) * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.35, 0.7, h));
          vec3 cloud = mix(uCloudDark, uCloudLit, pow(s, 3.0));
          col = mix(col, cloud, c * uCloudAlpha);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  })
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat)
  m.frustumCulled = false
  m.renderOrder = -1000
  m.name = "cielo"
  // follows the camera drawing it (including the environment map's cube cameras)
  m.onBeforeRender = (_r, _s, cam) => {
    m.position.setFromMatrixPosition(cam.matrixWorld)
    m.updateMatrixWorld()
  }
  return m
}

// --- relief -----------------------------------------------------------------------------

const BOUNDS = GLEMONE.bounds

export const hash2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
/** Fractal noise in roughly [0, 1]: relief and patches. */
export const fbm = (x: number, y: number) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.28 + vnoise(x * 4.3, y * 4.3) * 0.17
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const terrace = (z: number) => (z < -28 ? G_DUOMO : z < 10 ? G_MID : G_LOW)

/** Distance from the nearby town's rectangle (~110 m outside the BOUNDS). */
const outside = (x: number, z: number) => {
  const dx = Math.max(Math.abs(x) - 150, 0)
  const dz = Math.max(z < 0 ? -205 - z : z - 205, 0)
  return Math.hypot(dx, dz)
}

/** Castle hill. */
const CASTLE = { x: 0, z: -178, top: 31 }
const castleHill = (x: number, z: number) => {
  const d = Math.hypot((x - CASTLE.x) * 0.9, z - CASTLE.z)
  return Math.max(0, 1 - d / 80) ** 1.6 * (CASTLE.top - G_DUOMO)
}

function height(x: number, z: number): number {
  const near = terrace(z) - 0.4
  const north = smooth(-290, -620, z)
  const east = smooth(250, 540, x) * smooth(420, 40, z)
  const west = smooth(-500, -1000, x) * 0.55
  const m = Math.max(north, east, west)
  const ridge = 150 + 170 * fbm(x / 260 + 3, z / 260) + 140 * smooth(-600, -1000, z) * fbm(x / 120, z / 120)
  const plain = z > 120 ? -Math.min(30, (z - 120) * 0.06) + fbm(x / 200, z / 200) * 3 : near
  const far = m * ridge + (1 - m) * plain
  const b = smooth(0, 90, outside(x, z))
  return near + (far - near) * b + (z < -100 ? castleHill(x, z) : 0)
}

/** Prealps, hills and plain around Gemona. */
export const makeTerrain = () => makeHeightfield(height, BOUNDS)

/**
 * Relief around the map: a 2.6 km flat-shaded grid, coloured by height
 * (fields low down, woods above 14 m, rock up high or on steep slopes). Cells
 * inside `hole` (the map bounds) stay empty: the playable terrain is there.
 */
export function makeHeightfield(height: (x: number, z: number) => number, hole: Bounds, seed = 301): THREE.Mesh {
  const BOUNDS = hole
  const N = 110, SIZE = 2600, step = SIZE / N
  const pos: number[] = []
  const col: number[] = []
  const r = rng(seed)
  const c = new THREE.Color()
  const field = [new THREE.Color("#8e9a4a"), new THREE.Color("#b3a85a"), new THREE.Color("#6f8a3e"), new THREE.Color("#c2a463"), new THREE.Color("#7b8f52")]
  const forest = new THREE.Color("#3d5e2a")
  const forest2 = new THREE.Color("#4f7034")
  const rock = new THREE.Color("#a59d8e")
  const rock2 = new THREE.Color("#c4bcae")
  const P = (i: number, j: number): [number, number, number] => {
    const x = -SIZE / 2 + i * step, z = -SIZE / 2 + j * step
    return [x, height(x, z), z]
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const a = P(i, j), b = P(i + 1, j), d = P(i, j + 1), e = P(i + 1, j + 1)
    // cells under the town stay hidden: skip them
    const cx = (a[0] + e[0]) / 2, cz = (a[2] + e[2]) / 2
    if (cx > BOUNDS.minX && cx < BOUNDS.maxX && cz > BOUNDS.minZ && cz < BOUNDS.maxZ) continue
    for (const t of [[a, d, b], [b, d, e]]) {
      const y = (t[0][1] + t[1][1] + t[2][1]) / 3
      const slope = Math.max(Math.abs(t[0][1] - t[1][1]), Math.abs(t[1][1] - t[2][1]), Math.abs(t[0][1] - t[2][1])) / step
      if (y > 210 || slope > 1.5) c.copy(r() < 0.5 ? rock : rock2).lerp(forest, smooth(260, 120, y) * 0.7)
      else if (y > 14) c.copy(r() < 0.5 ? forest : forest2)
      else c.copy(field[Math.floor(hash2(Math.floor(cx / 60), Math.floor(cz / 45)) * field.length)])
      c.offsetHSL(0, 0, (r() - 0.5) * 0.04)
      for (const p of t) {
        pos.push(...p)
        col.push(c.r, c.g, c.b)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3))
  // smooth normals from the heightfield: soft relief, tiled colours
  const nor: number[] = []
  const e = 6
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], z = pos[i + 2]
    const n = new THREE.Vector3(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize()
    nor.push(n.x, n.y, n.z)
  }
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3))
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }))
  m.name = "prealpi"
  m.receiveShadow = true
  m.matrixAutoUpdate = false
  return m
}

/** The rest of Gemona: simple instanced houses beyond the BOUNDS, trees, the castle. */
export function makeTown(tex: { facciata: THREE.Texture; coppi: THREE.Texture; pietra: THREE.Texture }): THREE.Object3D {
  const root = new THREE.Group()
  root.name = "paese"
  const r = rng(401)
  const walls = new Inst()
  const roofs = new Inst()
  const trees = new Inst()
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const plaster = ["#e9c98f", "#e7b7a5", "#efe8da", "#efd583", "#d9a86a", "#f0d9c0"].map((h) => new THREE.Color(h))
  const roofCol = ["#c07a5e", "#b06a52", "#c8866a", "#a06a58"].map((h) => new THREE.Color(h))
  const inBounds = (x: number, z: number, pad: number) => x > BOUNDS.minX - pad && x < BOUNDS.maxX + pad && z > BOUNDS.minZ - pad && z < BOUNDS.maxZ + pad

  for (let x = -190; x <= 190; x += 12) for (let z = -260; z <= 260; z += 12) {
    const px = x + (r() - 0.5) * 4, pz = z + (r() - 0.5) * 4
    if (inBounds(px, pz, 6)) continue
    if (castleHill(px, pz) > 1.5) continue
    const ground = height(px, pz)
    const out = outside(px, pz)
    if (out > 40 || ground > 30) continue
    if (r() < 0.22) {
      // a tree instead of the house
      const s = 0.8 + r() * 0.8
      trees.push(m.compose(new THREE.Vector3(px, ground, pz), q.identity(), new THREE.Vector3(s, s * (1 + r()), s)))
      continue
    }
    const w = 7 + r() * 4, d = 7 + r() * 4, h = 6 + Math.floor(r() * 3) * 3
    const rot = r() < 0.5 ? 0 : Math.PI / 2
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot)
    walls.push(m.compose(new THREE.Vector3(px, ground + h / 2 - 0.5, pz), q, new THREE.Vector3(w, h + 1, d)), plaster[Math.floor(r() * plaster.length)])
    roofs.push(m.compose(new THREE.Vector3(px, ground + h, pz), q, new THREE.Vector3(w + 0.8, Math.min(w, d) * 0.35, d + 0.8)), roofCol[Math.floor(r() * roofCol.length)])
  }
  // Poplars and cypresses on the plain and the slopes.
  for (let i = 0; i < 260; i++) {
    const px = (r() - 0.5) * 1400, pz = 160 + r() * 700
    const s = 1 + r()
    trees.push(m.compose(new THREE.Vector3(px, height(px, pz), pz), q.identity(), new THREE.Vector3(s, s * (1.5 + r()), s)))
  }
  for (let i = 0; i < 120; i++) {
    const px = (r() - 0.5) * 400, pz = -200 - r() * 60
    const y = height(px, pz)
    if (y > 60) continue
    const s = 1.2 + r()
    trees.push(m.compose(new THREE.Vector3(px, y, pz), q.identity(), new THREE.Vector3(s, s * 1.2, s)))
  }

  const wallGeo = new THREE.BoxGeometry(1, 1, 1)
  const wallMat = new THREE.MeshLambertMaterial({ map: tex.facciata })
  root.add(walls.build(wallGeo, wallMat, true))
  // unit gable roof: 1×1 base at y=0, ridge at y=1
  const roofGeo = (() => {
    const s = new THREE.Shape()
    s.moveTo(-0.5, 0)
    s.lineTo(0.5, 0)
    s.lineTo(0, 1)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false })
    g.translate(0, 0, -0.5)
    return g
  })()
  root.add(roofs.build(roofGeo, new THREE.MeshLambertMaterial({ map: tex.coppi }), true))
  const treeGeo = (() => {
    const crown = new THREE.ConeGeometry(1.6, 7, 7)
    crown.translate(0, 5.5, 0)
    return crown
  })()
  root.add(trees.build(treeGeo, new THREE.MeshLambertMaterial({ color: "#46622f", flatShading: true })))

  root.add(makeCastle(tex.pietra))
  return root
}

/** Gemona castle on the hill to the north: crenellated walls, keep and clock tower. */
function makeCastle(pietra: THREE.Texture): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = []
  const y0 = G_DUOMO + castleHill(CASTLE.x, CASTLE.z + 6) - 1
  const cx = CASTLE.x, cz = CASTLE.z + 6
  const wall = (x0: number, z0: number, x1: number, z1: number, h: number) => {
    parts.push(boxAt([Math.min(x0, x1) - 0.8, y0 - 4, Math.min(z0, z1) - 0.8], [Math.max(x0, x1) + 0.8, y0 + h, Math.max(z0, z1) + 0.8]))
    // merlons
    const len = Math.hypot(x1 - x0, z1 - z0)
    for (let s = 0; s < len; s += 2.2) {
      const t = s / len
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t
      parts.push(boxAt([x - 0.5, y0 + h, z - 0.5], [x + 0.5, y0 + h + 1.2, z + 0.5]))
    }
  }
  const W = 26, D = 18
  wall(cx - W, cz - D, cx + W, cz - D, 7)
  wall(cx + W, cz - D, cx + W, cz + D, 7)
  wall(cx + W, cz + D, cx - W, cz + D, 7)
  wall(cx - W, cz + D, cx - W, cz - D, 7)
  // keep
  parts.push(boxAt([cx - 4, y0 - 4, cz - 8], [cx + 4, y0 + 22, cz]))
  for (const [dx, dz] of [[-4, -8], [0, -8], [3, -8], [-4, -4], [3, -4], [-4, -1], [0, -1], [3, -1]]) parts.push(boxAt([cx + dx, y0 + 22, cz + dz], [cx + dx + 1, y0 + 23.4, cz + dz + 1]))
  // clock tower, with a little roof
  parts.push(boxAt([cx + 14, y0 - 4, cz + 8], [cx + 19, y0 + 16, cz + 13]))
  const roof = new THREE.ConeGeometry(4, 4, 4)
  roof.rotateY(Math.PI / 4)
  roof.translate(cx + 16.5, y0 + 18, cz + 10.5)
  parts.push(roof)
  // palace inside the walls
  parts.push(boxAt([cx - 20, y0 - 4, cz + 4], [cx - 6, y0 + 10, cz + 14]))
  const merged = mergeAll(parts)
  const m = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ map: pietra, color: "#d8d0c2" }))
  m.name = "cjiscjel"
  m.castShadow = true
  m.receiveShadow = true
  m.matrixAutoUpdate = false
  return m
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k)
    n.clearGroups()
    return n
  })
  const pos: number[] = []
  const nor: number[] = []
  for (const g of list) {
    pos.push(...(g.getAttribute("position").array as Float32Array))
    nor.push(...(g.getAttribute("normal").array as Float32Array))
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3))
  // world-space UVs, 4 m
  const uv: number[] = []
  for (let i = 0; i < pos.length / 3; i++) {
    const ax = Math.abs(nor[i * 3]), ay = Math.abs(nor[i * 3 + 1]), az = Math.abs(nor[i * 3 + 2])
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
    if (ay >= ax && ay >= az) uv.push(x / 4, z / 4)
    else if (ax >= az) uv.push(z / 4, y / 4)
    else uv.push(x / 4, y / 4)
  }
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
  return out
}

/** Nearby ground outside the BOUNDS: the terraces continue flat under the houses. */
export function nearGround(): { min: [number, number, number]; max: [number, number, number] }[] {
  const out: { min: [number, number, number]; max: [number, number, number] }[] = []
  const bands: [number, number, number][] = [[-260, -28, G_DUOMO], [-28, 10, G_MID], [10, 260, G_LOW]]
  for (const [z0, z1, y] of bands) {
    out.push({ min: [-200, y - 6, z0], max: [BOUNDS.minX, y, z1] })
    out.push({ min: [BOUNDS.maxX, y - 6, z0], max: [200, y, z1] })
  }
  out.push({ min: [BOUNDS.minX, G_DUOMO - 6, -260], max: [BOUNDS.maxX, G_DUOMO, BOUNDS.minZ] })
  out.push({ min: [BOUNDS.minX, G_LOW - 6, BOUNDS.maxZ], max: [BOUNDS.maxX, G_LOW, 260] })
  return out
}
