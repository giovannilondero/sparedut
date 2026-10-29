/**
 * Effetti del mondo: scie, sbuffi, briciole di polenta, lampi, esplosioni di frico e
 * di sgnape, proiettili in volo. Tutto a pool fissi creati qui: a regime nessuna
 * allocazione per colpo. Le particelle sono quad istanziati orientati in shader.
 */
import * as THREE from "three"
import type { Fx, P3 } from "./contracts.ts"
import type { PickupKind } from "../shared/map.ts"
import type { WeaponId } from "../shared/weapons.ts"
import { flashTex } from "./models/kit.ts"
import { fricoDisc, sgnapeBottle } from "./models/props.ts"

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
  lanciafrico: null
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
  hay: C(0xe8cf6a), hayDark: C(0xc8a640), hayDust: C(0xd8c890),
  steam: C(0xf0e8d8), steamEnd: C(0xd0c8b8),
  ember: C(0xffb040), emberEnd: C(0xff4010),
  white: C(0xffffff)
}

const PICKUP: Record<PickupKind, THREE.Color> = {
  frico: C(0xffb030),
  gubane: C(0xffe9a0),
  sgnape: C(0x6fc8ff),
  munizions: C(0xc8ff6a),
  lanciafrico: C(0xff6a20)
}

export function createFx(scene: THREE.Scene): Fx {
  const add = new Billboards(900, true)
  const smoke = new Billboards(420, false)
  const debris = new Debris(420)
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
    let best = lights[lightCursor++ % lights.length]
    for (const x of lights) if (x.t >= x.life) best = x
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
  let nFrico = 0
  let nBottle = 0
  let trailAcc = 0
  let time = 0

  const at3 = (a: P3) => a as [number, number, number]

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
    explosion(at, kind) {
      const [x, y, z] = at3(at)
      const floor = y - 0.25
      if (kind === "frico") {
        flashLight(at, K.fire, 90, 18, 0.45)
        add.spawn(x, y, z, 0, 0, 0, 0.14, 2.5, 5, K.core, K.fire, 1)
        burst(add, 22, at, 7, 1.5, [0.35, 0.7], [0.7, 1.2, 1.6, 2.6], K.fire, K.fireEnd, 0.9, -1, 4.5, 0.3, 0.3)
        // bolle di formaggio fuso che salgono e scoppiettano
        burst(add, 14, at, 3, 2.5, [0.5, 0.9], [0.25, 0.4, 0.1, 0.2], K.cheese, K.cheeseEnd, 1, -0.5, 2, 0.4, 0.5)
        burst(add, 26, at, 14, 3, [0.3, 0.7], [0.04, 0.07, 0.01, 0.02], K.spark, K.sparkEnd, 1, 9, 1)
        burst(smoke, 14, at, 2.5, 1.2, [1.4, 2.4], [0.8, 1.2, 2.4, 3.6], K.smoke, K.smokeEnd, 0.7, -0.5, 1.5, 0, 0.6)
        chunks(20, at, 7, 7, [1.2, 2], [0.05, 0.11], K.crisp, K.crispDark, 0.35, floor)
      } else {
        flashLight(at, K.flame, 70, 15, 0.5)
        add.spawn(x, y, z, 0, 0, 0, 0.12, 2, 4, K.flameHot, K.flame, 1)
        // fiamma blu del flambé: lingue che salgono e tremolano
        burst(add, 30, at, 4, 3.2, [0.45, 0.9], [0.5, 0.9, 0.2, 0.5], K.flame, K.flameEnd, 0.9, -2, 2.2, 0.45, 0.7)
        burst(add, 10, at, 2, 4, [0.3, 0.6], [0.3, 0.5, 0.1, 0.2], K.flameHot, K.violet, 1, -1, 2, 0.3, 0.3)
        burst(add, 18, at, 10, 2, [0.25, 0.5], [0.03, 0.05, 0.01, 0.02], K.flameHot, K.flame, 1, 7, 1.5)
        burst(smoke, 6, at, 1.5, 1, [1, 1.6], [0.6, 0.9, 1.6, 2.2], K.smokeEnd, K.steamEnd, 0.35, -0.6, 1.5, 0, 0.4)
        chunks(16, at, 6, 5, [0.9, 1.5], [0.03, 0.06], K.glass, K.white, 0.15, floor, 0.3)
      }
    },
    projectiles(list) {
      let nf = 0
      let nb = 0
      for (const [kind, x, y, z] of list) {
        if (kind === "frico") {
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
      for (let i = nf; i < nFrico; i++) fricos[i].visible = false
      for (let i = nb; i < nBottle; i++) bottles[i].visible = false
      nFrico = nf
      nBottle = nb
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
