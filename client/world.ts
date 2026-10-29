/**
 * Il mondo visibile: Gemona attorno al Duomo, costruita dagli stessi dati delle
 * collisioni (`shared/map.ts`). Tutto ciò che si tocca coincide coi BLOCKS e i WEDGES;
 * sopra ci sono solo decori sottili: finestre, archi, tetti, statue, insegne.
 * Geometria statica fusa per materiale, ripetizioni istanziate, texture su canvas.
 */
import * as THREE from "three"
import {
  BLOCKS,
  BOUNDS,
  BUILDINGS,
  buildingBlocks,
  CAMPANILE,
  COMUNE,
  DUOMO,
  G_DUOMO,
  G_LOW,
  G_MID,
  JUMP_PADS,
  WEDGES,
  type Block,
  type Building,
  type Mat
} from "../shared/map.ts"
import type { WorldFrame, WorldScene, Quality } from "./contracts.ts"
import { HORIZON, makeSky, makeTerrain, makeTown, nearGround } from "./world/backdrop.ts"
import { createDynamic } from "./world/dynamic.ts"
import { archPanel, archRing, Batch, boxAt, faceMatrix, Inst, quad, rng, spandrel, tri, vault, type V } from "./world/geo.ts"
import { atlasDisc, atlasQuad, makeAtlas, makeTextures, setAnisotropy, type Region } from "./world/tex.ts"

type K =
  | "pietra"
  | "pietraChiara"
  | "intonaco"
  | "porfido"
  | "legno"
  | "cassa"
  | "fen"
  | "coppi"
  | "erba"
  | "marmo"
  | "ferro"
  | "pavimento"
  | "stoffa"
  | "vetro"
  | "luce"
  | "acqua"
  | "atlas"

const SCALES: Record<K, number> = {
  pietra: 3,
  pietraChiara: 3,
  intonaco: 4,
  porfido: 2.5,
  legno: 2,
  cassa: 1,
  fen: 1.5,
  coppi: 2,
  erba: 3,
  marmo: 2.5,
  ferro: 1,
  pavimento: 1.6,
  stoffa: 1,
  vetro: 1,
  luce: 1,
  acqua: 3,
  atlas: 1
}

const C = (hex: string) => new THREE.Color(hex)
const PLASTER: Partial<Record<Mat, string>> = {
  intonacoOcra: "#e0ac66",
  intonacoRosa: "#e3a090",
  intonacoBianco: "#efe8d8",
  intonacoGiallo: "#ecc864"
}
const PALETTE = ["#e0ac66", "#e3a090", "#efe8d8", "#ecc864", "#d98f6a", "#e8d2b0", "#c9b48a", "#f0dcb8"]
const SHUTTERS = ["#4d6b3a", "#3f5e45", "#6b4a2e", "#7d8f74", "#5e3326", "#56704f"].map(C)
const UP = new THREE.Vector3(0, 1, 0)

// --- appoggi geometrici --------------------------------------------------------------------

/** Una faccia di una scatola come quadrilatero (normale uscente). */
function face(min: V, max: V, side: "top" | "bottom" | "east" | "west" | "south" | "north"): THREE.BufferGeometry {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  switch (side) {
    case "top": return quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0])
    case "bottom": return quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1])
    case "south": return quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1])
    case "north": return quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0])
    case "east": return quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1])
    case "west": return quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0])
  }
}

/** Gira la geometria perché la normale guardi verso `dir`. */
function orient(g: THREE.BufferGeometry, dir: V): THREE.BufferGeometry {
  g.computeVertexNormals()
  const n = g.getAttribute("normal")
  if (n.getX(0) * dir[0] + n.getY(0) * dir[1] + n.getZ(0) * dir[2] >= 0) return g
  if (g.index) {
    const a = g.index.array as Uint16Array
    for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]]
    g.index.needsUpdate = true
  } else {
    const p = g.getAttribute("position") as THREE.BufferAttribute
    for (let i = 0; i < p.count; i += 3) {
      const [x, y, z] = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)]
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2))
      p.setXYZ(i + 2, x, y, z)
    }
  }
  g.computeVertexNormals()
  return g
}

/** Cilindro fra due punti (arti delle statue, aste). */
function cylBetween(a: V, b: V, r0: number, r1 = r0, seg = 8): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b)
  const len = va.distanceTo(vb)
  const g = new THREE.CylinderGeometry(r1, r0, len, seg)
  g.translate(0, len / 2, 0)
  const q = new THREE.Quaternion().setFromUnitVectors(UP, vb.clone().sub(va).normalize())
  g.applyQuaternion(q)
  g.translate(...a)
  return g
}

const sphere = (c: V, r: number, sy = 1, seg = 10) => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)).scale(1, sy, 1).translate(...c)

/** Quota del terreno (terrazze e rampe) in un punto. */
function groundAt(x: number, z: number): number {
  for (const w of WEDGES) {
    if (x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1) return w.y0 + ((w.y1 - w.y0) * (z - w.z0)) / (w.z1 - w.z0)
  }
  return z < -28 ? G_DUOMO : z < 10 ? G_MID : G_LOW
}

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number }
const SOLIDS: Rect[] = [
  ...BUILDINGS.map((b) => ({ minX: b.min[0], maxX: b.max[0], minZ: b.min[2], maxZ: b.max[2] })),
  DUOMO,
  COMUNE,
  CAMPANILE
]
/** Un punto appena fuori da una facciata è libero (né dentro un altro edificio né fuori dal mondo)? */
function open(x: number, z: number): boolean {
  if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return false
  return !SOLIDS.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ)
}

// --- il mondo -------------------------------------------------------------------------------

