/**
 * L'arma in prima persona: scena e camera sue (FOV fisso), disegnate sopra il mondo.
 * Tutte le armi si costruiscono una volta; le animazioni sono funzioni del tempo
 * sommate su un unico "rig": respiro, passo, inerzia, rinculo, ricarica, cambio.
 */
import * as THREE from "three"
import type { Viewmodel, ViewmodelFrame } from "./contracts.ts"
import { WEAPON_IDS, type WeaponId } from "../shared/weapons.ts"
import { bump, burlapTex, clamp, damp, flashTex, put, ramp, std } from "./models/kit.ts"
import { sgnapeBottle } from "./models/props.ts"
import { buildWeapon, type WeaponModel } from "./models/weapons.ts"

interface Hold {
  readonly hip: readonly [number, number, number]
  readonly rot: readonly [number, number, number]
  /** Posa di mira (null = centrata sulla linea di mira). */
  readonly aim: readonly [number, number, number] | null
  readonly kickZ: number
  readonly kickR: number
  readonly flash: number
}

const HOLD: Record<WeaponId, Hold> = {
  mescul: { hip: [0.2, -0.2, -0.38], rot: [0.55, 0.3, 0.45], aim: [0.1, -0.17, -0.42], kickZ: 0, kickR: 0, flash: 0 },
  mandi: { hip: [0.13, -0.13, -0.36], rot: [0.02, 0.04, 0], aim: null, kickZ: 0.03, kickR: 0.14, flash: 0.12 },
  cramar: { hip: [0.14, -0.15, -0.36], rot: [0.02, 0.05, 0], aim: null, kickZ: 0.016, kickR: 0.045, flash: 0.16 },
  doplete: { hip: [0.14, -0.14, -0.34], rot: [0.02, 0.05, 0], aim: null, kickZ: 0.07, kickR: 0.26, flash: 0.26 },
  cjampanili: { hip: [0.14, -0.14, -0.34], rot: [0.02, 0.04, 0], aim: null, kickZ: 0.06, kickR: 0.18, flash: 0.22 },
  mulin: { hip: [0.15, -0.2, -0.38], rot: [0.02, 0.05, 0], aim: [0.06, -0.2, -0.36], kickZ: 0.006, kickR: 0.012, flash: 0.14 },
  miedi: { hip: [0.15, -0.17, -0.36], rot: [0.03, 0.06, 0], aim: [0.1, -0.16, -0.34], kickZ: 0, kickR: 0, flash: 0 },
  gjalinis: { hip: [0.16, -0.19, -0.36], rot: [0.03, 0.07, 0], aim: [0.09, -0.19, -0.36], kickZ: 0.07, kickR: 0.16, flash: 0.22 },
  lanciafrico: { hip: [0.17, -0.21, -0.4], rot: [0.03, 0.06, 0], aim: null, kickZ: 0.08, kickR: 0.2, flash: 0.3 },
  // alla torretta: l'arma sta davanti, centrata, tenuta con due mani
  mitraie: { hip: [0.09, -0.25, -0.34], rot: [0, 0, 0], aim: null, kickZ: 0.008, kickR: 0.01, flash: 0.18 }
}

const SWITCH_DOWN = 0.16
const SWITCH_UP = 0.22
const SWING = 0.42
const TOSS = 0.6
/** Di quanto il mirino resta sotto la linea di mira quando si mira (m). */
const AIM_DROP = 0.035
const BOLT_CYCLE = 0.65
const Y = new THREE.Vector3(0, 1, 0)
const X = new THREE.Vector3(1, 0, 0)

const skin = () => std("vm-skin", { color: 0xe3a985, roughness: 0.75 })
const linen = () => std("vm-linen", { color: 0xe9e2d0, map: burlapTex(), roughness: 0.95 })
const cuff = () => std("vm-cuff", { color: 0x6b4a2a, roughness: 0.9 })

/** Mano + manica che esce dall'inquadratura nella direzione `dir` (spazio rig). */
function arm(parent: THREE.Object3D, at: THREE.Vector3, dir: THREE.Vector3, hold: Euler3): THREE.Group {
  const g = new THREE.Group()
  g.position.copy(at)
  parent.add(g)
  put(g, new THREE.BoxGeometry(0.044, 0.052, 0.082), skin(), 0, -0.006, 0.008)
  put(g, new THREE.BoxGeometry(0.016, 0.016, 0.04), skin(), -0.022, 0.012, -0.012, 0, 0.3)
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...hold)).invert()
  const d = dir.clone().normalize().applyQuaternion(q)
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.44, 10), linen())
  sleeve.position.copy(d).multiplyScalar(0.27)
  sleeve.quaternion.setFromUnitVectors(Y, d)
  g.add(sleeve)
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 10), cuff())
  c.position.copy(d).multiplyScalar(0.055)
  c.quaternion.copy(sleeve.quaternion)
  g.add(c)
  return g
}

