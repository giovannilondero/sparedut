/**
 * Common tools for the procedural models: shared materials and textures (cached,
 * they live as long as the page), a "baker" that bakes many primitives into a single
 * vertex-coloured geometry, and a deterministic pseudo-random generator.
 */
import * as THREE from "three"

export const rng = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// --- canvas textures -----------------------------------------------------------------
const textures = new Map<string, THREE.CanvasTexture>()

export function canvasTexture(
  key: string,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  srgb = true
): THREE.CanvasTexture {
  const hit = textures.get(key)
  if (hit) return hit
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  draw(c.getContext("2d")!, w, h)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  textures.set(key, t)
  return t
}

/** Wood grain, in light greys: the material provides the colour. */
export const woodTex = () =>
  canvasTexture("wood", 128, 256, (g, w, h) => {
    const r = rng(7)
    g.fillStyle = "#e6e6e6"
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 60; i++) {
      const x = r() * w
      g.strokeStyle = `rgba(60,40,20,${0.08 + r() * 0.18})`
      g.lineWidth = 0.5 + r() * 2
      g.beginPath()
      g.moveTo(x, 0)
      for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y * 0.05 + i) * 3 * r(), y)
      g.stroke()
    }
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = "rgba(50,30,15,0.35)"
      g.beginPath()
      g.ellipse(r() * w, r() * h, 3 + r() * 4, 8 + r() * 10, 0, 0, Math.PI * 2)
      g.stroke()
    }
  })

/** Inlaid wood with scrolls and a small cross: the plevan's double-barrel. */
export const engravedTex = () =>
  canvasTexture("engraved", 256, 256, (g, w, h) => {
    g.drawImage(woodTex().image as HTMLCanvasElement, 0, 0, w, h)
    g.strokeStyle = "rgba(40,22,8,0.75)"
    g.lineWidth = 2
    for (let k = 0; k < 4; k++) {
      const cx = 64 + (k % 2) * 128
      const cy = 64 + Math.floor(k / 2) * 128
      g.beginPath()
      for (let a = 0; a < Math.PI * 6; a += 0.1) {
        const rr = a * 3.2
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
      }
      g.stroke()
      for (let j = 0; j < 6; j++) {
        g.beginPath()
        g.ellipse(cx + Math.cos(j) * 46, cy + Math.sin(j) * 46, 4, 10, j, 0, Math.PI * 2)
        g.stroke()
      }
    }
    g.strokeStyle = "rgba(255,220,140,0.5)"
    g.strokeRect(6, 6, w - 12, h - 12)
  })

/** Hammered copper. */
export const copperTex = () =>
  canvasTexture("copper", 128, 128, (g, w, h) => {
    const r = rng(11)
    g.fillStyle = "#e0e0e0"
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 140; i++) {
      const x = r() * w
      const y = r() * h
      const rad = 3 + r() * 6
      const grd = g.createRadialGradient(x - 1, y - 1, 0, x, y, rad)
      grd.addColorStop(0, "rgba(255,255,255,0.35)")
      grd.addColorStop(1, "rgba(80,40,20,0.12)")
      g.fillStyle = grd
      g.beginPath()
      g.arc(x, y, rad, 0, Math.PI * 2)
      g.fill()
    }
  })