export function createWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer): WorldScene {
  setAnisotropy(renderer.capabilities.getMaxAnisotropy())
  const tex = makeTextures()
  const atlas = makeAtlas()
  const R = rng(2024)

  // Luce di fine pomeriggio: sole basso da sud-ovest, cielo caldo, foschia.
  const sunDir = new THREE.Vector3(-0.62, 0.4, 0.68).normalize()
  scene.fog = new THREE.FogExp2(HORIZON.getHex(), 0.0011)
  scene.background = HORIZON.clone()
  const sky = makeSky(sunDir)
  scene.add(sky)
  const hemi = new THREE.HemisphereLight("#cfe0f5", "#9a7a55", 1.25)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight("#ffd3a0", 3.1)
  const focus = new THREE.Vector3(0, 10, -2)
  sun.position.copy(focus).addScaledVector(sunDir, 260)
  sun.target.position.copy(focus)
  sun.castShadow = true
  const sm = renderer.capabilities.maxTextureSize >= 8192 ? 4096 : 2048
  sun.shadow.mapSize.set(sm, sm)
  sun.shadow.bias = -0.0003
  sun.shadow.normalBias = 0.05
  {
    // Il frustum d'ombra abbraccia esattamente il paese giocabile (più campanile e castello vicino).
    const cam = new THREE.OrthographicCamera()
    cam.position.copy(sun.position)
    cam.lookAt(focus)
    cam.updateMatrixWorld()
    const box = new THREE.Box3()
    const v = new THREE.Vector3()
    for (const x of [BOUNDS.minX - 2, BOUNDS.maxX + 2]) for (const y of [-3, 58]) for (const z of [BOUNDS.minZ - 2, BOUNDS.maxZ + 2]) box.expandByPoint(v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse))
    const s = sun.shadow.camera
    s.left = box.min.x
    s.right = box.max.x
    s.bottom = box.min.y
    s.top = box.max.y
    s.near = Math.max(1, -box.max.z - 60)
    s.far = -box.min.z + 10
    s.updateProjectionMatrix()
  }
  scene.add(sun, sun.target)

  // Mappa d'ambiente dal cielo, per metalli, vetri, acqua e marmo.
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envScene = new THREE.Scene()
  envScene.add(makeSky(sunDir))
  const envMap = pmrem.fromScene(envScene, 0, 0.1, 10).texture
  pmrem.dispose()

  // --- materiali ---
  const lam = (map: THREE.Texture | null, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map, vertexColors: true, ...extra })
  const MATS: Record<K, THREE.Material> = {
    pietra: lam(tex.pietra, { bumpMap: tex.pietra, bumpScale: 1.2 }),
    pietraChiara: lam(tex.pietraChiara),
    intonaco: lam(tex.intonaco),
    porfido: lam(tex.porfido, { bumpMap: tex.porfido, bumpScale: 1.5 }),
    legno: lam(tex.legno),
    cassa: lam(tex.cassa),
    fen: lam(tex.fen),
    coppi: lam(tex.coppi, { bumpMap: tex.coppi, bumpScale: 1 }),
    erba: lam(tex.erba),
    marmo: new THREE.MeshStandardMaterial({ map: tex.marmo, vertexColors: true, roughness: 0.35, envMap, envMapIntensity: 0.6 }),
    ferro: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6, envMap }),
    pavimento: new THREE.MeshStandardMaterial({ map: tex.pavimento, vertexColors: true, roughness: 0.3, envMap, envMapIntensity: 0.5 }),
    stoffa: lam(null, { side: THREE.DoubleSide }),
    vetro: new THREE.MeshStandardMaterial({ color: "#26303c", vertexColors: true, roughness: 0.12, metalness: 0.5, envMap, envMapIntensity: 1.2 }),
    luce: new THREE.MeshBasicMaterial({ vertexColors: true }),
    acqua: new THREE.MeshStandardMaterial({ color: "#3c7380", vertexColors: true, roughness: 0.06, metalness: 0.2, envMap, transparent: true, opacity: 0.88 }),
    atlas: lam(atlas.texture, { alphaTest: 0.5, side: THREE.DoubleSide })
  }
  const B = new Batch<K>(SCALES, ["atlas"])

  // Istanze ripetute.
  const I = {
    vetro: new Inst(),
    cornice: new Inst(),
    scuri: new Inst(),
    porta: new Inst(),
    vaso: new Inst(),
    capitello: new Inst(),
    base: new Inst(),
    comignolo: new Inst()
  }
  const M = new THREE.Matrix4()
  const S = new THREE.Matrix4()
  const place = (n: V, p: V, sx = 1, sy = 1, sz = 1) => faceMatrix(n, p, M).multiply(S.makeScale(sx, sy, sz))

  const matKey = (m: Mat): K => (m.startsWith("intonaco") ? "intonaco" : (m as K))
  const matColor = (m: Mat) => C(PLASTER[m] ?? "#ffffff")

  // --- 1. terreno e rampe -------------------------------------------------------------------
  const isTerrain = (b: Block) => b.look === "terreno" && b.mat === "porfido"
  for (const b of BLOCKS) {
    if (!isTerrain(b)) continue
    B.add("porfido", face(b.min, b.max, "top"))
    // il gradino verso sud è un muro di sostegno in pietra, con una copertina chiara
    B.add("pietra", face(b.min, b.max, "south"), C("#d8d0c4"))
    B.add("pietraChiara", boxAt([b.min[0], b.max[1] - 0.25, b.max[2]], [b.max[0], b.max[1], b.max[2] + 0.06]))
  }
  for (const w of WEDGES) {
    const yb = Math.min(w.y0, w.y1)
    B.add("porfido", orient(quad([w.x0, w.y0, w.z0], [w.x0, w.y1, w.z1], [w.x1, w.y1, w.z1], [w.x1, w.y0, w.z0]), [0, 1, 0]))
    B.add("pietra", orient(quad([w.x0, yb, w.z0], [w.x0, yb, w.z1], [w.x0, w.y1, w.z1], [w.x0, w.y0, w.z0]), [-1, 0, 0]))
    B.add("pietra", orient(quad([w.x1, yb, w.z0], [w.x1, yb, w.z1], [w.x1, w.y1, w.z1], [w.x1, w.y0, w.z0]), [1, 0, 0]))
  }
  // Le terrazze proseguono oltre i bordi, sotto il resto del paese.
  for (const g of nearGround()) {
    B.add("erba", face(g.min, g.max, "top"), C("#c8c4a0"))
    for (const s of ["south", "north"] as const) B.add("pietra", face(g.min, g.max, s), C("#b8b0a4"))
  }

  // --- 2. edifici ------------------------------------------------------------------------
  const buildingKeys = new Set<string>()
  const key = (b: Block) => `${b.min.join()}|${b.max.join()}`
  BUILDINGS.forEach((b, bi) => {
    for (const blk of buildingBlocks(b)) if (blk.look === "muro") buildingKeys.add(key(blk))
    drawBuilding(b, bi)
  })

  /** Punti di rottura lungo un asse: ogni 6-10 m una casa diversa. */
  function breaks(a0: number, a1: number, seed: number): number[] {
    const r = rng(seed)
    const out = [a0]
    let a = a0
    while (a1 - a > 12) {
      a += 6 + r() * 4
      out.push(a)
    }
    out.push(a1)
    return out
  }

  function drawBuilding(b: Building, bi: number) {
    const [x0, y0, z0] = b.min
    const [x1, y1, z1] = b.max
    const base = matColor(b.mat)
    const bx = breaks(x0, x1, bi * 7 + 1)
    const bz = breaks(z0, z1, bi * 7 + 2)
    const segColor = (i: number) => {
      const r = rng(bi * 31 + i * 7)
      return i % 2 === 0 || r() < 0.3 ? base.clone().offsetHSL(0, 0, (r() - 0.5) * 0.05) : C(PALETTE[Math.floor(r() * PALETTE.length)])
    }
    const segAt = (axis: "x" | "z", a: number) => {
      const br = axis === "x" ? bx : bz
      let i = 0
      while (i < br.length - 2 && a > br[i + 1]) i++
      return i + (axis === "x" ? 0 : 3)
    }
    const p = b.portico
    const top = p ? y0 + p.height : y0
    const blocks = buildingBlocks(b).filter((k) => k.look === "muro")

    for (const blk of blocks) {
      const [ax0, ay0, az0] = blk.min
      const [ax1, ay1, az1] = blk.max
      for (const side of ["east", "west", "south", "north"] as const) {
        const alongX = side === "south" || side === "north"
        const br = alongX ? bx : bz
        for (let i = 0; i < br.length - 1; i++) {
          const a = Math.max(br[i], alongX ? ax0 : az0)
          const c = Math.min(br[i + 1], alongX ? ax1 : az1)
          if (c - a < 0.01) continue
          const mn: V = alongX ? [a, ay0, az0] : [ax0, ay0, a]
          const mx: V = alongX ? [c, ay1, az1] : [ax1, ay1, c]
          B.add("intonaco", face(mn, mx, side), segColor(i + (alongX ? 0 : 3)))
        }
      }
      if (ay0 > y0 + 0.01) B.add("intonaco", face(blk.min, blk.max, "bottom"), C("#f2ece0"))
      if (b.roof === "piano") B.add("intonaco", face(blk.min, blk.max, "top"), base)
    }

    // Facce esposte: zoccolo, marcapiano, cornicione, finestre.
    type F = { n: V; plane: number; a0: number; a1: number; y0: number; y1: number; alongX: boolean; inner: boolean }
    const faces: F[] = []
    for (const blk of blocks) {
      const [ax0, ay0, az0] = blk.min
      const [ax1, ay1, az1] = blk.max
      const inner = !!p && ay1 <= top + 0.01
      faces.push({ n: [1, 0, 0], plane: ax1, a0: az0, a1: az1, y0: ay0, y1: ay1, alongX: false, inner: inner && p!.side === "east" })
      faces.push({ n: [-1, 0, 0], plane: ax0, a0: az0, a1: az1, y0: ay0, y1: ay1, alongX: false, inner: inner && p!.side === "west" })
      faces.push({ n: [0, 0, 1], plane: az1, a0: ax0, a1: ax1, y0: ay0, y1: ay1, alongX: true, inner: inner && p!.side === "south" })
      faces.push({ n: [0, 0, -1], plane: az0, a0: ax0, a1: ax1, y0: ay0, y1: ay1, alongX: true, inner: inner && p!.side === "north" })
    }
    const at = (f: F, a: number, y: number, out = 0): V => (f.alongX ? [a, y, f.plane + f.n[2] * out] : [f.plane + f.n[0] * out, y, a])
    const outside = (f: F, a: number) => {
      if (f.inner) return true
      const [x, , z] = at(f, a, 0, 0.6)
      return open(x, z)
    }
    const floors: number[] = [y0 + 1.6]
    for (let y = (p ? top : y0 + 3.4) + 1.7; y + 0.75 < y1 - 0.7; y += 3.1) floors.push(y)

    for (const f of faces) {
      const len = f.a1 - f.a0
      const n = Math.floor((len - 0.8) / 3)
      if (n < 1) continue
      const ground = f.y0 <= y0 + 0.01
      // zoccolo e cornicione (solo dove la facciata si vede)
      if (ground && outside(f, (f.a0 + f.a1) / 2)) {
        const lo = at(f, f.a0, f.y0), hi = at(f, f.a1, f.y0 + 0.7, 0.05)
        B.add("pietra", boxAt([Math.min(lo[0], hi[0]), lo[1], Math.min(lo[2], hi[2])], [Math.max(lo[0], hi[0]), hi[1], Math.max(lo[2], hi[2])]), C("#c9c0b2"))
      }
      if (f.y1 >= y1 - 0.01 && outside(f, (f.a0 + f.a1) / 2)) {
        const lo = at(f, f.a0 - 0.2, y1 - 0.45), hi = at(f, f.a1 + 0.2, y1 - 0.1, 0.28)
        B.add("pietraChiara", boxAt([Math.min(lo[0], hi[0]), lo[1], Math.min(lo[2], hi[2])], [Math.max(lo[0], hi[0]), hi[1], Math.max(lo[2], hi[2])]))
      }
      if (f.y0 <= top + 0.01 && f.y1 > top + 1 && p && !f.inner && outside(f, (f.a0 + f.a1) / 2)) {
        const lo = at(f, f.a0, top + 0.05), hi = at(f, f.a1, top + 0.3, 0.12)
        B.add("pietraChiara", boxAt([Math.min(lo[0], hi[0]), lo[1], Math.min(lo[2], hi[2])], [Math.max(lo[0], hi[0]), hi[1], Math.max(lo[2], hi[2])]))
      }
      for (let i = 0; i < n; i++) {
        const a = f.a0 + (len * (i + 0.5)) / n
        if (!outside(f, a)) continue
        const seg = segAt(f.alongX ? "x" : "z", a)
        const shutter = SHUTTERS[(seg + bi) % SHUTTERS.length].clone().offsetHSL(0, 0, (R() - 0.5) * 0.04)
        const [ox, , oz] = at(f, a, 0, 0.6)
        const gnd = groundAt(ox, oz)
        floors.forEach((yc, fl) => {
          if (yc - 1.3 < f.y0 - 0.01 || yc + 1.1 > f.y1) return
          if (fl === 0) {
            if (f.inner) {
              // bottega sotto il portico: porta e vetrina
              if (i % 2 === 0) door(f.n, at(f, a, f.y0), 1.3, 2.5, shutter)
              else win(f.n, at(f, a, f.y0 + 1.5), 1.6, 1.8, null, false)
              return
            }
            if (yc - 1.6 < gnd + 0.1) return
            if (i % 3 === 1 && Math.abs(gnd - f.y0) < 0.05) door(f.n, at(f, a, f.y0), 1.2, 2.4, shutter)
            else win(f.n, at(f, a, yc + 0.2), 0.9, 1.2, null, false)
            return
          }
          if (yc - 0.75 < gnd + 2) return
          const balcony = fl === 1 && i % 3 === 1 && b.name.includes("Vie Bini")
          if (balcony) {
            balconyAt(f.n, at(f, a, yc - 1.0))
            win(f.n, at(f, a, yc - 0.0), 1.0, 2.0, shutter, false)
          } else win(f.n, at(f, a, yc), 1.0, 1.5, shutter, R() < 0.35)
        })
      }
    }

    if (b.roof === "falde") {
      const { ridge, alongZ, rise } = roof(x0, z0, x1, z1, y1, segColor(0))
      // comignoli
      const r = rng(bi * 13 + 5)
      const len = alongZ ? z1 - z0 : x1 - x0
      const hw = (alongZ ? x1 - x0 : z1 - z0) / 2
      for (let k = 0; k < Math.max(2, Math.round(len / 9)); k++) {
        const u = (alongZ ? z0 : x0) + len * (0.1 + 0.8 * r())
        const w = (alongZ ? (x0 + x1) / 2 : (z0 + z1) / 2) + (r() - 0.5) * hw * 0.9
        const y = ridge - (Math.abs(w - (alongZ ? (x0 + x1) / 2 : (z0 + z1) / 2)) / hw) * rise - 0.9
        I.comignolo.push(M.makeTranslation(alongZ ? w : u, y, alongZ ? u : w), base.clone().offsetHSL(0, 0, -0.05))
      }
    }
  }

  /** Tetto a falde (colmo lungo il lato lungo): coppi, timpani, sottogronda, colmo. */
  function roof(x0: number, z0: number, x1: number, z1: number, yTop: number, gable: THREE.Color, rise0?: number, gableKey: K = "intonaco") {
    const alongZ = z1 - z0 >= x1 - x0
    const P = (u: number, y: number, w: number): V => (alongZ ? [w, y, u] : [u, y, w])
    const [u0, u1, w0, w1] = alongZ ? [z0, z1, x0, x1] : [x0, x1, z0, z1]
    const wc = (w0 + w1) / 2, hw = (w1 - w0) / 2
    const rise = rise0 ?? Math.min(hw * 0.55, 4.5)
    const s = rise / hw
    const o = 0.6
    const ye = yTop - o * s, yr = yTop + rise
    const U0 = u0 - o, U1 = u1 + o
    const slope = Math.hypot(hw + o, rise + o * s)
    const dirW = (sign: number): V => (alongZ ? [sign, 0, 0] : [0, 0, sign])
    for (const [we, sign] of [[w0 - o, -1], [w1 + o, 1]] as const) {
      const n = dirW(sign)
      const up: V = [n[0] * 0.5, 1, n[2] * 0.5]
      B.add("coppi", orient(quad(P(U0, ye, we), P(U1, ye, we), P(U1, yr, wc), P(U0, yr, wc), (U1 - U0) / 2.6, slope / 2.6), up), C("#ffffff"), true)
      B.add("legno", orient(quad(P(U0, ye - 0.18, we), P(U1, ye - 0.18, we), P(U1, yr - 0.18, wc), P(U0, yr - 0.18, wc)), [-up[0], -1, -up[2]]), C("#8a6a4a"))
      B.add("legno", orient(quad(P(U0, ye - 0.22, we), P(U1, ye - 0.22, we), P(U1, ye + 0.02, we), P(U0, ye + 0.02, we)), n), C("#6a4a30"))
    }
    for (const [u, sign] of [[u0, -1], [u1, 1]] as const) {
      const n: V = alongZ ? [0, 0, sign] : [sign, 0, 0]
      B.add(gableKey, orient(tri(P(u, yTop, w0), P(u, yTop, w1), P(u, yr, wc)), n), gable)
      // bordo del tetto sul timpano
      for (const we of [w0 - o, w1 + o]) {
        B.add("coppi", orient(quad(P(u + sign * o, ye - 0.2, we), P(u + sign * o, yr - 0.2, wc), P(u + sign * o, yr + 0.02, wc), P(u + sign * o, ye + 0.02, we)), n), C("#b07060"))
      }
    }
    const a = P(U0, yr - 0.05, wc - 0.2), c = P(U1, yr + 0.18, wc + 0.2)
    B.add("coppi", boxAt([Math.min(a[0], c[0]), a[1], Math.min(a[2], c[2])], [Math.max(a[0], c[0]), c[1], Math.max(a[2], c[2])]), C("#9a5a48"))
    return { ridge: yr, alongZ, rise }
  }

  function win(n: V, p: V, w: number, h: number, shutter: THREE.Color | null, vase: boolean) {
    I.vetro.push(place(n, [p[0] + n[0] * 0.03, p[1], p[2] + n[2] * 0.03], w, h), C(R() < 0.12 ? "#ffd9a0" : "#ffffff"))
    I.cornice.push(place(n, p, w, h / 1.5))
    if (shutter) I.scuri.push(place(n, p, w, h / 1.5), shutter)
    if (vase) I.vaso.push(place(n, [p[0], p[1] - h / 2 - 0.05, p[2]], w, 1))
  }
  function door(n: V, p: V, w: number, h: number, tint: THREE.Color) {
    I.porta.push(place(n, [p[0], p[1] + h / 2, p[2]], w, h), tint.clone().lerp(C("#8a5a32"), 0.55))
    I.cornice.push(place(n, [p[0], p[1] + h / 2, p[2]], w, h / 1.5))
  }
  function balconyAt(n: V, p: V) {
    const m = faceMatrix(n, p)
    const slab = boxAt([-1, -0.12, 0], [1, 0, 0.7]).applyMatrix4(m)
    B.add("pietraChiara", slab)
    const rail = [boxAt([-1, 0.9, 0.62], [1, 0.95, 0.68]), boxAt([-1, 0.9, 0], [-0.95, 0.95, 0.68]), boxAt([0.95, 0.9, 0], [1, 0.95, 0.68])]
    for (let i = 0; i <= 12; i++) rail.push(boxAt([-0.98 + i * 0.163, 0, 0.63], [-0.96 + i * 0.163, 0.9, 0.66]))
    for (const s of [-1, 1]) for (let i = 1; i <= 3; i++) rail.push(boxAt([s * 0.985 - 0.015, 0, i * 0.17], [s * 0.985 + 0.015, 0.9, i * 0.17 + 0.02]))
    for (const g of rail) B.add("ferro", g.applyMatrix4(m), C("#2a2622"))
  }

  // --- 3. blocchi generici ---------------------------------------------------------------
  const camp = (b: Block) => b.min[0] === CAMPANILE.minX && b.max[0] === CAMPANILE.maxX && b.min[2] === CAMPANILE.minZ && b.max[1] === CAMPANILE.floor + CAMPANILE.height
  const comuneUpper = (b: Block) => b.min[0] === COMUNE.minX && b.max[0] === COMUNE.maxX && b.min[1] === COMUNE.floor + COMUNE.loggiaHeight
  const inDuomo = (b: Block) => b.min[0] >= DUOMO.minX && b.max[0] <= DUOMO.maxX && b.min[2] >= DUOMO.minZ && b.max[2] <= DUOMO.maxZ
  for (const b of BLOCKS) {
    if (b.mat === "invisibile" || isTerrain(b) || buildingKeys.has(key(b)) || camp(b)) continue
    const k = matKey(b.mat)
    const col = matColor(b.mat)
    const [x0, y0, z0] = b.min
    const [x1, y1, z1] = b.max
    if (b.look === "fontana") {
      fountain(b)
      continue
    }
    if (b.look === "bancarele") {
      stall(b)
      continue
    }
    if (b.look === "cassa" && b.mat === "legno" && !inDuomo(b)) {
      // casse di legno: la scatola divisa in casse da ~1.4 m
      const nx = Math.max(1, Math.round((x1 - x0) / 1.4)), nz = Math.max(1, Math.round((z1 - z0) / 1.4))
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const g = new THREE.BoxGeometry((x1 - x0) / nx, y1 - y0, (z1 - z0) / nz)
        g.translate(x0 + ((x1 - x0) * (i + 0.5)) / nx, (y0 + y1) / 2, z0 + ((z1 - z0) * (j + 0.5)) / nz)
        B.add("cassa", g, C("#ffffff").offsetHSL(0, 0, (R() - 0.5) * 0.12), true)
      }
      continue
    }
    if (b.look === "cassa" && b.mat === "legno") {
      // banchi della chiesa: seduta, schienale e fianchi nello stesso volume
      B.add("legno", boxAt(b.min, b.max), C("#e8c8a8"))
      B.add("legno", boxAt([x0 - 0.04, y0, z1 - 0.12], [x1 + 0.04, y1 + 0.02, z1]), C("#c89a78"))
      continue
    }
    if (comuneUpper(b)) {
      for (const s of ["east", "west", "south", "north", "bottom"] as const) B.add("intonaco", face(b.min, b.max, s), col)
      B.add("pietraChiara", face(b.min, b.max, "top"), C("#e8dcc8"))
      continue
    }
    if (b.look === "pilastro") {
      B.add(k, boxAt(b.min, b.max), col)
      const w = x1 - x0
      I.capitello.push(new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, y1 - 0.2 * w, (z0 + z1) / 2), new THREE.Quaternion(), new THREE.Vector3(w, w, z1 - z0)))
      I.base.push(new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, y0, (z0 + z1) / 2), new THREE.Quaternion(), new THREE.Vector3(w, w, z1 - z0)))
      continue
    }
    if (b.look === "parapetto") {
      B.add(k, boxAt(b.min, b.max), col)
      B.add("pietraChiara", boxAt([x0 - 0.05, y1, z0 - 0.05], [x1 + 0.05, y1 + 0.06, z1 + 0.05]), C("#f0e8da"))
      continue
    }
    B.add(k, boxAt(b.min, b.max), k === "pietra" && inDuomo(b) ? C("#e6e0d6") : col)
  }

  // --- 4. Duomo di Santa Maria Assunta -----------------------------------------------------
  {
    const { minX, maxX, minZ, maxZ, floor: f, height: h } = DUOMO
    const top = f + h
    const fz = maxZ
    const stone = C("#f1ece2")
    const add = (k: K, g: THREE.BufferGeometry, c = stone) => B.add(k, g, c)
    // lesene e cornice ad archetti pensili
    for (const x of [-13.6, -10.7, 10.1, 13.0]) add("pietraChiara", boxAt([x, f, fz], [x + 0.6, top, fz + 0.25]))
    add("pietraChiara", boxAt([minX - 0.1, top - 0.6, fz], [maxX + 0.1, top, fz + 0.35]))
    for (let x = minX + 0.6; x < maxX - 0.4; x += 0.9) add("pietraChiara", archRing(0.32, 0.42, 0.18, 0).translate(x, top - 1.1, fz + 0.1))
    // timpano e tetto a capanna sopra la copertura
    const roofBase = top + 0.8
    const r = roof(minX, minZ, maxX, maxZ - 1.2, roofBase, C("#d8d2c6"), 6.5, "pietra")
    {
      const s = new THREE.Shape()
      s.moveTo(minX - 0.3, 0)
      s.lineTo(maxX + 0.3, 0)
      s.lineTo(0, r.ridge - roofBase + 0.6)
      s.closePath()
      const g = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false })
      g.translate(0, roofBase - 0.8, fz - 1.2)
      add("pietra", g)
      // cornice inclinata del timpano
      const ang = Math.atan2(r.ridge - roofBase + 0.6, maxX + 0.3)
      for (const sx of [-1, 1]) {
        const len = Math.hypot(maxX + 0.3, r.ridge - roofBase + 0.6)
        const c = new THREE.BoxGeometry(len + 0.3, 0.35, 1.5)
        c.rotateZ(sx * -ang)
        c.translate((sx * (maxX + 0.3)) / 2, roofBase - 0.8 + (r.ridge - roofBase + 0.6) / 2 + 0.2, fz - 0.55)
        add("pietraChiara", c)
      }
      // croce e pinnacoli
      const cy = r.ridge + 0.2
      add("pietraChiara", boxAt([-0.12, cy, fz - 0.7], [0.12, cy + 2.2, fz - 0.45]))
      add("pietraChiara", boxAt([-0.7, cy + 1.3, fz - 0.7], [0.7, cy + 1.55, fz - 0.45]))
      for (const x of [minX + 0.3, maxX - 0.3]) {
        const pin = new THREE.ConeGeometry(0.45, 2.2, 4).rotateY(Math.PI / 4).translate(x, roofBase + 1.1, fz - 0.4)
        add("pietraChiara", pin)
      }
    }
    // portale maggiore: strombatura, colonnine, archivolto acuto, lunetta
    const doorTop = f + 6
    for (const s of [-1, 1]) {
      add("pietraChiara", boxAt([s < 0 ? -3.5 : 2.5, f, fz], [s < 0 ? -2.5 : 3.5, doorTop, fz + 0.35]))
      for (const x of [2.72, 3.25]) add("pietraChiara", cylBetween([s * x, f, fz + 0.42], [s * x, doorTop, fz + 0.42], 0.13, 0.13, 8), C("#e9dfca"))
    }
    add("pietraChiara", archRing(2.5, 3.5, 0.5, 0.6).translate(0, doorTop, fz + 0.22))
    add("pietraChiara", archRing(2.75, 3.25, 0.2, 0.66).translate(0, doorTop, fz + 0.52), C("#d9cdb6"))
    add("pietraChiara", archPanel(2.5, 0, 0.6).translate(0, doorTop, fz + 0.02), C("#cfc6b4"))
    // Madonna in trono nella lunetta
    add("pietraChiara", cylBetween([0, doorTop + 0.2, fz + 0.1], [0, doorTop + 1.6, fz + 0.1], 0.55, 0.32), C("#ece2cc"))
    add("pietraChiara", sphere([0, doorTop + 1.9, fz + 0.12], 0.26), C("#ece2cc"))
    add("marmo", new THREE.TorusGeometry(0.38, 0.04, 6, 20).translate(0, doorTop + 1.95, fz + 0.05), C("#d9b45a"))
    // portali minori
    for (const s of [-1, 1]) {
      const x = s * 7.75
      add("pietraChiara", boxAt([x - 1.65, f, fz], [x - 1.25, f + 4.5, fz + 0.3]))
      add("pietraChiara", boxAt([x + 1.25, f, fz], [x + 1.65, f + 4.5, fz + 0.3]))
      add("pietraChiara", archRing(1.25, 1.75, 0.4, 0.3).translate(x, f + 4.5, fz + 0.2))
      add("pietraChiara", archPanel(1.25, 0, 0.3).translate(x, f + 4.5, fz + 0.02), C("#cfc6b4"))
      // battenti aperti, dentro, contro la facciata
      for (const d of [-1, 1]) add("legno", boxAt([x + d * 1.25 + (d < 0 ? -1.3 : 0), f, fz - 1.32], [x + d * 1.25 + (d < 0 ? 0 : 1.3), f + 4.4, fz - 1.22]), C("#7a4a2c"))
    }
    for (const d of [-1, 1]) add("legno", boxAt([d < 0 ? -5.1 : 2.5, f, fz - 1.32], [d < 0 ? -2.5 : 5.1, doorTop - 0.1, fz - 1.22]), C("#6a3e22"))

    // galleria dell'Epifania sopra il portale: mensola, nicchie e statuine
    const gy = 16.55 + f - 6
    add("pietraChiara", boxAt([-4.7, gy - 0.25, fz], [4.7, gy, fz + 0.6]))
    for (let i = 0; i < 7; i++) {
      const x = -3.9 + i * 1.3
      add("pietra", archPanel(0.5, 1.3, 0).translate(x, gy + 1.4, fz + 0.01), C("#8a8276"))
      add("pietraChiara", archRing(0.5, 0.62, 0.2, 0).translate(x, gy + 1.4, fz + 0.1))
      if (i < 6) add("pietraChiara", cylBetween([x + 0.65, gy, fz + 0.12], [x + 0.65, gy + 1.4, fz + 0.12], 0.07))
      // la figura: veste, testa; i Magi hanno la corona, al centro la Madonna col Bambino
      const fc = C(i === 3 ? "#efe6d2" : "#e2d8c4")
      const hgt = i === 3 ? 1.05 : 1.25
      add("pietraChiara", cylBetween([x, gy, fz + 0.3], [x, gy + hgt * 0.78, fz + 0.3], 0.26, 0.13), fc)
      add("pietraChiara", sphere([x, gy + hgt * 0.78 + 0.12, fz + 0.3], 0.12), fc)
      if (i >= 4) add("marmo", new THREE.CylinderGeometry(0.11, 0.09, 0.1, 6).translate(x, gy + hgt * 0.78 + 0.25, fz + 0.3), C("#d9b45a"))
      if (i === 3) add("pietraChiara", sphere([x + 0.12, gy + 0.62, fz + 0.42], 0.09), fc)
      if (i === 2) add("pietraChiara", sphere([x + 0.2, gy + 0.55, fz + 0.38], 0.08), C("#d9b45a"))
    }
    // tre rosoni: il grande di Buzeta e i due minori
    const rose = (x: number, y: number, rad: number) => {
      add("atlas", atlasDisc(atlas.rose, rad, 40).translate(x, y, fz + 0.02))
      add("pietraChiara", new THREE.TorusGeometry(rad + 0.12, 0.2, 8, 40).translate(x, y, fz + 0.1))
      add("pietraChiara", new THREE.TorusGeometry(rad + 0.42, 0.1, 6, 40).translate(x, y, fz + 0.06), C("#d8ccb4"))
    }
    rose(0, f + 15.0, 2.1)
    rose(-7.75, f + 9.6, 1.15)
    rose(7.75, f + 9.6, 1.15)

    // San Cristoforo (1331): gigante a rilievo a destra del portale, col Bambino in spalla
    {
      const parts: [THREE.BufferGeometry, string][] = []
      const P = (g: THREE.BufferGeometry, c = "#e8e0cf") => parts.push([g, c])
      P(boxAt([-1.15, 0, -0.1], [1.15, 0.35, 0.65]), "#d6ccb8")
      // acqua del fiume ai piedi
      for (let i = 0; i < 4; i++) P(new THREE.TorusGeometry(0.3 + i * 0.05, 0.05, 4, 12, Math.PI).translate(-0.6 + i * 0.4, 0.4, 0.45), "#c8c2b4")
      P(cylBetween([-0.32, 0.35, 0.2], [-0.3, 3.0, 0.15], 0.24, 0.3))
      P(cylBetween([0.36, 0.35, 0.3], [0.28, 3.0, 0.15], 0.24, 0.3))
      P(cylBetween([0, 1.7, 0.1], [0, 3.6, 0.1], 0.95, 0.68), "#d9c6a8")
      P(cylBetween([0, 3.55, 0.1], [0, 5.5, 0.1], 0.66, 0.74), "#d9c6a8")
      P(new THREE.TorusGeometry(0.68, 0.07, 5, 16).rotateX(Math.PI / 2).translate(0, 3.65, 0.1), "#b89a6a")
      // mantello
      P(boxAt([-0.9, 2.2, -0.15], [0.9, 5.4, 0.05]), "#c9b08a")
      // braccio destro con il bastone fiorito, sinistro che regge il Bambino
      P(cylBetween([-0.78, 5.3, 0.1], [-1.05, 4.3, 0.25], 0.2, 0.22))
      P(cylBetween([-1.05, 4.3, 0.25], [-1.0, 4.85, 0.6], 0.18, 0.2))
      P(cylBetween([-1.0, 0.35, 0.6], [-1.0, 7.0, 0.6], 0.09, 0.1), "#b8a582")
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        P(cylBetween([-1.0, 7.0, 0.6], [-1.0 + Math.cos(a) * 0.6, 6.7 + Math.abs(Math.sin(a)) * 0.3, 0.6 + Math.sin(a) * 0.2], 0.05, 0.02, 4), "#b8a582")
      }
      P(cylBetween([0.78, 5.3, 0.1], [1.0, 4.5, 0.25], 0.2, 0.22))
      P(cylBetween([1.0, 4.5, 0.25], [0.85, 5.55, 0.45], 0.18, 0.2))
      P(cylBetween([0, 5.45, 0.1], [0, 5.8, 0.12], 0.25))
      P(sphere([0, 6.15, 0.15], 0.46, 1.1, 12))
      P(new THREE.ConeGeometry(0.32, 0.6, 8).rotateX(Math.PI).translate(0, 5.75, 0.38), "#cdbf9f")
      P(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 24).rotateX(Math.PI / 2).translate(0, 6.2, -0.2), "#d9b45a")
      // il Bambino sulla spalla
      P(cylBetween([0.7, 5.55, 0.15], [0.72, 6.15, 0.2], 0.22, 0.16), "#e0d2b8")
      P(sphere([0.74, 6.38, 0.22], 0.18))
      P(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16).rotateX(Math.PI / 2).translate(0.74, 6.42, 0.04), "#d9b45a")
      P(cylBetween([0.82, 6.0, 0.25], [1.05, 6.45, 0.35], 0.06))
      for (const [g, c] of parts) {
        g.scale(1, 1, 0.55).translate(4.85, f + 0.05, fz)
        add(c === "#d9b45a" ? "marmo" : "pietraChiara", g, C(c))
      }
    }

    // fianchi: lesene e monofore ogivali
    for (const [x, nx] of [[minX, -1], [maxX, 1]] as const) {
      for (let z = minZ + 3; z < maxZ - 2; z += 6) {
        add("pietraChiara", boxAt([nx < 0 ? x - 0.3 : x, f, z - 0.3], [nx < 0 ? x : x + 0.3, top, z + 0.3]))
        if (nx > 0 && z > -83 && z < -76) continue
        const zc = z + 3
        if (zc > maxZ - 1.5) continue
        const m = faceMatrix([nx, 0, 0], [x + nx * 0.02, f + 13, zc])
        B.add("vetro", archPanel(0.45, 2.6, 0.25).applyMatrix4(m), C("#c8a070"))
        B.add("pietraChiara", archRing(0.45, 0.65, 0.2, 0.25).applyMatrix4(m), stone)
      }
    }
    add("pietraChiara", archRing(2.5, 3.0, 0.4, 0.4).rotateY(Math.PI / 2).translate(maxX + 0.1, f + 4.5 - 1.6, -79.5))

    // interno: pavimento a rombi, arcate sopra le colonne, travi, altare e luci
    B.add("pavimento", face([minX + 1.2, f, -91], [maxX - 1.2, f + 0.015, fz - 1.2], "top"))
    const cols = [-93, -87, -81, -75, -69]
    const spans: [number, number][] = []
    let prev = minZ + 1.2
    for (const z of cols) {
      spans.push([prev, z - 0.6])
      prev = z + 0.6
    }
    spans.push([prev, fz - 1.2])
    for (const x of [-5, 5]) for (const [a, b] of spans) {
      const g = spandrel((b - a) / 2, top - (f + 14), 1.2, 0.15).rotateY(Math.PI / 2).translate(x, f + 14, (a + b) / 2)
      add("pietraChiara", g, C("#ebe3d4"))
    }
    for (const z of cols) add("legno", boxAt([minX + 1.2, top - 0.5, z - 0.25], [maxX - 1.2, top, z + 0.25]), C("#6a4630"))
    for (let z = minZ + 2; z < fz - 1.2; z += 2) add("legno", boxAt([minX + 1.2, top - 0.25, z - 0.1], [maxX - 1.2, top - 0.05, z + 0.1]), C("#7a5638"))
    // pala d'altare dorata
    add("marmo", boxAt([-3.2, f + 1.6, minZ + 1.2], [3.2, f + 7.4, minZ + 1.45]), C("#d4a84a"))
    B.add("stoffa", face([-2.8, f + 2.0, minZ + 1.2], [2.8, f + 7.0, minZ + 1.47], "south"), C("#2b3a6a"))
    for (let i = 0; i < 3; i++) B.add("stoffa", face([-2.4 + i * 1.75, f + 2.4, minZ + 1.2], [-1.4 + i * 1.75, f + 5.8, minZ + 1.49], "south"), C(i === 1 ? "#9b2a2a" : "#c8a060"))
    // candele sull'altare
    const altarTop = f + 1.4
    for (let i = 0; i < 6; i++) {
      const x = -1.6 + i * 0.64
      add("marmo", new THREE.CylinderGeometry(0.06, 0.08, 0.1, 8).translate(x, altarTop + 0.05, -96.75), C("#d4a84a"))
      B.add("luce", new THREE.CylinderGeometry(0.035, 0.035, 0.4, 6).translate(x, altarTop + 0.3, -96.75), C("#e8e0cc"))
      B.add("luce", new THREE.ConeGeometry(0.03, 0.09, 6).translate(x, altarTop + 0.55, -96.75), new THREE.Color(4, 2.4, 0.9))
    }
    add("marmo", boxAt([-0.05, altarTop, -97.1], [0.05, altarTop + 1.1, -97.0]), C("#d4a84a"))
    add("marmo", boxAt([-0.35, altarTop + 0.7, -97.1], [0.35, altarTop + 0.8, -97.0]), C("#d4a84a"))
    // lampadari: catena e corona di luci
    for (const z of [-72, -84]) {
      B.add("ferro", cylBetween([0, top, z], [0, f + 9, z], 0.03), C("#3a3028"))
      B.add("ferro", new THREE.TorusGeometry(1.0, 0.05, 5, 20).rotateX(Math.PI / 2).translate(0, f + 9, z), C("#8a6a3a"))
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        B.add("luce", sphere([Math.cos(a), f + 9.15, z + Math.sin(a)], 0.07, 1.4, 6), new THREE.Color(3, 1.9, 0.8))
      }
    }
  }
  const altarLight = new THREE.PointLight("#ffb46a", 70, 22, 1.3)
  altarLight.position.set(0, DUOMO.floor + 4, -94)
  const naveLight = new THREE.PointLight("#ffc888", 45, 20, 1.3)
  naveLight.position.set(0, DUOMO.floor + 8.5, -80)
  scene.add(altarLight, naveLight)

  // --- 5. Campanile ---------------------------------------------------------------------
  {
    const { minX, maxX, minZ, maxZ, floor: f, height, balcony } = CAMPANILE
    const cut = f + 13
    const belfry = f + 32
    const topY = f + height
    // la parte medievale sopravvissuta al '76, più scura; poi la ricostruzione
    B.add("pietra", boxAt([minX, f, minZ], [maxX, cut, maxZ]), C("#a8a194"))
    B.add("pietra", boxAt([minX, cut, minZ], [maxX, belfry, maxZ]), C("#f2ede4"))
    B.add("pietra", boxAt([minX - 0.06, cut - 0.15, minZ - 0.06], [maxX + 0.06, cut + 0.35, maxZ + 0.06]), C("#c07a5a"))
    B.add("pietra", boxAt([minX - 0.04, cut + 0.35, minZ - 0.04], [maxX + 0.04, cut + 0.5, maxZ + 0.04]), C("#9a5a40"))
    // mensole sotto il ballatoio
    const w = 1.6
    for (let s = minX - w + 0.4; s < maxX + w - 0.2; s += 1.2) {
      for (const z of [minZ - w + 0.1, maxZ + w - 0.4]) B.add("pietraChiara", boxAt([s - 0.12, balcony - 1.0, Math.min(z, z + 0.3)], [s + 0.12, balcony - 0.4, Math.max(z, z + 0.3)]))
    }
    for (let s = minZ + 0.4; s < maxZ; s += 1.2) {
      for (const x of [minX - w + 0.1, maxX + w - 0.4]) B.add("pietraChiara", boxAt([x, balcony - 1.0, s - 0.12], [x + 0.3, balcony - 0.4, s + 0.12]))
    }
    // feritoie
    for (const [n, px, pz] of [[[0, 0, 1], (minX + maxX) / 2, maxZ], [[0, 0, -1], (minX + maxX) / 2, minZ], [[1, 0, 0], maxX, (minZ + maxZ) / 2], [[-1, 0, 0], minX, (minZ + maxZ) / 2]] as [V, number, number][]) {
      for (const y of [f + 9, f + 17, f + 27]) {
        const m = faceMatrix(n, [px + n[0] * 0.02, y, pz + n[2] * 0.02])
        B.add("vetro", archPanel(0.28, 1.1, 0).applyMatrix4(m), C("#555"))
        B.add("pietraChiara", archRing(0.28, 0.42, 0.12, 0).applyMatrix4(m))
      }
      // cella campanaria: bifore aperte
      const m = faceMatrix(n, [px, belfry, pz])
      const spring = 5
      for (const x of [-1.175, 1.175]) B.add("pietraChiara", spandrel(1.0, topY - belfry - spring, 0.8).translate(x, spring, -0.4).applyMatrix4(m), C("#f2ede4"))
      B.add("pietraChiara", cylBetween([0, 0, -0.4], [0, spring, -0.4], 0.18).applyMatrix4(m), C("#e8dfcc"))
      B.add("pietraChiara", boxAt([-2.3, -0.3, -0.1], [2.3, 0, 0.15]).applyMatrix4(m))
    }
    for (const [x, z] of [[minX, minZ], [maxX - 1.3, minZ], [minX, maxZ - 1.3], [maxX - 1.3, maxZ - 1.3]]) B.add("pietra", boxAt([x, belfry, z], [x + 1.3, topY, z + 1.3]), C("#f2ede4"))
    B.add("pietra", boxAt([minX, belfry - 0.01, minZ], [maxX, belfry + 0.3, maxZ]), C("#d8d2c6"))
    B.add("pietraChiara", boxAt([minX - 0.3, topY - 0.3, minZ - 0.3], [maxX + 0.3, topY + 0.2, maxZ + 0.3]))
    B.add("pietra", boxAt([minX, topY + 0.2, minZ], [maxX, topY + 1.8, maxZ]), C("#f2ede4"))
    B.add("pietraChiara", boxAt([minX - 0.25, topY + 1.8, minZ - 0.25], [maxX + 0.25, topY + 2.1, maxZ + 0.25]))
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
    B.add("pietra", new THREE.CylinderGeometry(2.7, 2.9, 2.2, 8).translate(cx, topY + 3.2, cz), C("#ece6da"))
    B.add("coppi", new THREE.ConeGeometry(3.1, 6.5, 8).translate(cx, topY + 7.55, cz), C("#9aa89a"))
    for (const [x, z] of [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]]) B.add("pietraChiara", new THREE.ConeGeometry(0.4, 1.6, 4).translate(x, topY + 2.9, z))
    // l'angelo dorato in cima
    const ay = topY + 10.8
    B.add("marmo", sphere([cx, ay, cz], 0.3), C("#e0b850"))
    B.add("marmo", cylBetween([cx, ay + 0.2, cz], [cx, ay + 1.4, cz], 0.32, 0.15), C("#e0b850"))
    B.add("marmo", sphere([cx, ay + 1.6, cz], 0.18), C("#e0b850"))
    for (const s of [-1, 1]) B.add("marmo", boxAt([cx + s * 0.1, ay + 0.6, cz - 0.04], [cx + s * 0.85, ay + 1.5, cz + 0.04]).rotateZ(0), C("#e0b850"))
    // campane
    const bellProf = [[0, 1], [0.25, 0.98], [0.32, 0.8], [0.38, 0.4], [0.55, 0.05], [0.58, 0], [0, 0]].map(([x, y]) => new THREE.Vector2(x, y))
    for (const [dx, s] of [[-1.4, 0.9], [0, 1.2], [1.4, 0.8]] as const) {
      const g = new THREE.LatheGeometry(bellProf, 16).scale(s * 1.3, s * 1.2, s * 1.3).translate(cx + dx, belfry + 3.6 - s * 1.2, cz)
      B.add("ferro", g, C("#b08040"))
    }
    B.add("legno", boxAt([minX + 0.6, belfry + 3.6, cz - 0.2], [maxX - 0.6, belfry + 4.0, cz + 0.2]), C("#5a3a22"))
  }

  // --- 6. Palazzo Comunale e loggia ---------------------------------------------------------
  const clockHands: THREE.Mesh[] = []
  {
    const { minX, maxX, minZ, floor: f, loggiaDepth, loggiaHeight: lh, roof: rf } = COMUNE
    const colsX = [-15.5, -9.5, -3.5, 2.5, 8.5, 14.5]
    const wh = C("#f4eee2")
    for (let i = 0; i < colsX.length - 1; i++) {
      const a = (colsX[i + 1] - (colsX[i] + 1)) / 2
      const xm = colsX[i] + 1 + a
      B.add("pietraChiara", spandrel(a, a + 0.15, 1).translate(xm, f + lh - a - 0.15, minZ + 0.5), C("#efe7d8"))
      B.add("intonaco", vault(a, 0.9, loggiaDepth - 1).translate(xm, f + lh - 0.9, minZ + 1), wh)
    }
    for (const x of [minX + 0.5, maxX - 0.5]) {
      const a = (loggiaDepth - 1) / 2
      B.add("pietraChiara", spandrel(a, a + 0.15, 1).rotateY(Math.PI / 2).translate(x, f + lh - a - 0.15, minZ + 1 + a), C("#efe7d8"))
    }
    // portoni in fondo alla loggia
    for (const x of [-6, 0, 6]) door([0, 0, -1], [x, f, minZ + loggiaDepth], 1.8, 3.2, C("#5a3a22"))
    // marcapiano, cornicione, cantonali
    B.add("pietraChiara", boxAt([minX - 0.1, f + lh, minZ - 0.18], [maxX + 0.1, f + lh + 0.3, minZ]))
    B.add("pietraChiara", boxAt([minX - 0.2, rf - 0.4, minZ - 0.3], [maxX + 0.2, rf - 0.1, minZ]))
    for (let y = f + lh + 0.3; y < rf - 0.4; y += 0.6) for (const x of [minX, maxX]) {
      const wq = ((y - f) / 0.6) % 2 < 1 ? 0.9 : 0.6
      B.add("pietraChiara", boxAt([x < 0 ? x - 0.04 : x - wq, y, minZ - 0.04], [x < 0 ? x + wq : x + 0.04, y + 0.55, minZ + 0.6]))
    }
    // finestre rinascimentali con timpano
    for (const x of [-12, -6, 0, 6, 12]) {
      const p: V = [x, f + lh + 3, minZ]
      win([0, 0, -1], p, 1.2, 2.0, null, false)
      const ped = new THREE.Shape()
      ped.moveTo(-0.95, 0)
      ped.lineTo(0.95, 0)
      ped.lineTo(0, 0.45)
      ped.closePath()
      B.add("pietraChiara", new THREE.ExtrudeGeometry(ped, { depth: 0.2, bevelEnabled: false }).rotateY(Math.PI).translate(x, p[1] + 1.15, minZ))
    }
    balconyAt([0, 0, -1], [0, f + lh + 1.9, minZ])
    // insegna e bandiere (Italia e Friuli)
    B.add("atlas", atlasQuad(atlas.signs.municipio, 0.7).rotateY(Math.PI).translate(0, f + lh + 0.95, minZ - 0.03))
    for (const [x, cols] of [[-1.6, ["#2a8a4a", "#f2f2f2", "#c83a3a"]], [1.6, ["#2a5ab8", "#2a5ab8", "#2a5ab8"]]] as const) {
      const base: V = [x, f + lh + 2.1, minZ - 0.6]
      const tip: V = [x + (x < 0 ? -0.6 : 0.6), f + lh + 3.8, minZ - 1.6]
      B.add("ferro", cylBetween(base, tip, 0.03), C("#3a3028"))
      cols.forEach((c, i) => {
        const a: V = [tip[0], tip[1] - 0.05, tip[2] + 0.33 * i]
        B.add("stoffa", quad([a[0], a[1] - 1.0, a[2]], [a[0], a[1] - 1.0, a[2] + 0.33], [a[0], a[1], a[2] + 0.33], a), C(c))
      })
      if (x > 0) B.add("stoffa", tri([tip[0] + 0.01, tip[1] - 0.25, tip[2] + 0.3], [tip[0] + 0.01, tip[1] - 0.85, tip[2] + 0.3], [tip[0] + 0.01, tip[1] - 0.55, tip[2] + 0.75]), C("#f0c830"))
    }
    // torre dell'orologio
    const tz = 88
    B.add("pietraChiara", boxAt([-3.3, rf + 9, tz - 0.3], [3.3, rf + 9.35, 94.3]))
    B.add("coppi", new THREE.ConeGeometry(4.6, 3.2, 4).rotateY(Math.PI / 4).translate(0, rf + 9.35 + 1.6, 91), C("#ffffff"))
    B.add("ferro", cylBetween([0, rf + 12.4, 91], [0, rf + 14, 91], 0.04), C("#3a3028"))
    B.add("ferro", boxAt([0, rf + 13.6, 90.98], [0.6, rf + 13.9, 91.02]), C("#3a3028"))
    const cy = rf + 6.3
    B.add("atlas", atlasDisc(atlas.clock, 1.3, 40).rotateY(Math.PI).translate(0, cy, tz - 0.03))
    B.add("pietraChiara", new THREE.TorusGeometry(1.38, 0.12, 6, 40).translate(0, cy, tz - 0.05))
    for (const [len, wdt] of [[0.75, 0.09], [1.1, 0.06]] as const) {
      const g = new THREE.BoxGeometry(wdt, len, 0.03).translate(0, len / 2 - 0.12, 0)
      const hand = new THREE.Mesh(g, MATS.ferro)
      hand.position.set(0, cy, tz - 0.09)
      hand.rotation.y = Math.PI
      scene.add(hand)
      clockHands.push(hand)
    }
  }
  {
    // vertex colors per le mani dell'orologio (il materiale ferro usa vertexColors)
    for (const h of clockHands) {
      const n = h.geometry.getAttribute("position").count
      h.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.08), 3))
    }
  }

  // --- 7. portici di Via Bini: archi, costoloni, volte, insegne -----------------------------
  const porticoSigns = ["ostarie", "latarie", "frico", "farmacie"] as const
  let signIdx = 0
  BUILDINGS.forEach((b) => {
    const p = b.portico
    if (!p || (p.side !== "east" && p.side !== "west")) return
    const [x0, y0] = b.min
    const x1 = b.max[0]
    const top = y0 + p.height
    const cols = buildingBlocks(b).filter((k) => k.look === "pilastro").sort((a, c) => a.min[2] - c.min[2])
    const outerX = p.side === "east" ? x1 - 0.4 : x0 + 0.4
    const innerX = p.side === "east" ? x1 - p.depth : x0 + p.depth
    const depth = p.depth - 0.8
    const ribX = p.side === "east" ? innerX + depth / 2 : x0 + 0.8 + depth / 2
    const vaultX = p.side === "east" ? innerX : x0 + 0.8
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]
      // costolone trasversale dalla colonna al muro
      const rib = spandrel(depth / 2, depth / 2 + 0.15, 0.45).rotateY(0).translate(ribX, top - depth / 2 - 0.15, (c.min[2] + c.max[2]) / 2)
      B.add("pietraChiara", rib, C("#ece4d4"))
      if (i === cols.length - 1) break
      const za = c.max[2], zb = cols[i + 1].min[2]
      const a = (zb - za) / 2
      const zm = za + a
      B.add("pietraChiara", spandrel(a, a + 0.15, 0.8).rotateY(Math.PI / 2).translate(outerX, top - a - 0.15, zm), C("#efe7d8"))
      B.add("intonaco", vault(a, 0.7, depth).rotateY(Math.PI / 2).translate(vaultX, top - 0.7, zm), C("#f6f0e4"))
      // insegna appesa a metà portico, si legge camminando
      if (i % 3 === 1) {
        const id = porticoSigns[signIdx++ % porticoSigns.length]
        const reg: Region = atlas.signs[id]
        const sh = 0.42
        const sw = Math.min(depth * 0.85, sh * reg.aspect)
        // due facce schiena contro schiena, così si legge dritta da entrambi i lati
        B.add("atlas", atlasQuad(reg, sw / reg.aspect, sw).translate(ribX, top - 1.05, zm + 0.01))
        B.add("atlas", atlasQuad(reg, sw / reg.aspect, sw).rotateY(Math.PI).translate(ribX, top - 1.05, zm - 0.01))
        for (const dz of [-sw / 2 + 0.1, sw / 2 - 0.1]) B.add("ferro", cylBetween([ribX + dz, top - 0.85, zm], [ribX + dz, top - 0.3, zm], 0.012), C("#2a2622"))
      }
    }
  })

  // --- 8. fontane, bancarelle, cjars di fen ------------------------------------------------
  function fountain(b: Block) {
    const [x0, y0, z0] = b.min
    const [x1, y1, z1] = b.max
    const big = y1 - y0 > 1.2
    for (const s of ["east", "west", "south", "north"] as const) B.add("pietraChiara", face(b.min, b.max, s), C("#efe8da"))
    const rim = 0.28
    B.add("pietraChiara", boxAt([x0 - 0.05, y1 - 0.2, z0 - 0.05], [x1 + 0.05, y1, z0 + rim]))
    B.add("pietraChiara", boxAt([x0 - 0.05, y1 - 0.2, z1 - rim], [x1 + 0.05, y1, z1 + 0.05]))
    B.add("pietraChiara", boxAt([x0 - 0.05, y1 - 0.2, z0 + rim], [x0 + rim, y1, z1 - rim]))
    B.add("pietraChiara", boxAt([x1 - rim, y1 - 0.2, z0 + rim], [x1 + 0.05, y1, z1 - rim]))
    B.add("pietra", face([x0 + rim, y0, z0 + rim], [x1 - rim, y1 - 0.5, z1 - rim], "top"), C("#6a7a78"))
    B.add("acqua", face([x0 + rim, y0, z0 + rim], [x1 - rim, y1 - 0.12, z1 - rim], "top"))
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    const ht = big ? 2.4 : 1.2
    B.add("pietraChiara", cylBetween([cx, y1 - 0.12, cz], [cx, y1 + ht, cz], big ? 0.28 : 0.15, big ? 0.2 : 0.12, 10))
    B.add("pietraChiara", new THREE.CylinderGeometry(big ? 0.9 : 0.45, big ? 0.3 : 0.18, 0.25, 16).translate(cx, y1 + ht * 0.65, cz))
    B.add("acqua", new THREE.CylinderGeometry(big ? 0.82 : 0.4, big ? 0.82 : 0.4, 0.02, 16).translate(cx, y1 + ht * 0.65 + 0.12, cz))
    if (big) {
      // una piccola statua sopra: la Madonna col manto
      B.add("pietraChiara", cylBetween([cx, y1 + ht, cz], [cx, y1 + ht + 1.0, cz], 0.32, 0.14), C("#f0e8d8"))
      B.add("pietraChiara", sphere([cx, y1 + ht + 1.15, cz], 0.15), C("#f0e8d8"))
    }
    // zampilli
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a: V = [cx + dx * 0.15, y1 + ht * 0.6, cz + dz * 0.15]
      const m: V = [cx + dx * (big ? 1.0 : 0.6), y1 + ht * 0.5, cz + dz * (big ? 1.0 : 0.6)]
      const e: V = [cx + dx * (big ? 1.3 : 0.75), y1 - 0.12, cz + dz * (big ? 1.3 : 0.75)]
      B.add("acqua", cylBetween(a, m, 0.022, 0.02, 5), C("#d8f0ff"))
      B.add("acqua", cylBetween(m, e, 0.02, 0.03, 5), C("#d8f0ff"))
    }
  }

  function stall(b: Block) {
    const [x0, y0, z0] = b.min
    const [x1, y1, z1] = b.max
    const malandanti = (z0 + z1) / 2 > 0
    B.add("legno", boxAt(b.min, b.max), C("#e0b088"))
    // ruote di carro sui fianchi corti
    for (const x of [x0 - 0.06, x1 + 0.06]) {
      B.add("legno", new THREE.CylinderGeometry(0.75, 0.75, 0.1, 16).rotateZ(Math.PI / 2).translate(x, 0.78, (z0 + z1) / 2), C("#9a6a44"))
      B.add("ferro", new THREE.TorusGeometry(0.75, 0.04, 4, 20).rotateY(Math.PI / 2).translate(x + Math.sign(x - x0 - 0.1) * 0.02, 0.78, (z0 + z1) / 2), C("#2a2622"))
    }
    // mensole con forme di formaggio e frico, su entrambi i lati lunghi
    for (const [z, d] of [[z0, -1], [z1, 1]] as const) {
      B.add("legno", boxAt([x0 + 0.2, y0 + 0.95, Math.min(z, z + d * 0.4)], [x1 - 0.2, y0 + 1.02, Math.max(z, z + d * 0.4)]), C("#8a5a38"))
      for (let x = x0 + 0.6; x < x1 - 0.4; x += 0.62) {
        const wheel = R() < 0.6
        const r0 = wheel ? 0.24 : 0.17
        const stack = wheel ? 1 + Math.floor(R() * 2) : 1
        for (let k = 0; k < stack; k++) B.add("marmo", new THREE.CylinderGeometry(r0, r0, wheel ? 0.13 : 0.05, 14).translate(x, y0 + 1.02 + (wheel ? 0.065 : 0.025) + k * 0.135, z + d * 0.2), C(wheel ? "#f0d080" : "#d89a38"))
      }
      // salami e trecce d'aglio appesi alla gronda
      for (let x = x0 + 0.5; x < x1 - 0.3; x += 0.8) {
        B.add("legno", cylBetween([x, y1 - 0.35, z + d * 0.6], [x, y1 + 0.05, z + d * 0.6], 0.05, 0.05, 6), C(R() < 0.5 ? "#7a2a22" : "#efe2c0"))
      }
    }
    // tendone a capanna a strisce
    const cols = malandanti ? ["#c8394e", "#f4ead2"] : ["#3f8a3a", "#f4ead2"]
    const ridgeY = y1 + 0.75, eaveY = y1 + 0.15
    const zc = (z0 + z1) / 2
    for (const [ze, d] of [[z0 - 0.75, -1], [z1 + 0.75, 1]] as const) {
      const n = Math.round((x1 - x0 + 0.6) / 0.5)
      for (let i = 0; i < n; i++) {
        const a = x0 - 0.3 + ((x1 - x0 + 0.6) * i) / n, c = x0 - 0.3 + ((x1 - x0 + 0.6) * (i + 1)) / n
        B.add("stoffa", orient(quad([a, eaveY, ze], [c, eaveY, ze], [c, ridgeY, zc], [a, ridgeY, zc]), [0, 1, d]), C(cols[i % 2]))
        // la balza
        B.add("stoffa", tri([a, eaveY, ze], [c, eaveY, ze], [(a + c) / 2, eaveY - 0.22, ze]), C(cols[i % 2]))
      }
    }
    for (const x of [x0 + 0.1, x1 - 0.1]) for (const z of [z0 + 0.1, z1 - 0.1]) B.add("legno", boxAt([x - 0.05, y1, z - 0.05], [x + 0.05, eaveY + 0.2, z + 0.05]), C("#5a3a22"))
  }

  // Cjar di fen: carro di legno, il fieno respira in update.
  const hay: THREE.Mesh[] = []
  {
    const hayParts: THREE.BufferGeometry[] = []
    const r = rng(77)
    for (let i = 0; i < 9; i++) {
      const g = new THREE.SphereGeometry(0.75, 10, 7)
      g.scale(1 + r() * 0.3, 0.55 + r() * 0.25, 0.8 + r() * 0.2)
      g.translate((r() - 0.5) * 1.3, 0.15 + r() * 0.2, (r() - 0.5) * 0.5)
      hayParts.push(g)
    }
    const top = new THREE.SphereGeometry(0.8, 12, 8).scale(1.2, 0.7, 0.8).translate(0, 0.45, 0)
    hayParts.push(top)
    const hayBatch = new Batch<"fen">({ fen: 1.2 })
    for (const g of hayParts) hayBatch.add("fen", g)
    const hayMesh = hayBatch.build({ fen: MATS.fen })[0]
    for (const pad of JUMP_PADS) {
      const [px, py, pz] = pad.at
      const rotY = Math.abs(pad.launch[2]) > Math.abs(pad.launch[0]) ? 0 : Math.PI / 2
      const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(px, py, pz)
      const L = 1.4, W = 0.85, bed = 0.6
      const parts: [THREE.BufferGeometry, string][] = [
        [boxAt([-L, bed, -W], [L, bed + 0.12, W]), "#8a5a34"],
        [boxAt([-L, bed + 0.12, -W], [L, bed + 0.5, -W + 0.08]), "#a06a40"],
        [boxAt([-L, bed + 0.12, W - 0.08], [L, bed + 0.5, W]), "#a06a40"],
        [boxAt([L - 0.08, bed + 0.12, -W], [L, bed + 0.7, W]), "#a06a40"],
        [boxAt([-L, bed + 0.12, -W], [-L + 0.08, bed + 0.7, W]), "#a06a40"],
        [new THREE.CylinderGeometry(0.06, 0.06, 2 * W + 0.4, 6).rotateX(Math.PI / 2).translate(0, 0.55, 0), "#4a3a2a"]
      ]
      for (const s of [-1, 1]) {
        parts.push([new THREE.CylinderGeometry(0.55, 0.55, 0.1, 16).rotateX(Math.PI / 2).translate(0, 0.55, s * (W + 0.12)), "#6a4428"])
        for (let k = 0; k < 6; k++) parts.push([boxAt([-0.03, 0, -0.03], [0.03, 0.5, 0.03]).rotateZ((k / 6) * Math.PI * 2).translate(0, 0.55, s * (W + 0.18)), "#5a3a22"])
        parts.push([cylBetween([-L, bed + 0.05, s * 0.5], [-L - 1.6, 0.05, s * 0.4], 0.05), "#7a5434"])
      }
      for (const [g, c] of parts) B.add("legno", g.applyMatrix4(m), C(c))
      const h = new THREE.Mesh(hayMesh.geometry, MATS.fen)
      h.position.set(px, py + bed + 0.12, pz)
      h.rotation.y = rotY
      h.castShadow = true
      h.receiveShadow = true
      scene.add(h)
      hay.push(h)
    }
  }

  // --- 9. stendardi, festoni, insegne, lanterne ----------------------------------------------
  const banner = (reg: Region, n: V, p: V, h: number) => {
    const m = faceMatrix(n, [p[0] + n[0] * 0.05, p[1], p[2] + n[2] * 0.05])
    B.add("atlas", atlasQuad(reg, h).applyMatrix4(m))
    B.add("ferro", cylBetween([-h * reg.aspect * 0.6, h / 2 + 0.02, 0.05], [h * reg.aspect * 0.6, h / 2 + 0.02, 0.05], 0.03, 0.03, 6).applyMatrix4(m), C("#c9a040"))
  }
  // Benandanti attorno al sagrato, Malandanti attorno alla piazza.
  for (const z of [-68, -82, -96]) banner(atlas.bannerB, [1, 0, 0], [-20, G_DUOMO + 6.5, z], 5)
  for (const z of [-50, -64, -78]) banner(atlas.bannerB, [-1, 0, 0], [30, G_DUOMO + 6.5, z], 5)
  for (const z of [52, 66]) {
    banner(atlas.bannerM, [1, 0, 0], [-34, G_LOW + 5.5, z], 4.5)
    banner(atlas.bannerM, [-1, 0, 0], [34, G_LOW + 5.5, z], 4.5)
  }
  for (const x of [-28, -21, 21, 28]) banner(atlas.bannerM, [0, 0, -1], [x, G_LOW + 5.5, 80], 4.5)

  // Festoni di bandierine fra le case.
  const bunting = (a: V, b: V, sag: number, cols: string[]) => {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2])
    const n = Math.floor(len / 0.8)
    const P = (s: number): V => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s - sag * 4 * s * (1 - s), a[2] + (b[2] - a[2]) * s]
    for (let i = 0; i < n; i++) {
      const p0 = P(i / n), p1 = P((i + 0.6) / n), p2 = P((i + 1) / n)
      B.add("ferro", cylBetween(p0, p2, 0.012, 0.012, 3), C("#3a3028"))
      B.add("stoffa", tri(p0, p1, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.42, (p0[2] + p1[2]) / 2]), C(cols[i % cols.length]))
    }
  }
  const GREEN = ["#7fd16b", "#f4ead2", "#e8c84a"]
  const RED = ["#d0435a", "#f4ead2", "#e8b04a"]
  const FRIUL = ["#2a5ab8", "#f0c830"]
  bunting([-28, G_DUOMO + 9, -48], [30, G_DUOMO + 9.5, -48], 2.2, GREEN)
  bunting([-28, G_DUOMO + 8, -38], [30, G_DUOMO + 8.5, -41], 2, GREEN)
  for (const z of [-24, -17, -11]) bunting([-5, G_MID + 8.5, z], [5, G_MID + 8.5, z + 1], 0.6, FRIUL)
  for (const z of [24, 32, 40]) bunting([-5, G_LOW + 8, z], [5, G_LOW + 8, z + 1], 0.6, FRIUL)
  for (const z of [52, 60, 70]) bunting([-34, G_LOW + 8, z], [34, G_LOW + 8, z + 2], 2.5, RED)

  // Insegne a muro.
  const sign = (reg: Region, n: V, p: V, h: number) => B.add("atlas", atlasQuad(reg, h).applyMatrix4(faceMatrix(n, [p[0] + n[0] * 0.04, p[1], p[2] + n[2] * 0.04])))
  sign(atlas.signs.cineteca, [1, 0, 0], [-28, G_DUOMO + 3.9, -45], 0.75)
  sign(atlas.signs.viebini, [1, 0, 0], [-5, G_MID + 4.9, -26.5], 0.35)
  sign(atlas.signs.viebini, [-1, 0, 0], [5, G_LOW + 4.9, 21.5], 0.35)
  sign(atlas.signs.place, [1, 0, 0], [-34, G_LOW + 3.2, 47], 0.35)
  sign(atlas.signs.farmacie, [-1, 0, 0], [28, G_LOW + 3.0, 28], 0.6)
  sign(atlas.signs.ostarie, [-1, 0, 0], [28, G_MID + 3.0, -2], 0.6)

  // Lanterne a muro (vetro acceso, braccio di ferro).
  const lantern = (n: V, p: V) => {
    const m = faceMatrix(n, p)
    const parts: [K, THREE.BufferGeometry, THREE.Color][] = [
      ["ferro", boxAt([-0.03, 0.25, 0], [0.03, 0.3, 0.55]), C("#2a2622")],
      ["ferro", cylBetween([0, 0, 0], [0, 0.27, 0.45], 0.02), C("#2a2622")],
      ["ferro", new THREE.ConeGeometry(0.18, 0.18, 4).rotateY(Math.PI / 4).translate(0, 0.12, 0.55), C("#2a2622")],
      ["luce", new THREE.BoxGeometry(0.2, 0.28, 0.2).translate(0, -0.12, 0.55), new THREE.Color(2.4, 1.6, 0.8)],
      ["ferro", boxAt([-0.12, -0.28, 0.43], [0.12, -0.25, 0.67]), C("#2a2622")]
    ]
    for (const [k, g, c] of parts) B.add(k, g.applyMatrix4(m), c)
  }
  for (const z of [-24, -14, -4]) {
    lantern([1, 0, 0], [-5, G_MID + 5.6, z])
    lantern([-1, 0, 0], [5, G_MID + 5.6, z + 5])
  }
  for (const z of [26, 36]) {
    lantern([1, 0, 0], [-5, G_LOW + 5.6, z])
    lantern([-1, 0, 0], [5, G_LOW + 5.6, z + 5])
  }
  for (const x of [-12, 12]) lantern([0, 0, -1], [x, G_LOW + 4.8, COMUNE.minZ + 6])
  lantern([1, 0, 0], [-28, G_DUOMO + 3.5, -38])
  lantern([-1, 0, 0], [30, G_DUOMO + 3.5, -46])

  // --- 10. costruzione -------------------------------------------------------------------
  const statics = B.build(MATS, { cast: (k) => k !== "luce" && k !== "acqua" && k !== "atlas" && k !== "vetro" && k !== "erba" })
  for (const m of statics) scene.add(m)

  // Geometrie delle istanze.
  const glassGeo = new THREE.PlaneGeometry(1, 1)
  const frameGeo = (() => {
    const g = [
      boxAt([-0.62, 0.75, -0.02], [0.62, 0.93, 0.12]),
      boxAt([-0.68, -0.85, -0.02], [0.68, -0.75, 0.2]),
      boxAt([-0.62, -0.75, -0.02], [-0.5, 0.75, 0.08]),
      boxAt([0.5, -0.75, -0.02], [0.62, 0.75, 0.08])
    ]
    const b = new Batch<"x">({ x: 1 })
    for (const p of g) b.add("x", p, undefined, true)
    return b.build({ x: MATS.pietraChiara })[0].geometry
  })()
  const shutterGeo = (() => {
    const b = new Batch<"x">({ x: 1 })
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.5, 1.5, 0.04)
      g.translate(s * 0.88, 0, 0.04)
      b.add("x", g, undefined, true)
    }
    return b.build({ x: MATS.legno })[0].geometry
  })()
  const doorGeo = new THREE.BoxGeometry(1, 1, 0.06).translate(0, 0, 0.01)
  const vaseGeo = (() => {
    const b = new Batch<"x">({ x: 1 })
    b.add("x", boxAt([-0.4, -0.18, 0.12], [0.4, 0, 0.34]), C("#b0603a"), true)
    const r = rng(9)
    for (let i = 0; i < 9; i++) {
      const s = new THREE.SphereGeometry(0.09 + r() * 0.04, 6, 4).translate(-0.34 + i * 0.085, 0.04 + r() * 0.06, 0.2 + r() * 0.1)
      b.add("x", s, C(i % 3 === 1 ? "#4a7a2a" : r() < 0.6 ? "#d8303a" : "#f07aa0"), true)
    }
    return b.build({ x: MATS.legno })[0].geometry
  })()
  const capGeo = (() => {
    const b = new Batch<"x">({ x: 1 })
    b.add("x", new THREE.CylinderGeometry(0.9, 0.62, 0.5, 4, 1).rotateY(Math.PI / 4).translate(0, -0.25, 0), undefined, true)
    b.add("x", boxAt([-0.68, 0, -0.68], [0.68, 0.2, 0.68]), undefined, true)
    return b.build({ x: MATS.pietraChiara })[0].geometry
  })()
  const baseGeo = (() => {
    const b = new Batch<"x">({ x: 1 })
    b.add("x", boxAt([-0.66, 0, -0.66], [0.66, 0.22, 0.66]), undefined, true)
    b.add("x", new THREE.CylinderGeometry(0.58, 0.72, 0.18, 4).rotateY(Math.PI / 4).translate(0, 0.31, 0), undefined, true)
    return b.build({ x: MATS.pietraChiara })[0].geometry
  })()
  const chimGeo = (() => {
    const b = new Batch<"x">({ x: 1 })
    b.add("x", boxAt([-0.35, 0, -0.35], [0.35, 2.4, 0.35]), C("#f0e8dc"), true)
    b.add("x", boxAt([-0.48, 2.4, -0.48], [0.48, 2.52, 0.48]), C("#a85a40"), true)
    b.add("x", boxAt([-0.25, 2.52, -0.25], [0.25, 2.85, 0.25]), C("#a85a40"), true)
    b.add("x", boxAt([-0.4, 2.85, -0.4], [0.4, 2.95, 0.4]), C("#8a4a36"), true)
    return b.build({ x: MATS.intonaco })[0].geometry
  })()
  const shutterMat = new THREE.MeshLambertMaterial({ map: tex.dipinto })
  const doorMat = new THREE.MeshLambertMaterial({ map: tex.legno })
  const vaseMat = new THREE.MeshLambertMaterial({ vertexColors: true })
  const glassMat = new THREE.MeshStandardMaterial({ color: "#2a3440", roughness: 0.1, metalness: 0.5, envMap, envMapIntensity: 1.3 })
  scene.add(
    I.vetro.build(glassGeo, glassMat),
    I.cornice.build(frameGeo, new THREE.MeshLambertMaterial({ map: tex.pietraChiara, vertexColors: true }), true),
    I.scuri.build(shutterGeo, shutterMat, true),
    I.porta.build(doorGeo, doorMat),
    I.vaso.build(vaseGeo, vaseMat),
    I.capitello.build(capGeo, MATS.pietraChiara, true),
    I.base.build(baseGeo, MATS.pietraChiara),
    I.comignolo.build(chimGeo, MATS.intonaco, true)
  )

  // Sfondo.
  scene.add(makeTerrain(), makeTown(tex))

  // Parti dinamiche.
  const dyn = createDynamic(scene, envMap)

  // --- camera del menu: un giro lento fra Duomo, campanile e Via Bini --------------------------
  const camPath = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 21, -22),
      new THREE.Vector3(-15, 15, -40),
      new THREE.Vector3(-4, 12, -50),
      new THREE.Vector3(12, 16, -50),
      new THREE.Vector3(32, 30, -48),
      new THREE.Vector3(18, 24, -12),
      new THREE.Vector3(2, 15, 4),
      new THREE.Vector3(-14, 22, 34),
      new THREE.Vector3(2, 28, 22)
    ],
    true,
    "centripetal"
  )
  const lookPath = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 17, -66),
      new THREE.Vector3(3, 14, -62),
      new THREE.Vector3(5, 13, -62),
      new THREE.Vector3(21, 26, -80),
      new THREE.Vector3(0, 10, -30),
      new THREE.Vector3(0, 6, -2),
      new THREE.Vector3(0, 5, 40),
      new THREE.Vector3(0, 9, 85),
      new THREE.Vector3(5, 18, -60)
    ],
    true,
    "centripetal"
  )
  const look = new THREE.Vector3()
  const PERIOD = 150

  const setQuality = (q: Quality) => {
    const shadows = q !== "bassa"
    const changed = renderer.shadowMap.enabled !== shadows
    renderer.shadowMap.enabled = shadows
    renderer.shadowMap.type = q === "alta" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    // In "media" il paese non si muove: la mappa d'ombra si fa una volta e basta.
    renderer.shadowMap.autoUpdate = q === "alta"
    renderer.shadowMap.needsUpdate = true
    const size = q === "alta" ? sm : 2048
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
    }
    altarLight.visible = naveLight.visible = q !== "bassa"
    if (changed) scene.traverse((o) => {
      const m = (o as THREE.Mesh).material
      if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true
    })
  }

  return {
    setQuality,
    update(dt: number, t: number, frame: WorldFrame) {
      ;(sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t
      for (const [i, h] of hay.entries()) {
        const b = Math.sin(t * 2.1 + i * 1.3)
        h.scale.set(1 - b * 0.015, 1 + b * 0.05, 1 - b * 0.015)
      }
      altarLight.intensity = 70 * (0.9 + 0.06 * Math.sin(t * 13) + 0.04 * Math.sin(t * 29 + 1))
      // l'orologio segna l'ora vera
      const d = new Date()
      const min = d.getMinutes() + d.getSeconds() / 60
      const hr = (d.getHours() % 12) + min / 60
      clockHands[0].rotation.z = -(hr / 12) * Math.PI * 2
      clockHands[1].rotation.z = -(min / 60) * Math.PI * 2
      dyn.update(dt, t, frame)
    },
    menuCamera(t: number, camera: THREE.PerspectiveCamera) {
      const s = (t / PERIOD) % 1
      camPath.getPoint(s, camera.position)
      lookPath.getPoint(s, look)
      camera.lookAt(look)
    }
  }
}