type Euler3 = readonly [number, number, number]

interface Slot {
  readonly id: WeaponId
  readonly model: WeaponModel
  readonly hold: Hold
  readonly leftArm: THREE.Group
  readonly leftBase: THREE.Vector3
  /** Trasformazioni di riposo delle parti mobili. */
  readonly rest: { o: THREE.Object3D; p: THREE.Vector3; r: THREE.Euler; v: boolean }[]
}

function makeSlot(id: WeaponId): Slot {
  const model = buildWeapon(id)
  const hold = HOLD[id]
  arm(model.root, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.25, -0.55, 0.8), hold.rot)
  const leftBase = model.left ? model.left.clone() : new THREE.Vector3(-0.1, -0.22, 0.08)
  const leftArm = arm(model.root, leftBase, new THREE.Vector3(-0.35, -0.5, 0.8), hold.rot)
  leftArm.visible = model.left !== null
  const rest: Slot["rest"] = []
  const parts = model.parts
  for (const o of [parts.mag, parts.slide, parts.barrels, parts.bolt, parts.frico, parts.pouch, parts.spinner, ...(parts.shells ?? [])])
    if (o) rest.push({ o, p: o.position.clone(), r: o.rotation.clone(), v: o.visible })
  model.root.visible = false
  return { id, model, hold, leftArm, leftBase, rest }
}