/** Frico: golden crust with scorched lacy holes. */
export const fricoTex = () =>
  canvasTexture("frico", 128, 128, (g, w, h) => {
    const r = rng(23)
    g.fillStyle = "#f4c25a"
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${150 + r() * 60},${70 + r() * 40},20,${0.25 + r() * 0.5})`
      g.beginPath()
      g.arc(r() * w, r() * h, 1 + r() * 5, 0, Math.PI * 2)
      g.fill()
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = "rgba(255,240,170,0.6)"
      g.beginPath()
      g.arc(r() * w, r() * h, 1 + r() * 2, 0, Math.PI * 2)
      g.fill()
    }
  })

/** Bell-tower stone with the arched windows of the belfry. */
export const towerTex = () =>
  canvasTexture("tower", 64, 128, (g, w, h) => {
    const r = rng(5)
    g.fillStyle = "#e8e2d4"
    g.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 8)
      for (let x = (y / 8) % 2 ? -8 : 0; x < w; x += 16) {
        g.strokeStyle = `rgba(90,80,60,${0.25 + r() * 0.2})`
        g.strokeRect(x, y, 16, 8)
      }
    g.fillStyle = "#2a2018"
    g.beginPath()
    g.moveTo(18, 40)
    g.lineTo(18, 22)
    g.arc(32, 22, 14, Math.PI, 0)
    g.lineTo(46, 40)
    g.fill()
    g.fillStyle = "#fff8e8"
    g.beginPath()
    g.arc(32, 80, 11, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = "#222"
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(32, 80)
    g.lineTo(32, 72)
    g.moveTo(32, 80)
    g.lineTo(38, 82)
    g.stroke()
  })

/** Burlap of the cramâr's pouch. */
export const burlapTex = () =>
  canvasTexture("burlap", 64, 64, (g, w, h) => {
    g.fillStyle = "#e0d6c0"
    g.fillRect(0, 0, w, h)
    g.strokeStyle = "rgba(90,70,40,0.35)"
    for (let i = 0; i < w; i += 3) {
      g.beginPath()
      g.moveTo(i, 0)
      g.lineTo(i, h)
      g.moveTo(0, i)
      g.lineTo(w, i)
      g.stroke()
    }
  })

/** Soft star for flashes and sparks. */
export const flashTex = () =>
  canvasTexture("flash", 128, 128, (g, w, h) => {
    const cx = w / 2
    const grd = g.createRadialGradient(cx, cx, 0, cx, cx, cx)
    grd.addColorStop(0, "rgba(255,255,235,1)")
    grd.addColorStop(0.25, "rgba(255,210,110,0.9)")
    grd.addColorStop(0.6, "rgba(255,120,30,0.25)")
    grd.addColorStop(1, "rgba(255,80,0,0)")
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
    g.globalCompositeOperation = "lighter"
    g.fillStyle = "rgba(255,230,160,0.8)"
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      g.beginPath()
      g.moveTo(cx + Math.cos(a + 0.12) * 8, cx + Math.sin(a + 0.12) * 8)
      g.lineTo(cx + Math.cos(a) * cx * (0.75 + (i % 2) * 0.25), cx + Math.sin(a) * cx * (0.75 + (i % 2) * 0.25))
      g.lineTo(cx + Math.cos(a - 0.12) * 8, cx + Math.sin(a - 0.12) * 8)
      g.fill()
    }
  })

// --- materials ------------------------------------------------------------------------
const materials = new Map<string, THREE.MeshStandardMaterial>()

export function std(key: string, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  let m = materials.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...params })
    materials.set(key, m)
  }
  return m
}

/** The single material for baked models: vertex colours, flat facets. */
export const bakedMaterial = () => std("baked", { vertexColors: true, flatShading: true, roughness: 0.85 })

// --- the baker -----------------------------------------------------------------------
const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpE = new THREE.Euler()
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()
const tmpC = new THREE.Color()
const tmpN = new THREE.Matrix3()

/** Accumulates transformed, coloured primitives, then merges them into a single geometry. */
export class Baker {
  private pos: number[] = []
  private nor: number[] = []
  private col: number[] = []

  add(
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1
  ): this {
    tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(sx, sy, sz))
    return this.addMatrix(geo, color, tmpM)
  }

  addMatrix(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    if (!g.attributes.normal) g.computeVertexNormals()
    const p = g.attributes.position
    const n = g.attributes.normal
    tmpC.set(color)
    tmpN.getNormalMatrix(m)
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m)
      this.pos.push(v.x, v.y, v.z)
      v.fromBufferAttribute(n, i).applyMatrix3(tmpN).normalize()
      this.nor.push(v.x, v.y, v.z)
      this.col.push(tmpC.r, tmpC.g, tmpC.b)
    }
    g.dispose()
    geo.dispose()
    return this
  }

  /** Bakes all visible meshes of a group (colour = the material's colour). */
  addGroup(root: THREE.Object3D): this {
    root.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
    const m = new THREE.Matrix4()
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh) || o.userData.noBake) return
      for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) return
      const mat = o.material as THREE.MeshStandardMaterial
      m.multiplyMatrices(inv, o.matrixWorld)
      const g = o.geometry as THREE.BufferGeometry
      this.addMatrix(g.clone(), mat.color ?? 0xffffff, m)
    })
    return this
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3))
    g.computeBoundingSphere()
    return g
  }
}

/** Puts a mesh into a parent, in one line. */
export function put(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  parent.add(m)
  return m
}

export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const smooth = (t: number) => t * t * (3 - 2 * t)
/** 0→1→0 over [a,b]. */
export const bump = (p: number, a: number, b: number) => (p <= a || p >= b ? 0 : Math.sin(((p - a) / (b - a)) * Math.PI))
/** 0 before a, 1 after b, smooth in between. */
export const ramp = (p: number, a: number, b: number) => smooth(clamp((p - a) / (b - a), 0, 1))
