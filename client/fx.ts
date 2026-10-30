/**
 * Effetti del mondo: scie, sbuffi, briciole di polenta, lampi, esplosioni di frico e
 * di sgnape, proiettili in volo. Tutto a pool fissi creati qui: a regime nessuna
 * allocazione per colpo. Le particelle sono quad istanziati orientati in shader.
 */
import * as THREE from "three"
import type { Fx, P3 } from "./contracts.ts"
import type { PickupKind } from "../shared/map.ts"
import { FRICO_SHELL, GJALINE, RAIBL_MINE, SGNAPE_BOMB, type ProjectileKind, type WeaponId } from "../shared/weapons.ts"
import { flashTex } from "./models/kit.ts"
import { fricoDisc, gjaline, sgnapeBottle } from "./models/props.ts"

const C = (hex: number) => new THREE.Color(hex)
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

// --- particelle a quad istanziati ---------------------------------------------------------
const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iCol;
attribute vec2 iSR;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vUv = uv;
  vCol = iCol;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSR.y);
  float s = sin(iSR.y);
  vec2 p = position.xy;
  mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y) * iSR.x;
  gl_Position = projectionMatrix * mv;
}`

const FRAG_ADD = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 1.6) * vCol.a;
  gl_FragColor = vec4(vCol.rgb * (1.0 + a), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const FRAG_SMOKE = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec2 q = vUv - 0.5;
  float d = length(q) * 2.0;
  float lump = 0.82 + 0.18 * sin(atan(q.y, q.x) * 5.0 + vCol.a * 9.0);
  float a = smoothstep(lump, 0.15, d) * vCol.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

class Billboards {
  readonly mesh: THREE.Mesh
  private n = 0
  private cursor = 0
  private readonly geo: THREE.InstancedBufferGeometry
  private readonly pos: THREE.InstancedBufferAttribute
  private readonly col: THREE.InstancedBufferAttribute
  private readonly sr: THREE.InstancedBufferAttribute
  // stato per particella, in colonne
  private readonly f: Float32Array[]
  private px!: Float32Array; private py!: Float32Array; private pz!: Float32Array
  private vx!: Float32Array; private vy!: Float32Array; private vz!: Float32Array
  private life!: Float32Array; private max!: Float32Array; private s0!: Float32Array; private s1!: Float32Array
  private grav!: Float32Array; private drag!: Float32Array; private rot!: Float32Array; private spin!: Float32Array
  private r0!: Float32Array; private g0!: Float32Array; private b0!: Float32Array
  private r1!: Float32Array; private g1!: Float32Array; private b1!: Float32Array
  private readonly a0: Float32Array
  private readonly flick: Float32Array

  constructor(readonly cap: number, additive: boolean) {
    const col = () => new Float32Array(cap)
    this.f = Array.from({ length: 20 }, col)
    ;[this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.max, this.s0, this.s1, this.grav, this.drag, this.rot, this.spin, this.r0, this.g0, this.b0, this.r1, this.g1, this.b1] = this.f
    this.a0 = col()
    this.flick = col()
    this.f.push(this.a0, this.flick)
    const plane = new THREE.PlaneGeometry(1, 1)
    this.geo = new THREE.InstancedBufferGeometry()
    this.geo.index = plane.index
    this.geo.setAttribute("position", plane.attributes.position)
    this.geo.setAttribute("uv", plane.attributes.uv)
    const attr = (k: number) => new THREE.InstancedBufferAttribute(new Float32Array(cap * k), k).setUsage(THREE.DynamicDrawUsage)
    this.pos = attr(3)
    this.col = attr(4)
    this.sr = attr(2)
    this.geo.setAttribute("iPos", this.pos)
    this.geo.setAttribute("iCol", this.col)
    this.geo.setAttribute("iSR", this.sr)
    this.geo.instanceCount = 0
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: additive ? FRAG_ADD : FRAG_SMOKE,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    })
    this.mesh = new THREE.Mesh(this.geo, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = additive ? 3 : 2
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, s0: number, s1: number,
    c0: THREE.Color, c1: THREE.Color, alpha: number,
    grav = 0, drag = 0, flick = 0
  ) {
    const i = this.n < this.cap ? this.n++ : this.cursor++ % this.cap
    this.px[i] = x; this.py[i] = y; this.pz[i] = z
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz
    this.life[i] = 0; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1
    this.grav[i] = grav; this.drag[i] = drag
    this.rot[i] = Math.random() * 6.28; this.spin[i] = rnd(-2, 2)
    this.r0[i] = c0.r; this.g0[i] = c0.g; this.b0[i] = c0.b
    this.r1[i] = c1.r; this.g1[i] = c1.g; this.b1[i] = c1.b
    this.a0[i] = alpha; this.flick[i] = flick
  }

  update(dt: number) {
    const P = this.pos.array as Float32Array
    const Cc = this.col.array as Float32Array
    const S = this.sr.array as Float32Array
    for (let i = 0; i < this.n; ) {
      const l = (this.life[i] += dt)
      if (l >= this.max[i]) {
        const j = --this.n
        if (i !== j) for (const a of this.f) a[i] = a[j]
        continue
      }
      const k = l / this.max[i]
      const dr = Math.exp(-this.drag[i] * dt)
      this.vx[i] *= dr
      this.vy[i] = this.vy[i] * dr - this.grav[i] * dt
      this.vz[i] *= dr
      this.px[i] += this.vx[i] * dt
      this.py[i] += this.vy[i] * dt
      this.pz[i] += this.vz[i] * dt
      this.rot[i] += this.spin[i] * dt
      const e = 1 - (1 - k) * (1 - k)
      let a = this.a0[i] * Math.min(1, k * 12) * Math.pow(1 - k, 1.3)
      if (this.flick[i] > 0) a *= 1 - this.flick[i] * Math.random()
      P[i * 3] = this.px[i]
      P[i * 3 + 1] = this.py[i]
      P[i * 3 + 2] = this.pz[i]
      Cc[i * 4] = this.r0[i] + (this.r1[i] - this.r0[i]) * k
      Cc[i * 4 + 1] = this.g0[i] + (this.g1[i] - this.g0[i]) * k
      Cc[i * 4 + 2] = this.b0[i] + (this.b1[i] - this.b0[i]) * k
      Cc[i * 4 + 3] = a
      S[i * 2] = this.s0[i] + (this.s1[i] - this.s0[i]) * e
      S[i * 2 + 1] = this.rot[i]
      i++
    }
    this.geo.instanceCount = this.n
    this.pos.needsUpdate = this.col.needsUpdate = this.sr.needsUpdate = true
  }
}

// --- detriti solidi: briciole, pezzi di frico, schegge di vetro, fili di fieno -----------
class Debris {
  readonly mesh: THREE.InstancedMesh
  private n = 0
  private cursor = 0
  private readonly f: Float32Array[]
  private readonly c: Float32Array
  private readonly floor: Float32Array
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()

  constructor(readonly cap: number) {
    this.f = Array.from({ length: 19 }, () => new Float32Array(cap))
    this.floor = new Float32Array(cap)
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75, flatShading: true }), cap)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1))
    this.c = this.mesh.instanceColor!.array as Float32Array
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, sx: number, sy: number, sz: number,
    color: THREE.Color, grav = 9.8, drag = 0.5, floor = -1e9
  ) {
    const i = this.n < this.cap ? this.n++ : this.cursor++ % this.cap
    const f = this.f
    f[0][i] = x; f[1][i] = y; f[2][i] = z
    f[3][i] = vx; f[4][i] = vy; f[5][i] = vz
    f[6][i] = Math.random() * 6; f[7][i] = Math.random() * 6; f[8][i] = Math.random() * 6
    f[9][i] = rnd(-12, 12); f[10][i] = rnd(-12, 12); f[11][i] = rnd(-12, 12)
    f[12][i] = sx; f[13][i] = sy; f[14][i] = sz
    f[15][i] = 0; f[16][i] = life; f[17][i] = grav; f[18][i] = drag
    this.floor[i] = floor
    const c = this.c
    c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b
  }

  update(dt: number) {
    const f = this.f
    const c = this.c
    for (let i = 0; i < this.n; ) {
      const l = (f[15][i] += dt)
      if (l >= f[16][i]) {
        const j = --this.n
        if (i !== j) {
          for (const a of f) a[i] = a[j]
          this.floor[i] = this.floor[j]
          c[i * 3] = c[j * 3]; c[i * 3 + 1] = c[j * 3 + 1]; c[i * 3 + 2] = c[j * 3 + 2]
        }
        continue
      }
      const dr = Math.exp(-f[18][i] * dt)
      f[3][i] *= dr
      f[4][i] = f[4][i] * dr - f[17][i] * dt
      f[5][i] *= dr
      f[0][i] += f[3][i] * dt
      f[1][i] += f[4][i] * dt
      f[2][i] += f[5][i] * dt
      if (f[1][i] < this.floor[i]) {
        // rimbalzo smorzato sul terreno
        f[1][i] = this.floor[i]
        f[4][i] = Math.abs(f[4][i]) * 0.3
        f[3][i] *= 0.6; f[5][i] *= 0.6
        f[9][i] *= 0.5; f[10][i] *= 0.5; f[11][i] *= 0.5
      }
      f[6][i] += f[9][i] * dt; f[7][i] += f[10][i] * dt; f[8][i] += f[11][i] * dt
      const k = l / f[16][i]
      const sh = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
      this.m.compose(this.p.set(f[0][i], f[1][i], f[2][i]), this.q.setFromEuler(this.e.set(f[6][i], f[7][i], f[8][i])), this.s.set(f[12][i] * sh, f[13][i] * sh, f[14][i] * sh))
      this.mesh.setMatrixAt(i, this.m)
      i++
    }
    this.mesh.count = this.n
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor!.needsUpdate = true
  }
}

// --- scie dei proiettili -----------------------------------------------------------------
const TRACER: Record<WeaponId, { color: THREE.Color; speed: number; len: number; width: number } | null> = {
  mescul: null,
  mandi: { color: C(0xffd27a), speed: 380, len: 3.5, width: 0.02 },
  cramar: { color: C(0xffa14a), speed: 420, len: 4.5, width: 0.022 },
  doplete: { color: C(0xfff0c0), speed: 330, len: 2.2, width: 0.014 },
  cjampanili: { color: C(0xd8f4ff), speed: 650, len: 12, width: 0.04 },
  mulin: { color: C(0xffb85a), speed: 400, len: 3, width: 0.016 },
  // il getto del miedi: lento, corto e largo, verde camomilla
  miedi: { color: C(0x9effb0), speed: 38, len: 2.4, width: 0.07 },
  gjalinis: null,
  lanciafrico: null,
  // la mitraie delle torrette: scie lunghe e calde, una ogni quattro tick
  mitraie: { color: C(0xffc070), speed: 520, len: 5, width: 0.026 }
}

class Tracers {
  readonly mesh: THREE.InstancedMesh
  private n = 0
  private cursor = 0
  private readonly f: Float32Array[]
  private readonly cr: Float32Array
  private readonly c: Float32Array
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  private readonly d = new THREE.Vector3()
  private static readonly Z = new THREE.Vector3(0, 0, 1)

  constructor(readonly cap: number) {
    this.f = Array.from({ length: 11 }, () => new Float32Array(cap))
    this.cr = new Float32Array(cap * 3)
    const mat = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false })
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cap)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1))
    this.c = this.mesh.instanceColor!.array as Float32Array
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 4
  }

  spawn(a: P3, b: P3, w: WeaponId) {
    const t = TRACER[w]
    if (!t) return
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const dz = b[2] - a[2]
    const dist = Math.hypot(dx, dy, dz)
    if (dist < 0.3) return
    const i = this.n < this.cap ? this.n++ : this.cursor++ % this.cap
    const f = this.f
    f[0][i] = a[0]; f[1][i] = a[1]; f[2][i] = a[2]
    f[3][i] = dx / dist; f[4][i] = dy / dist; f[5][i] = dz / dist
    f[6][i] = dist; f[7][i] = -Math.random() * 0.01; f[8][i] = t.speed; f[9][i] = Math.min(t.len, dist * 0.6); f[10][i] = t.width
    this.cr[i * 3] = t.color.r; this.cr[i * 3 + 1] = t.color.g; this.cr[i * 3 + 2] = t.color.b
  }

  update(dt: number) {
    const f = this.f
    for (let i = 0; i < this.n; ) {
      const el = (f[7][i] += dt)
      const travel = Math.max(0, el) * f[8][i]
      const dist = f[6][i]
      const head = Math.min(dist, travel)
      const tail = Math.min(dist, Math.max(0, travel - f[9][i]))
      if (tail >= dist - 1e-3) {
        const j = --this.n
        if (i !== j) {
          for (const a of f) a[i] = a[j]
          this.cr[i * 3] = this.cr[j * 3]; this.cr[i * 3 + 1] = this.cr[j * 3 + 1]; this.cr[i * 3 + 2] = this.cr[j * 3 + 2]
        }
        continue
      }
      this.d.set(f[3][i], f[4][i], f[5][i])
      const mid = (head + tail) / 2
      const len = Math.max(0.01, head - tail)
      this.p.set(f[0][i] + this.d.x * mid, f[1][i] + this.d.y * mid, f[2][i] + this.d.z * mid)
      this.q.setFromUnitVectors(Tracers.Z, this.d)
      this.m.compose(this.p, this.q, this.s.set(f[10][i], f[10][i], len))
      this.mesh.setMatrixAt(i, this.m)
      const br = 1 - (tail / dist) * 0.7
      this.c[i * 3] = this.cr[i * 3] * br; this.c[i * 3 + 1] = this.cr[i * 3 + 1] * br; this.c[i * 3 + 2] = this.cr[i * 3 + 2] * br
      i++
    }
    this.mesh.count = this.n
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor!.needsUpdate = true
  }
}

// --- colori -------------------------------------------------------------------------------
const K = {
  dust: C(0xb8a68a), dustEnd: C(0x8a7d6a),
  spark: C(0xffd27a), sparkEnd: C(0xff6a20),
  chip: C(0x8a8478),
  polenta: C(0xf2c54a), polentaGold: C(0xffd84a), polentaPuff: C(0xffe08a), polentaPuffEnd: C(0xe8b84a),
  fire: C(0xffd25a), fireEnd: C(0xd04a10), core: C(0xfff4c0), cheese: C(0xffe070), cheeseEnd: C(0xffa020),
  smoke: C(0x5a4a3a), smokeEnd: C(0x8a8078),
  crisp: C(0xc07a28), crispDark: C(0x7a4416),
  flame: C(0x6ab8ff), flameEnd: C(0x2a40d0), flameHot: C(0xd8f4ff), violet: C(0x9a6aff),
  glass: C(0xcfeee6),
  feather: C(0xfffaf0), featherEnd: C(0xe8e0d0), featherDust: C(0xf4efe6),
  wood: C(0x8a5a34), woodDark: C(0x5a3a20),
  hay: C(0xe8cf6a), hayDark: C(0xc8a640), hayDust: C(0xd8c890),
  steam: C(0xf0e8d8), steamEnd: C(0xd0c8b8),
  ember: C(0xffb040), emberEnd: C(0xff4010),
  blackSmoke: C(0x2a2420), ash: C(0x4a4038),
  white: C(0xffffff)
}

const PICKUP: Record<PickupKind, THREE.Color> = {
  frico: C(0xffb030),
  gubane: C(0xffe9a0),
  sgnape: C(0x6fc8ff),
  munizions: C(0xc8ff6a),
  lanciafrico: C(0xff6a20)
}

/** Bruciatura a terra: disco scuro sfumato, disegnato una volta. */
function scorchTex() {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grad.addColorStop(0, "rgba(10,6,4,0.95)")
  grad.addColorStop(0.45, "rgba(20,12,8,0.8)")
  grad.addColorStop(0.8, "rgba(30,20,12,0.35)")
  grad.addColorStop(1, "rgba(30,20,12,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  // macchie irregolari sul bordo
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 6.283
    const r = 30 + Math.random() * 26
    g.fillStyle = `rgba(15,10,6,${0.2 + Math.random() * 0.3})`
    g.beginPath()
    g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 4 + Math.random() * 9, 0, 6.283)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const BLAST = { frico: FRICO_SHELL.radius, sgnape: SGNAPE_BOMB.radius, mine: RAIBL_MINE.radius, gjaline: GJALINE.radius } as const satisfies Record<ProjectileKind, number>

/** La mine di Raibl: un disco di ferro con la spoletta e una luce rossa che lampeggia. */
function raiblMine(): { g: THREE.Group; light: THREE.MeshBasicMaterial } {
  const g = new THREE.Group()
  const iron = new THREE.MeshLambertMaterial({ color: 0x4a4a40 })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.09, 14), iron)
  body.position.y = 0.045
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 10), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }))
  cap.position.y = 0.12
  const light = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false })
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), light)
  led.position.set(0.12, 0.1, 0)
  g.add(body, cap, led)
  return { g, light }
}
/** Quanto resta acceso il fuoco a terra (s). */
const FIRE_LIFE = 7
/** Schegge che lasciano una scia di fumo. */
const TRAILS = 64

export function createFx(scene: THREE.Scene): Fx {
  const add = new Billboards(1600, true)
  const smoke = new Billboards(700, false)
  const debris = new Debris(600)
  const tracers = new Tracers(96)
  scene.add(smoke.mesh, add.mesh, debris.mesh, tracers.mesh)

  // luci a numero fisso (cambiarlo ricompilerebbe gli shader del mondo)
  const lights = Array.from({ length: 4 }, () => {
    const l = new THREE.PointLight(0xffffff, 0, 10, 1.5)
    l.castShadow = false
    scene.add(l)
    return { l, t: 1, life: 1, peak: 0 }
  })
  let lightCursor = 0
  function flashLight(at: P3, color: THREE.Color, peak: number, dist: number, life: number) {
    const usable = lights.filter((x) => x.l.visible)
    if (!usable.length) return
    let best = usable[lightCursor++ % usable.length]
    for (const x of usable) if (x.t >= x.life) best = x
    best.l.position.set(at[0], at[1], at[2])
    best.l.color.copy(color)
    best.l.distance = dist
    best.peak = peak
    best.life = life
    best.t = 0
  }

  // lampi di volata
  const flashes = Array.from({ length: 10 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    s.visible = false
    s.renderOrder = 4
    scene.add(s)
    return { s, t: 1 }
  })
  let flashCursor = 0

  // proiettili: si riusano, se ne creano solo quando la lista cresce oltre il visto
  const fricos: THREE.Group[] = []
  const bottles: THREE.Group[] = []
  const mines: { g: THREE.Group; light: THREE.MeshBasicMaterial }[] = []
  const hens: { g: THREE.Group; wings: THREE.Object3D[]; last: THREE.Vector3 }[] = []
  let nFrico = 0
  let nBottle = 0
  let trailAcc = 0
  let time = 0

  const at3 = (a: P3) => a as [number, number, number]
  /** Quantità di particelle per qualità: in bassa la metà. */
  let detail = 1
  const n = (k: number) => Math.max(1, Math.round(k * detail))

  // onda d'urto: anello piatto che si allarga
  const ringMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const rings = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), ringMat())
    m.visible = false
    m.renderOrder = 3
    scene.add(m)
    return { m, t: 1, life: 0.4, size: 1 }
  })
  let ringCursor = 0

  // bruciature a terra
  const scorchMap = scorchTex()
  const scorches = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: scorchMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    )
    m.visible = false
    m.renderOrder = 1
    scene.add(m)
    return { m, t: 0, life: 25 }
  })
  let scorchCursor = 0

  // fuochi a terra: lingue di fiamma che nascono in un disco per qualche secondo
  const fires = Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0, r: 1, t: FIRE_LIFE, acc: 0, smokeAcc: 0, blue: false }))
  let fireCursor = 0

  // schegge con la scia: punti che volano in parabola lasciando fumo e braci
  const tr = { x: new Float32Array(TRAILS), y: new Float32Array(TRAILS), z: new Float32Array(TRAILS), vx: new Float32Array(TRAILS), vy: new Float32Array(TRAILS), vz: new Float32Array(TRAILS), t: new Float32Array(TRAILS).fill(9), life: new Float32Array(TRAILS), floor: new Float32Array(TRAILS), blue: new Uint8Array(TRAILS) }
  let trailCursor = 0

  function burst(
    pool: Billboards, n: number, at: P3, speed: number, up: number,
    life: [number, number], size: [number, number, number, number],
    c0: THREE.Color, c1: THREE.Color, alpha: number, grav = 0, drag = 2, flick = 0, spread = 0
  ) {
    const [x, y, z] = at3(at)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283
      const e = rnd(-1, 1)
      const r = Math.sqrt(1 - e * e)
      const v = speed * rnd(0.3, 1)
      pool.spawn(
        x + rnd(-spread, spread), y + rnd(-spread, spread) * 0.5, z + rnd(-spread, spread),
        Math.cos(a) * r * v, e * v * 0.6 + up * rnd(0.5, 1.2), Math.sin(a) * r * v,
        rnd(life[0], life[1]), rnd(size[0], size[1]), rnd(size[2], size[3]), c0, c1, alpha, grav, drag, flick
      )
    }
  }

  function chunks(n: number, at: P3, speed: number, up: number, life: [number, number], s: [number, number], color: THREE.Color, alt: THREE.Color | null, flat: number, floor: number, drag = 0.4, grav = 9.8) {
    const [x, y, z] = at3(at)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283
      const v = speed * rnd(0.35, 1)
      const sz = rnd(s[0], s[1])
      debris.spawn(x, y, z, Math.cos(a) * v, up * rnd(0.4, 1.2), Math.sin(a) * v, rnd(life[0], life[1]), sz, sz * flat, sz * rnd(0.6, 1.3), alt && Math.random() < 0.4 ? alt : color, grav, drag, floor)
    }
  }

  return {
    setQuality(q) {
      detail = q === "bassa" ? 0.5 : 1
      const n = q === "alta" ? 4 : q === "media" ? 2 : 0
      lights.forEach((x, i) => {
        x.l.visible = i < n
      })
    },
    tracer(from, to, weapon) {
      tracers.spawn(from, to, weapon)
    },
    impact(at) {
      burst(smoke, 4, at, 1.2, 0.5, [0.5, 0.9], [0.12, 0.2, 0.45, 0.7], K.dust, K.dustEnd, 0.55, -0.3, 3, 0, 0.03)
      burst(add, 6, at, 5, 1.5, [0.12, 0.3], [0.03, 0.05, 0.01, 0.02], K.spark, K.sparkEnd, 1, 9, 1)
      chunks(3, at, 2, 2.5, [0.4, 0.7], [0.015, 0.03], K.chip, null, 1, -1e9)
    },
    hitPuff(at, head) {
      const n = head ? 16 : 8
      chunks(n, at, head ? 3.2 : 2.2, 3, [0.5, 0.9], head ? [0.03, 0.055] : [0.02, 0.04], head ? K.polentaGold : K.polenta, K.polentaPuffEnd, 0.8, -1e9, 0.6)
      burst(smoke, head ? 5 : 3, at, 1.4, 0.6, [0.35, 0.6], [0.1, 0.18, 0.35, 0.55], K.polentaPuff, K.polentaPuffEnd, 0.8, 0, 3)
      if (head) burst(add, 10, at, 3, 1, [0.15, 0.35], [0.08, 0.14, 0.02, 0.05], K.polentaGold, K.fireEnd, 1, 2, 2)
    },
    muzzle(at) {
      const f = flashes[flashCursor++ % flashes.length]
      f.s.position.set(at[0], at[1], at[2])
      f.s.material.rotation = Math.random() * 6.28
      f.s.scale.setScalar(rnd(0.35, 0.5))
      f.s.visible = true
      f.t = 0
      flashLight(at, K.spark, 6, 7, 0.06)
    },
    explosion(at, kind, ground) {
      const [x, y, z] = at3(at)
      const R = BLAST[kind]
      if (kind === "gjaline") {
        // niente fuoco: un pof bianco e una nevicata di piume che scendono piano
        flashLight(at, K.white, 30, R * 4, 0.25)
        add.spawn(x, y, z, 0, 0, 0, 0.2, R * 0.4, R * 1.2, K.white, K.featherEnd, 0.8)
        burst(smoke, n(22), at, R * 2.2, 1, [0.8, 1.5], [R * 0.25, R * 0.45, R * 0.6, R * 0.9], K.featherDust, K.featherEnd, 0.85, -0.3, 3, 0, 0.3 * R)
        const floor = ground ?? y - 3
        for (let i = 0; i < n(70); i++) {
          const a = Math.random() * 6.283
          const v = rnd(1.5, 6)
          const len = rnd(0.07, 0.16)
          debris.spawn(x, y, z, Math.cos(a) * v, rnd(1, 5), Math.sin(a) * v, rnd(2.5, 4.5), len * 0.45, 0.006, len, Math.random() < 0.15 ? K.crisp : K.feather, 1.1, 2.2, floor)
        }
        return
      }
      const blue = kind === "sgnape"
      // a terra se il pavimento è vicino; in aria niente fuoco né bruciatura
      const onGround = ground !== null && y - ground < 2.5
      const floor = ground ?? y - 0.25
      const hot = blue ? K.flameHot : K.core
      const fire = blue ? K.flame : K.fire
      const fireEnd = blue ? K.flameEnd : K.fireEnd

      flashLight(at, blue ? K.flame : K.fire, 160, R * 7, 0.8)
      // lampo bianco e palla di fuoco grande quanto il raggio del danno
      add.spawn(x, y, z, 0, 0, 0, 0.16, R * 0.6, R * 2, hot, fire, 1)
      add.spawn(x, y + 0.3, z, 0, 1, 0, 0.45, R * 0.9, R * 1.5, fire, fireEnd, 0.9)
      burst(add, n(46), at, R * 3.2, 2, [0.4, 0.9], [R * 0.3, R * 0.5, R * 0.6, R], fire, fireEnd, 0.85, -1.5, 5, 0.25, 0.4 * R)
      // corpo pieno della palla di fuoco (non additivo: si vede anche di giorno), che si spegne in fumo nero
      burst(smoke, n(28), at, R * 2.6, 2.5, [0.8, 1.4], [R * 0.35, R * 0.55, R * 0.7, R * 1.1], fire, blue ? K.smokeEnd : K.blackSmoke, 0.95, -1.5, 4, 0, 0.35 * R)
      // colonna che sale
      burst(add, n(18), at, 2.5, 7, [0.7, 1.2], [R * 0.25, R * 0.4, R * 0.5, R * 0.8], fire, fireEnd, 0.8, -4, 1.8, 0.5, 0.2 * R)
      if (blue) burst(add, n(14), at, 4, 4, [0.4, 0.8], [0.6, 1.2, 0.2, 0.5], K.flameHot, K.violet, 1, -1, 2, 0.4, 0.5)
      else burst(add, n(16), at, 5, 4, [0.6, 1.1], [0.3, 0.5, 0.12, 0.25], K.cheese, K.cheeseEnd, 1, 2, 1.5, 0.4, 0.5)

      // frammentazione: scintille a raggiera, pezzi che rimbalzano, schegge col fumo
      burst(add, n(80), at, R * 7, 5, [0.5, 1.2], [0.06, 0.11, 0.02, 0.04], K.spark, K.sparkEnd, 1, 12, 0.5, 0.3)
      chunks(n(44), at, R * 4, 10, [2, 3.5], [0.05, 0.15], blue ? K.glass : K.crisp, blue ? K.white : K.crispDark, blue ? 0.15 : 0.35, floor, 0.25)
      chunks(n(16), at, R * 2.5, 8, [2.5, 4], [0.08, 0.2], K.ash, K.blackSmoke, 0.6, floor, 0.25)
      for (let i = 0; i < n(14); i++) {
        const k = trailCursor++ % TRAILS
        const a = Math.random() * 6.283
        const v = rnd(9, 17)
        tr.x[k] = x; tr.y[k] = y + 0.2; tr.z[k] = z
        tr.vx[k] = Math.cos(a) * v; tr.vy[k] = rnd(5, 13); tr.vz[k] = Math.sin(a) * v
        tr.t[k] = 0; tr.life[k] = rnd(0.9, 1.6); tr.floor[k] = floor; tr.blue[k] = blue ? 1 : 0
      }

      // onda d'urto e polvere che corre a terra
      const ring = rings[ringCursor++ % rings.length]
      ring.m.position.set(x, onGround ? floor + 0.08 : y, z)
      ;(ring.m.material as THREE.MeshBasicMaterial).color.copy(blue ? K.flameHot : K.spark)
      ring.t = 0
      ring.size = R * 2.2
      ring.m.visible = true
      if (onGround) {
        for (let i = 0; i < n(28); i++) {
          const a = (i / 28) * 6.283 + rnd(-0.1, 0.1)
          const v = rnd(9, 15)
          smoke.spawn(x + Math.cos(a) * 0.6, floor + 0.25, z + Math.sin(a) * 0.6, Math.cos(a) * v, rnd(0.3, 1.2), Math.sin(a) * v, rnd(1.4, 2.4), 0.8, 2.8, K.dust, K.dustEnd, 0.75, 0, 2.6)
        }
      }
      // fumo: denso e scuro per il frico, chiaro per la sgnape
      burst(smoke, n(30), at, 4, 3, [2.8, 5], [R * 0.3, R * 0.5, R * 0.9, R * 1.5], blue ? K.smokeEnd : K.blackSmoke, blue ? K.steamEnd : K.smokeEnd, blue ? 0.45 : 0.8, -0.9, 1.1, 0, 0.3 * R)

      if (onGround) {
        const f = fires[fireCursor++ % fires.length]
        Object.assign(f, { x, y: floor, z, r: R * 0.6, t: 0, acc: 0, smokeAcc: 0, blue })
        const sc = scorches[scorchCursor++ % scorches.length]
        sc.m.position.set(x, floor + 0.03, z)
        sc.m.scale.setScalar(R * 0.85)
        sc.m.rotation.y = Math.random() * 6.283
        ;(sc.m.material as THREE.MeshBasicMaterial).opacity = 1
        sc.t = 0
        sc.m.visible = true
      }
    },
    projectiles(list) {
      let nf = 0
      let nb = 0
      let nm = 0
      let nh = 0
      for (const [kind, x, y, z] of list) {
        if (kind === "mine") {
          let m = mines[nm]
          if (!m) {
            m = raiblMine()
            scene.add(m.g)
            mines.push(m)
          }
          m.g.visible = true
          m.g.position.set(x, y, z)
          // lampeggia: una volta al secondo, sfasate fra loro
          m.light.color.setHex((time + nm * 0.37) % 1 < 0.15 ? 0xff3a20 : 0x3a0a06)
          nm++
        } else if (kind === "gjaline") {
          let h = hens[nh]
          if (!h) {
            const made = gjaline()
            h = { g: made.g, wings: made.wings, last: new THREE.Vector3(x, y, z) }
            scene.add(h.g)
            hens.push(h)
          }
          h.g.visible = true
          // guarda dove va: dalla posizione precedente alla nuova
          const dx = x - h.last.x
          const dz = z - h.last.z
          if (dx * dx + dz * dz > 1e-4) h.g.rotation.y = Math.atan2(dx, dz)
          h.g.rotation.x = Math.max(-0.6, Math.min(0.6, -(y - h.last.y) * 3))
          h.last.set(x, y, z)
          h.g.position.set(x, y, z)
          const flap = Math.sin(time * 38 + nh) * 0.9
          h.wings[0].rotation.z = flap
          h.wings[1].rotation.z = -flap
          nh++
        } else if (kind === "frico") {
          let m = fricos[nf]
          if (!m) {
            m = fricoDisc()
            scene.add(m)
            fricos.push(m)
          }
          m.visible = true
          m.position.set(x, y, z)
          m.rotation.set(0.35 + Math.sin(time * 3 + nf) * 0.1, time * 14 + nf, 0.2)
          nf++
        } else {
          let m = bottles[nb]
          if (!m) {
            m = new THREE.Group()
            const b = sgnapeBottle()
            b.position.y = -0.11
            m.add(b)
            scene.add(m)
            bottles.push(m)
          }
          m.visible = true
          m.position.set(x, y, z)
          m.rotation.set(time * 9 + nb, nb, time * 5.5 + nb * 2)
          nb++
        }
      }
      for (let i = nm; i < mines.length; i++) mines[i].g.visible = false
      for (let i = nh; i < hens.length; i++) hens[i].g.visible = false
      for (let i = nf; i < nFrico; i++) fricos[i].visible = false
      for (let i = nb; i < nBottle; i++) bottles[i].visible = false
      nFrico = nf
      nBottle = nb
    },
    splinters(at, big) {
      const [x, y, z] = at3(at)
      for (let i = 0; i < n(big ? 40 : 10); i++) {
        const a = Math.random() * 6.283
        const v = rnd(1.5, big ? 7 : 4)
        const len = rnd(0.1, big ? 0.5 : 0.25)
        debris.spawn(x, y + rnd(-0.8, 0.8), z, Math.cos(a) * v, rnd(1, 4), Math.sin(a) * v, rnd(1.2, 2.5), len * 0.25, len * 0.08, len, Math.random() < 0.4 ? K.woodDark : K.wood, 9.8, 0.4, y - 1.1)
      }
      burst(smoke, n(big ? 14 : 4), at, 2, 0.5, [0.6, 1.2], [0.2, 0.4, 0.6, 1.1], K.dust, K.dustEnd, 0.6, 0, 3)
    },
    padBurst(at) {
      const [x, y, z] = at3(at)
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * 6.283 + rnd(-0.1, 0.1)
        const v = rnd(2.5, 5)
        const len = rnd(0.12, 0.22)
        debris.spawn(x + Math.cos(a) * 0.3, y + 0.2, z + Math.sin(a) * 0.3, Math.cos(a) * v, rnd(4, 8), Math.sin(a) * v, rnd(1.2, 2), 0.012, 0.012, len, Math.random() < 0.5 ? K.hay : K.hayDark, 4, 1.6, y)
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 6.283
        smoke.spawn(x, y + 0.15, z, Math.cos(a) * 3, 0.4, Math.sin(a) * 3, rnd(0.6, 1), 0.3, 0.9, K.hayDust, K.dust, 0.6, 0, 3.5)
      }
    },
    pickupBurst(at, kind) {
      const [x, y, z] = at3(at)
      const c = PICKUP[kind]
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * 6.283 * 2
        const r = rnd(0.2, 0.45)
        add.spawn(x + Math.cos(a) * r, y + rnd(0, 0.5), z + Math.sin(a) * r, -Math.sin(a) * 1.2, rnd(1.2, 2.8), Math.cos(a) * 1.2, rnd(0.5, 0.9), rnd(0.08, 0.14), 0.02, K.white, c, 1, 0, 1.2, 0.5)
      }
      add.spawn(x, y + 0.3, z, 0, 0, 0, 0.25, 0.6, 1.4, c, c, 0.8)
    },
    update(dt, _camera) {
      dt = Math.min(dt, 0.1)
      time += dt
      // scie dei proiettili in volo: vapore dal frico, scintille dalla miccia
      trailAcc += dt
      if (trailAcc > 0.035) {
        trailAcc = 0
        for (let i = 0; i < nFrico; i++) {
          const p = fricos[i].position
          smoke.spawn(p.x, p.y, p.z, rnd(-0.2, 0.2), 0.5, rnd(-0.2, 0.2), 0.6, 0.12, 0.45, K.steam, K.steamEnd, 0.35, -0.4, 1)
        }
        for (let i = 0; i < nBottle; i++) {
          const p = bottles[i].position
          add.spawn(p.x, p.y + 0.05, p.z, rnd(-1, 1), rnd(0.5, 2), rnd(-1, 1), 0.25, 0.06, 0.01, K.ember, K.emberEnd, 1, 4, 1, 0.5)
          add.spawn(p.x, p.y, p.z, 0, 0.3, 0, 0.3, 0.14, 0.05, K.flame, K.flameEnd, 0.6, 0, 1, 0.5)
        }
      }
      // schegge con la scia
      for (let k = 0; k < TRAILS; k++) {
        if (tr.t[k] >= tr.life[k]) continue
        tr.t[k] += dt
        tr.vy[k] -= 14 * dt
        tr.x[k] += tr.vx[k] * dt; tr.y[k] += tr.vy[k] * dt; tr.z[k] += tr.vz[k] * dt
        if (tr.y[k] < tr.floor[k]) tr.t[k] = tr.life[k]
        const fade = 1 - tr.t[k] / tr.life[k]
        add.spawn(tr.x[k], tr.y[k], tr.z[k], 0, 0, 0, 0.18, 0.22 * fade + 0.05, 0.02, tr.blue[k] ? K.flameHot : K.ember, tr.blue[k] ? K.flame : K.emberEnd, 1)
        if (Math.random() < 0.3) smoke.spawn(tr.x[k], tr.y[k], tr.z[k], rnd(-0.2, 0.2), 0.3, rnd(-0.2, 0.2), rnd(0.7, 1.2), 0.15, 0.7 * fade + 0.2, K.ash, K.smokeEnd, 0.55 * fade, -0.3, 1)
      }
      // fuochi a terra
      for (const f of fires) {
        if (f.t >= FIRE_LIFE) continue
        f.t += dt
        const k = f.t / FIRE_LIFE
        const strength = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4
        f.acc += dt * 40 * strength * detail
        while (f.acc >= 1) {
          f.acc -= 1
          const a = Math.random() * 6.283
          const r = Math.sqrt(Math.random()) * f.r * (0.6 + 0.4 * strength)
          const s0 = rnd(2, 3.4) * (1 - (r / f.r) * 0.45)
          const fx = f.x + Math.cos(a) * r
          const fz = f.z + Math.sin(a) * r
          // lingua di fiamma piena (sollevata: il quad non deve finire mezzo sotto terra), più un alone
          smoke.spawn(fx, f.y + s0 * 0.22, fz, rnd(-0.2, 0.2), rnd(1.2, 2.4), rnd(-0.2, 0.2), rnd(0.6, 1), s0, s0 * 0.35, f.blue ? K.flame : K.fire, f.blue ? K.flameEnd : K.fireEnd, 0.95, -1, 1.5)
          if (Math.random() < 0.5) add.spawn(fx, f.y + s0 * 0.5, fz, 0, rnd(0.8, 1.6), 0, rnd(0.3, 0.5), s0 * 1.1, s0 * 0.6, f.blue ? K.flameHot : K.cheese, f.blue ? K.flame : K.fireEnd, 0.8, 0, 1, 0.5)
          if (Math.random() < 0.15) add.spawn(f.x + Math.cos(a) * r, f.y + 0.2, f.z + Math.sin(a) * r, rnd(-0.6, 0.6), rnd(2, 4), rnd(-0.6, 0.6), rnd(0.6, 1.2), 0.05, 0.01, f.blue ? K.flameHot : K.ember, f.blue ? K.violet : K.emberEnd, 1, 1, 0.5)
        }
        f.smokeAcc += dt * 5 * strength * detail
        while (f.smokeAcc >= 1) {
          f.smokeAcc -= 1
          smoke.spawn(f.x + rnd(-f.r, f.r) * 0.5, f.y + 0.8, f.z + rnd(-f.r, f.r) * 0.5, rnd(-0.3, 0.3), rnd(1, 1.8), rnd(-0.3, 0.3), rnd(2, 3.2), 0.6, 2.2, f.blue ? K.smokeEnd : K.blackSmoke, K.smokeEnd, f.blue ? 0.25 : 0.5, -0.4, 0.8)
        }
      }
      for (const r of rings) {
        if (!r.m.visible) continue
        r.t += dt
        const k = r.t / r.life
        if (k >= 1) {
          r.m.visible = false
          continue
        }
        r.m.scale.setScalar(0.3 + r.size * (1 - (1 - k) * (1 - k)))
        ;(r.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.85
      }
      for (const sc of scorches) {
        if (!sc.m.visible) continue
        sc.t += dt
        if (sc.t >= sc.life) sc.m.visible = false
        else (sc.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (sc.life - sc.t) / 5)
      }
      add.update(dt)
      smoke.update(dt)
      debris.update(dt)
      tracers.update(dt)
      for (const f of flashes) {
        if (!f.s.visible) continue
        f.t += dt
        f.s.material.opacity = 1 - f.t / 0.05
        if (f.t > 0.05) f.s.visible = false
      }
      for (const x of lights) {
        if (x.t >= x.life) {
          x.l.intensity = 0
          continue
        }
        x.t += dt
        const k = Math.min(1, x.t / x.life)
        x.l.intensity = x.peak * (1 - k) * (1 - k)
      }
    }
  }
}