export function createViewmodel(worldCamera: THREE.PerspectiveCamera): Viewmodel {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, worldCamera.aspect, 0.01, 10)

  // luce calda di fine pomeriggio, sole basso da sinistra
  scene.add(new THREE.HemisphereLight(0xffe2b8, 0x4a3c30, 1.1))
  const sun = new THREE.DirectionalLight(0xffc27a, 2.4)
  sun.position.set(-1.2, 1.4, 0.6)
  scene.add(sun)
  const rim = new THREE.DirectionalLight(0x9ab8ff, 0.5)
  rim.position.set(1, 0.3, -1)
  scene.add(rim)
  const fill = new THREE.DirectionalLight(0xffe8d0, 0.9)
  fill.position.set(0.4, 0.6, 1)
  scene.add(fill)
  const muzzleLight = new THREE.PointLight(0xffb060, 0, 3, 2)
  scene.add(muzzleLight)

  const rig = new THREE.Group()
  scene.add(rig)
  const slots = {} as Record<WeaponId, Slot>
  for (const id of WEAPON_IDS) {
    slots[id] = makeSlot(id)
    rig.add(slots[id].model.root)
  }

  const flashMat = new THREE.SpriteMaterial({ map: flashTex(), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true })
  const flash = new THREE.Sprite(flashMat)
  flash.visible = false
  flash.renderOrder = 10

  // braccio sinistro per il lancio della boce di sgnape
  const toss = new THREE.Group()
  scene.add(toss)
  arm(toss, new THREE.Vector3(), new THREE.Vector3(-0.2, -0.6, 0.75), [0, 0, 0])
  const bottle = sgnapeBottle()
  bottle.position.set(0.0, 0.0, -0.02)
  bottle.rotation.set(-0.3, 0, 0.2)
  bottle.scale.setScalar(0.8)
  toss.add(bottle)
  toss.visible = false

  let cur: Slot | null = null
  let pending: WeaponId | null = null
  let switchT = -1 // <SWITCH_DOWN: abbassa; poi alza
  let reloadT = -1
  let reloadDur = 1
  let fireT = 9
  let spinA = 0
  let rec = 0
  let swingT = -1
  let boltT = -1
  let tossT = -1
  let loaded = true
  let t = 0
  let bob = 0
  let aimB = 0
  let sprintB = 0
  let crouchB = 0
  let airB = 0
  let speedB = 0
  let swayX = 0
  let swayY = 0
  let land = 0
  let wasGrounded = true
  let pend = 0
  let pendV = 0
  let prevX = 0
  let prevV = 0

  const A = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 }
  const hand = new THREE.Vector3()
  const tmp = new THREE.Vector3()

  function show(id: WeaponId) {
    if (cur) cur.model.root.visible = false
    cur = slots[id]
    cur.model.root.visible = true
    cur.model.muzzle.add(flash)
    flash.scale.setScalar(cur.hold.flash)
    reloadT = -1
    swingT = -1
    boltT = -1
  }

  /** Riporta le parti mobili a riposo, prima di animarle. */
  function rest(s: Slot) {
    for (const r of s.rest) {
      r.o.position.copy(r.p)
      r.o.rotation.copy(r.r)
      r.o.visible = r.v
    }
  }

  /** Ricariche: muovono le parti e accumulano in A; restituiscono il peso della mano sinistra su `hand`. */
  function animateReload(s: Slot, p: number): number {
    const P = s.model.parts
    switch (s.id) {
      case "mandi": {
        const env = ramp(p, 0, 0.15) - ramp(p, 0.85, 1)
        A.rx += 0.3 * env
        A.rz += 0.45 * env
        A.px -= 0.02 * env
        A.py += 0.02 * env
        const out = p < 0.38 ? ramp(p, 0.08, 0.28) : 1 - ramp(p, 0.45, 0.7)
        P.mag!.position.y -= 0.16 * out
        P.mag!.visible = !(p > 0.3 && p < 0.45)
        P.slide!.position.z += 0.035 * bump(p, 0.78, 0.9)
        const yy = -0.1 - 0.16 * out
        hand.set(-0.005, 0.961 * yy, -0.276 * yy)
        return ramp(p, 0.28, 0.42) - ramp(p, 0.7, 0.84)
      }
      case "cramar": {
        const env = ramp(p, 0, 0.12) - ramp(p, 0.88, 1)
        A.rz -= 0.45 * env
        A.rx += 0.12 * env
        A.px -= 0.015 * env
        A.py += 0.015 * env
        const out = p < 0.4 ? ramp(p, 0.1, 0.3) : 1 - ramp(p, 0.5, 0.72)
        P.mag!.position.y -= 0.18 * out
        P.mag!.position.x -= 0.06 * out
        P.mag!.rotation.z = 0.6 * out
        P.mag!.visible = !(p > 0.32 && p < 0.48)
        P.bolt!.position.z += 0.07 * bump(p, 0.8, 0.95)
        hand.set(-0.06 * out - 0.04, -0.06 - 0.18 * out, -0.13)
        return ramp(p, 0.06, 0.16) - ramp(p, 0.72, 0.84)
      }
      case "doplete": {
        const env = ramp(p, 0, 0.12) - ramp(p, 0.9, 1)
        A.rx += 0.2 * env
        A.rz += 0.25 * env
        A.py += 0.02 * env
        const open = ramp(p, 0.06, 0.18) - ramp(p, 0.8, 0.9)
        const b = P.barrels!
        b.rotation.x = -0.65 * open
        let ins = 0
        P.shells!.forEach((sh, i) => {
          const q = p - i * 0.05
          if (q < 0.36) {
            const e = ramp(q, 0.18, 0.34)
            sh.position.z += 0.25 * e
            sh.position.y += 0.14 * e - 0.25 * e * e
            sh.rotation.x = e * 7
            sh.visible = q > 0.1 && e < 0.98
          } else if (q < 0.8) {
            ins = ramp(q, 0.45, 0.72)
            sh.position.y += 0.08 * (1 - ins)
            sh.position.z += 0.14 * (1 - ins)
            sh.visible = q > 0.42
          }
        })
        hand.set(0, 0.07 + 0.08 * (1 - ins), -0.06 + 0.14 * (1 - ins))
        // la mano sinistra segue l'astina quando le canne si aprono
        tmp.copy(s.leftBase).sub(b.position).applyAxisAngle(X, b.rotation.x).add(b.position)
        s.leftArm.position.copy(tmp)
        return ramp(p, 0.34, 0.45) - ramp(p, 0.74, 0.84)
      }
      case "cjampanili": {
        const env = ramp(p, 0, 0.1) - ramp(p, 0.9, 1)
        A.rz += 0.3 * env
        A.rx += 0.08 * env
        A.py += 0.02 * env
        A.px -= 0.02 * env
        P.bolt!.rotation.z = 1.1 * (ramp(p, 0.05, 0.12) - ramp(p, 0.9, 0.96))
        P.bolt!.position.z += 0.07 * (ramp(p, 0.12, 0.2) - ramp(p, 0.82, 0.9))
        if (p > 0.3 && p < 0.75) A.py -= 0.006 * Math.abs(Math.sin(((p - 0.3) / 0.45) * 5 * Math.PI))
        hand.set(0.005, 0.1, 0.02)
        return ramp(p, 0.22, 0.3) - ramp(p, 0.76, 0.84)
      }
      case "lanciafrico": {
        const env = ramp(p, 0, 0.12) - ramp(p, 0.88, 1)
        A.rx += 0.45 * env
        A.py -= 0.03 * env
        A.pz += 0.04 * env
        A.rz -= 0.1 * env
        const f = P.frico!
        const inn = ramp(p, 0.4, 0.72)
        f.visible = loaded || p > 0.15
        f.position.x += -0.06 * (1 - inn)
        f.position.y += 0.12 * (1 - inn)
        f.position.z += -0.16 * (1 - inn)
        f.rotation.x = 0.8 * (1 - inn)
        hand.copy(f.position).add(tmp.set(-0.03, -0.02, 0.03))
        return ramp(p, 0.1, 0.25) - ramp(p, 0.75, 0.88)
      }
      case "mulin": {
        // si abbassa la cassa e si cambia il nastro
        const env = ramp(p, 0, 0.12) - ramp(p, 0.86, 1)
        A.rz -= 0.25 * env
        A.rx += 0.12 * env
        A.py -= 0.03 * env
        const m = P.mag!
        const out = ramp(p, 0.15, 0.35) - ramp(p, 0.6, 0.8)
        m.position.y -= 0.12 * out
        m.position.x += 0.05 * out
        hand.copy(m.position).add(tmp.set(0, 0.02, 0.02))
        return ramp(p, 0.1, 0.2) - ramp(p, 0.8, 0.9)
      }
      case "miedi": {
        // si riempie il serbatoio e si pompa
        const env = ramp(p, 0, 0.12) - ramp(p, 0.88, 1)
        A.rx += 0.3 * env
        A.rz += 0.15 * env
        const pump = P.pouch!
        pump.position.y += 0.03 * Math.abs(Math.sin(ramp(p, 0.3, 0.85) * 4 * Math.PI))
        hand.copy(pump.position).add(tmp.set(0, 0.02, 0.07))
        return ramp(p, 0.2, 0.3) - ramp(p, 0.82, 0.9)
      }
      default:
        return 0
    }
  }

  function update(dt: number, f: ViewmodelFrame) {
    dt = Math.min(dt, 0.1)
    t += dt
    if (camera.aspect !== worldCamera.aspect) {
      camera.aspect = worldCamera.aspect
      camera.updateProjectionMatrix()
    }

    // cambio arma: giù, scambio, su
    let sw = 0
    if (switchT >= 0) {
      switchT += dt
      if (pending && switchT >= SWITCH_DOWN) {
        show(pending)
        pending = null
      }
      sw = switchT < SWITCH_DOWN ? ramp(switchT, 0, SWITCH_DOWN) : 1 - ramp(switchT, SWITCH_DOWN, SWITCH_DOWN + SWITCH_UP)
      if (switchT > SWITCH_DOWN + SWITCH_UP) switchT = -1
    }
    if (!cur) return
    const s = cur
    const h = s.hold
    rest(s)
    s.leftArm.position.copy(s.leftBase)
    A.px = A.py = A.pz = A.rx = A.ry = A.rz = 0

    const reloading = reloadT >= 0
    aimB = damp(aimB, f.aiming && !reloading && sw === 0 ? 1 : 0, 16, dt)
    sprintB = damp(sprintB, f.sprinting && !f.aiming && !reloading && swingT < 0 ? 1 : 0, 8, dt)
    crouchB = damp(crouchB, f.crouch ? 1 : 0, 10, dt)
    airB = damp(airB, f.grounded ? 0 : 1, 8, dt)
    if (f.grounded && !wasGrounded) land = 1
    wasGrounded = f.grounded
    land = damp(land, 0, 7, dt)
    speedB = damp(speedB, f.grounded ? clamp(f.speed / 6, 0, 1.4) : 0, 10, dt)
    bob += dt * f.speed * (f.grounded ? 3.9 : 0.5)

    // passo e respiro
    const still = 1 - aimB * 0.85
    const bAmp = speedB * (1 + sprintB * 0.8) * still
    A.px += Math.sin(bob) * 0.012 * bAmp
    A.py += -Math.abs(Math.cos(bob)) * 0.014 * bAmp + Math.sin(t * 1.7) * 0.003 * (1 - aimB * 0.7)
    A.rz += Math.sin(bob) * 0.02 * bAmp
    A.rx += Math.sin(t * 1.7 + 0.5) * 0.006 * (1 - aimB * 0.7)

    // inerzia dello sguardo (lookDx/lookDy come il mouse: + a destra, + in basso): l'arma resta indietro
    swayX = damp(swayX, clamp(-f.lookDx * 1.2, -0.05, 0.05), 9, dt)
    swayY = damp(swayY, clamp(f.lookDy * 1.2, -0.05, 0.05), 9, dt)
    const sk = 1 - aimB * 0.6
    A.px += swayX * sk
    A.py += swayY * sk
    A.ry -= swayX * 1.4 * sk
    A.rx += swayY * 1.2 * sk

    // salto, atterraggio, corsa, accovacciato
    A.py += airB * 0.012 - land * 0.035
    A.rx += airB * 0.06 - land * 0.08
    A.px -= sprintB * 0.04
    A.py -= sprintB * 0.04
    A.pz += sprintB * 0.03
    A.rx -= sprintB * 0.32
    A.ry += sprintB * 0.65
    A.rz += sprintB * 0.25
    A.py -= crouchB * 0.012
    A.rz += crouchB * 0.06

    // sgnape: tutto ondeggia, con calma
    if (f.sgnape) {
      A.px += Math.sin(t * 1.3) * 0.016
      A.py += Math.sin(t * 1.9) * 0.009
      A.rz += Math.sin(t * 1.1) * 0.09
      A.ry += Math.sin(t * 0.8) * 0.05
    }

    // rinculo
    rec = damp(rec, 0, 13, dt)
    fireT += dt
    A.pz += rec * h.kickZ
    A.rx += rec * h.kickR
    A.py += rec * h.kickZ * 0.3
    if (s.id === "mandi") s.model.parts.slide!.position.z += 0.03 * Math.max(0, 1 - fireT / 0.07)
    if (s.id === "cramar") s.model.parts.bolt!.position.z += 0.04 * Math.max(0, 1 - fireT / 0.05)
    if (s.id === "lanciafrico" && !reloading) s.model.parts.frico!.visible = loaded
    // la prossima gallina torna in bocca al cannone un attimo dopo il colpo
    if (s.id === "gjalinis") s.model.parts.frico!.visible = fireT > 0.45
    // le canne del Mulin girano con la rotazione; il miedi pompa mentre spruzza
    if (s.id === "mulin") {
      spinA += f.spin * dt * 38
      s.model.parts.spinner!.rotation.z = spinA
      A.px += f.spin * Math.sin(t * 70) * 0.0015
    }
    if (s.id === "miedi" && fireT < 0.12) s.model.parts.pouch!.position.y += 0.012 * Math.sin(fireT * 50)

    // fendente col mescul: carica a destra, spazza a sinistra
    if (swingT >= 0) {
      swingT += dt
      const p = swingT / SWING
      const k = p < 0.2 ? -0.5 * ramp(p, 0, 0.2) : p < 0.5 ? -0.5 + 1.8 * ramp(p, 0.2, 0.5) : 1.3 * (1 - ramp(p, 0.5, 1))
      A.ry += k * 0.9
      A.rz -= k * 0.5
      A.rx -= k * 0.2
      A.px -= k * 0.12
      A.pz -= bump(p, 0.2, 0.65) * 0.12
      if (p >= 1) swingT = -1
    }

    // otturatore del cjampanili dopo il colpo
    if (boltT >= 0 && !reloading) {
      boltT += dt
      const q = (boltT - 0.2) / BOLT_CYCLE
      if (q > 0) {
        const b = s.model.parts.bolt!
        b.rotation.z = 1.1 * (ramp(q, 0, 0.15) - ramp(q, 0.7, 0.85))
        b.position.z += 0.07 * (ramp(q, 0.15, 0.35) - ramp(q, 0.5, 0.7))
        A.rz += 0.08 * bump(q, 0, 1)
      }
      if (q >= 1) boltT = -1
    }

    // ricarica
    let handW = 0
    if (reloading) {
      reloadT += dt
      const p = clamp(reloadT / reloadDur, 0, 1)
      handW = clamp(animateReload(s, p), 0, 1)
      if (p >= 1) {
        reloadT = -1
        if (s.id === "lanciafrico") loaded = true
      }
    }
    if (handW > 0.001) s.leftArm.position.lerp(hand, handW)
    s.leftArm.visible = s.model.left !== null || handW > 0.01

    // lancio della bomba con la sinistra
    if (tossT >= 0) {
      tossT += dt
      const p = tossT / TOSS
      toss.visible = p < 1
      bottle.visible = p < 0.52
      const up = ramp(p, 0, 0.35)
      const fw = ramp(p, 0.35, 0.52)
      const back = ramp(p, 0.55, 1)
      toss.position.set(-0.26 + 0.08 * up + 0.1 * fw - 0.05 * back, -0.36 + 0.24 * up + 0.12 * fw - 0.4 * back, -0.34 - 0.06 * up - 0.3 * fw + 0.3 * back)
      toss.rotation.set(0.3 * up - 0.9 * fw, 0.2, 0.3 * up)
      bottle.rotation.z = 0.2 + p * 4
      A.py -= 0.04 * bump(p, 0, 1)
      A.rz -= 0.12 * bump(p, 0, 1)
      if (p >= 1) tossT = -1
    }

    // pendolo del sacchetto del cramâr
    if (s.model.parts.pouch) {
      const x = rig.position.x
      const v = (x - prevX) / Math.max(dt, 1e-3)
      const acc = (v - prevV) / Math.max(dt, 1e-3)
      prevX = x
      prevV = v
      pendV += (-60 * pend - 4 * pendV + clamp(acc, -30, 30) * 0.6 - A.rz * 30) * dt
      pend = clamp(pend + pendV * dt, -0.9, 0.9)
      s.model.parts.pouch.rotation.z = pend
      s.model.parts.pouch.rotation.x = Math.sin(t * 2.1) * 0.05 + swayY * 3
    }

    // composizione finale: anca ↔ mira, più tutte le aggiunte
    const [hx, hy, hz] = h.hip
    // Mirando l'arma sale al centro ma resta un filo sotto la linea di mira: la cima del
    // mirino a ~3.5 cm sotto l'occhio, così il bersaglio al centro resta scoperto.
    const aim = h.aim ?? [0, -s.model.sightH - AIM_DROP, hz - 0.04]
    rig.position.set(
      hx + (aim[0] - hx) * aimB + A.px,
      hy + (aim[1] - hy) * aimB + A.py - sw * 0.28,
      hz + (aim[2] - hz) * aimB + A.pz
    )
    const ka = 1 - aimB
    rig.rotation.set(h.rot[0] * ka + A.rx - sw * 0.9, h.rot[1] * ka + A.ry, h.rot[2] * ka + A.rz)

    // lampo
    flash.visible = fireT < 0.05 && h.flash > 0
    if (flash.visible) flashMat.rotation = (t * 37) % 6.28
    muzzleLight.intensity = Math.max(0, 1 - fireT / 0.07) * 4 * (h.flash > 0 ? 1 : 0)
    if (muzzleLight.intensity > 0) {
      scene.updateMatrixWorld()
      s.model.muzzle.getWorldPosition(muzzleLight.position)
    }
  }

  return {
    scene,
    camera,
    setWeapon(id) {
      if (cur?.id === id && !pending) return
      if (!cur) {
        show(id)
        switchT = SWITCH_DOWN
        return
      }
      pending = id
      reloadT = -1
      // se si stava rialzando, si riabbassa dalla stessa altezza
      if (switchT < 0) switchT = 0
      else if (switchT >= SWITCH_DOWN) switchT = SWITCH_DOWN * (1 - ramp(switchT, SWITCH_DOWN, SWITCH_DOWN + SWITCH_UP))
    },
    fire() {
      if (!cur) return
      if (cur.id === "mescul") {
        swingT = 0
        return
      }
      rec = 1
      fireT = 0
      if (cur.id === "cjampanili") boltT = 0
      if (cur.id === "lanciafrico") loaded = false
    },
    reload(seconds) {
      if (!cur || cur.id === "mescul") return
      reloadT = 0
      reloadDur = Math.max(0.2, seconds)
      boltT = -1
    },
    throwBomb() {
      tossT = 0
    },
    update,
    setVisible(v) {
      rig.visible = v
      toss.visible = v && tossT >= 0
    },
    muzzleWorld(target) {
      if (!cur) return target.setFromMatrixPosition(worldCamera.matrixWorld)
      scene.updateMatrixWorld()
      cur.model.muzzle.getWorldPosition(target)
      // stesso punto sullo schermo con il FOV del mondo
      const k = Math.tan(THREE.MathUtils.degToRad(worldCamera.fov) / 2) / worldCamera.zoom / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
      target.x *= k
      target.y *= k
      return target.applyMatrix4(worldCamera.matrixWorld)
    }
  }
}
