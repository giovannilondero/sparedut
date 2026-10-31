/**
 * The other players: peasant benandanti and sorcerer malandanti, low-poly.
 * Each moving part is a geometry baked with vertex colours, shared per team:
 * an avatar costs ~14 draw calls and a single material of its own (for fading).
 */
import * as THREE from "three"
import type { Avatar, AvatarPose } from "./contracts.ts"
import type { Team } from "../shared/map.ts"
import { TEAM_INFO } from "../shared/folklore.ts"
import type { WeaponId } from "../shared/weapons.ts"
import { Baker, bakedMaterial, canvasTexture, clamp, damp, flashTex, rng } from "./models/kit.ts"
import { bakedWeapon } from "./models/weapons.ts"

const HIP = 0.92
const HIP_CROUCH = 0.56
const THIGH = 0.44
const SHIN = 0.42
const SHOULDER_Y = 0.46
const AIM_Y = 0.4

type PartName = "pelvis" | "thigh" | "shin" | "torso" | "head" | "arm" | "hand"
type TeamParts = Record<PartName, THREE.BufferGeometry>

const SKIN = 0xe0a882
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const cyl = (rt: number, rb: number, h: number, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s)
const ball = (r: number, w = 7, h = 5) => new THREE.SphereGeometry(r, w, h)

/** A team's parts, built only once. */
function teamParts(team: Team): TeamParts {
  const ben = team === "benandanti"
  const col = new THREE.Color(TEAM_INFO[team].color)
  const main = ben ? col.clone().multiplyScalar(0.75) : col.clone().multiplyScalar(0.45)
  const trim = ben ? 0x3f6b2e : 0x2a0d14
  const trousers = ben ? 0x6b5236 : 0x1e1a22
  const shirt = ben ? 0xf1ece0 : 0x3a1520
  const r = rng(ben ? 3 : 9)

  const pelvis = new Baker().add(box(0.34, 0.16, 0.2), trousers, 0, 0.02, 0).add(box(0.36, 0.05, 0.22), ben ? 0x4a3420 : 0x5a1a26, 0, 0.1, 0)

  // thigh and shin: pivot at the top, the geometry hangs down along -y
  const thigh = new Baker().add(cyl(0.085, 0.07, THIGH), trousers, 0, -THIGH / 2, 0)
  if (!ben) thigh.add(cyl(0.11, 0.1, 0.2, 7), main, 0, -0.08, 0)
  const shin = new Baker()
    .add(cyl(0.068, 0.055, SHIN), ben ? 0xe6dfcf : trousers, 0, -SHIN / 2, 0)
    .add(box(0.11, 0.07, 0.24), ben ? 0x4a3020 : 0x2a1a12, 0, -SHIN - 0.02, -0.05)
  if (ben) shin.add(cyl(0.075, 0.075, 0.04), trousers, 0, -0.04, 0)

  // torso: pivot in the pelvis
  const torso = new Baker()
  if (ben) {
    torso
      .add(cyl(0.2, 0.17, 0.52, 8), shirt, 0, 0.27, 0)
      .add(box(0.36, 0.4, 0.22), main, 0, 0.24, 0.02) // green waistcoat
      .add(box(0.08, 0.38, 0.02), shirt, 0, 0.26, -0.105) // waistcoat opening over the shirt
      .add(box(0.4, 0.06, 0.24), 0x4a3420, 0, 0.04, 0) // belt
      .add(box(0.05, 0.05, 0.02), 0xc9a043, 0, 0.04, -0.125)
      .add(box(0.44, 0.48, 0.03), col, 0, 0.2, 0.15, -0.1) // short cape
      .add(cyl(0.16, 0.2, 0.06, 8), col, 0, 0.5, 0.02)
    // bundle of fennel stalks on the back, with yellow umbels
    for (let i = 0; i < 7; i++) {
      const x = (r() - 0.5) * 0.14
      const z = 0.2 + (r() - 0.5) * 0.04
      const tilt = (r() - 0.5) * 0.2
      torso.add(cyl(0.012, 0.012, 0.95, 5), 0x7fae4a, x, 0.32, z, 0.05, 0, tilt)
      torso.add(new THREE.ConeGeometry(0.06, 0.05, 6), 0xe8d24a, x - tilt * 0.47, 0.8, z + 0.02, Math.PI)
    }
    torso.add(cyl(0.06, 0.06, 0.04, 8), 0xb59a6a, 0, 0.3, 0.2)
    torso.add(box(0.03, 0.62, 0.02), 0x6b4a2a, -0.06, 0.28, -0.11, 0, 0, 0.55) // strap
  } else {
    torso
      .add(cyl(0.2, 0.19, 0.52, 8), shirt, 0, 0.27, 0)
      .add(cyl(0.22, 0.3, 0.6, 8), main, 0, 0.22, 0.015) // cloak
      .add(cyl(0.3, 0.33, 0.28, 8), main.clone().multiplyScalar(0.8), 0, -0.18, 0.02) // cloak skirt
      .add(box(0.06, 0.5, 0.02), col, 0, 0.24, -0.215) // crimson hem
      .add(cyl(0.21, 0.23, 0.05, 8), col, 0, 0.05, 0)
      .add(ball(0.03), 0xc9a043, 0, 0.5, -0.19)
    // broomcorn broom on the back
    torso.add(cyl(0.016, 0.016, 1.15, 5), 0x7a5a32, 0, 0.3, 0.25, 0.08, 0, 0.5)
    torso.add(new THREE.ConeGeometry(0.11, 0.38, 7), 0xd8b45a, -0.27, -0.14, 0.27, Math.PI + 0.08, 0, 0.5)
    torso.add(cyl(0.035, 0.035, 0.04, 7), 0x8a2a2a, -0.18, 0.02, 0.265, 0.08, 0, 0.5)
  }

  // head: pivot at the neck
  const head = new Baker()
    .add(cyl(0.06, 0.07, 0.08, 6), SKIN, 0, 0.02, 0)
    .add(box(0.24, 0.27, 0.25), SKIN, 0, 0.14, 0)
    .add(box(0.04, 0.06, 0.05), 0xc98d6a, 0, 0.12, -0.14) // nose
    .add(box(0.04, 0.03, 0.01), 0x1a1410, -0.06, 0.17, -0.126)
    .add(box(0.04, 0.03, 0.01), 0x1a1410, 0.06, 0.17, -0.126)
  if (ben) {
    head
      .add(box(0.2, 0.04, 0.01), 0x6b4a2a, 0, 0.06, -0.126) // moustache
      .add(cyl(0.25, 0.25, 0.03, 10), 0x5a4030, 0, 0.29, 0) // felt hat brim
      .add(cyl(0.14, 0.16, 0.14, 8), 0x5a4030, 0, 0.36, 0)
      .add(cyl(0.162, 0.162, 0.03, 8), col.clone().multiplyScalar(0.6), 0, 0.31, 0)
      .add(box(0.02, 0.1, 0.02), 0xe8d24a, 0.12, 0.38, 0.04, 0, 0, -0.4) // fennel sprig
  } else {
    head
      .add(cyl(0.18, 0.2, 0.32, 8), main, 0, 0.15, 0.04) // hood
      .add(box(0.2, 0.22, 0.02), SKIN, 0, 0.13, -0.13)
      .add(box(0.05, 0.03, 0.01), 0xffd060, -0.06, 0.17, -0.142) // glowing eyes
      .add(box(0.05, 0.03, 0.01), 0xffd060, 0.06, 0.17, -0.142)
      .add(cyl(0.3, 0.3, 0.025, 10), 0x1a0c10, 0, 0.32, 0)
      .add(new THREE.ConeGeometry(0.16, 0.36, 8), 0x1a0c10, 0, 0.5, 0.02, -0.12)
      .add(new THREE.ConeGeometry(0.07, 0.18, 6), 0x1a0c10, 0, 0.71, 0.1, -0.7)
      .add(cyl(0.165, 0.165, 0.035, 8), col, 0, 0.35, 0)
  }

  // unit-length arm along -z (scaled to the shoulder→hand distance)
  const arm = new Baker()
    .add(cyl(0.07, 0.055, 1, 6), ben ? shirt : main, 0, 0, -0.5, Math.PI / 2)
    .add(cyl(0.075, 0.075, 0.12, 6), ben ? main : col, 0, 0, -0.06, Math.PI / 2)
  const hand = new Baker().add(box(0.08, 0.09, 0.1), SKIN, 0, 0, 0)

  return {
    pelvis: pelvis.build(),
    thigh: thigh.build(),
    shin: shin.build(),
    torso: torso.build(),
    head: head.build(),
    arm: arm.build(),
    hand: hand.build()
  }
}

const parts = new Map<Team, TeamParts>()
const partsOf = (team: Team) => {
  let p = parts.get(team)
  if (!p) parts.set(team, (p = teamParts(team)))
  return p
}

// --- pieces shared across all teams -----------------------------------------------------
let shared: { cheeks: THREE.BufferGeometry; frico: THREE.BufferGeometry; aura: THREE.BufferGeometry; auraMat: THREE.MeshBasicMaterial; flashTex: THREE.Texture } | null = null

function sharedParts() {
  if (shared) return shared
  const cheeks = new Baker()
    .add(box(0.05, 0.035, 0.01), 0xff6a7a, -0.085, 0.1, -0.128)
    .add(box(0.05, 0.035, 0.01), 0xff6a7a, 0.085, 0.1, -0.128)
    .add(box(0.04, 0.03, 0.01), 0xd8505a, 0, 0.115, -0.168)
    .build()
  // the stolen frico wheel, strapped to the back with two straps
  const fb = new Baker()
    .add(cyl(0.32, 0.32, 0.08, 14), 0xf0b850, 0, 0, 0, Math.PI / 2)
    .add(new THREE.TorusGeometry(0.31, 0.03, 5, 14), 0xc98a2e, 0, 0, 0)
  const r = rng(42)
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2
    const d = r() * 0.26
    fb.add(cyl(0.02 + r() * 0.03, 0.02, 0.01, 6), 0xa86a20, Math.cos(a) * d, Math.sin(a) * d, 0.042, Math.PI / 2)
  }
  fb.add(box(0.05, 0.05, 0.7), 0x5a3a20, 0.16, 0, -0.25, 0.9).add(box(0.05, 0.05, 0.7), 0x5a3a20, -0.16, 0, -0.25, 0.9)
  const tex = canvasTexture("aura", 64, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h)
    grd.addColorStop(0, "rgba(255,240,180,0)")
    grd.addColorStop(0.5, "rgba(255,230,150,0.5)")
    grd.addColorStop(1, "rgba(255,240,180,0)")
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
    g.fillStyle = "rgba(255,255,230,0.6)"
    for (let i = 0; i < 18; i++) g.fillRect(((i * 37) % w) | 0, ((i * 53) % h) | 0, 2, 18)
  })
  shared = {
    cheeks,
    frico: fb.build(),
    aura: new THREE.SphereGeometry(1, 14, 10),
    auraMat: new THREE.MeshBasicMaterial({
      map: tex,
      color: 0xffd98a,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    flashTex: flashTex()
  }
  return shared
}

/** How each weapon is held in third person ("aim" space, in front of the chest). */
const GRIP: Record<WeaponId, { p: [number, number, number]; r: [number, number, number] }> = {
  mescul: { p: [0.16, -0.12, -0.28], r: [0.9, 0.15, 0.2] },
  mandi: { p: [0.14, -0.02, -0.42], r: [0, 0, 0] },
  cramar: { p: [0.13, -0.1, -0.3], r: [0, 0, 0] },
  doplete: { p: [0.13, -0.1, -0.3], r: [0, 0, 0] },
  cjampanili: { p: [0.13, -0.1, -0.28], r: [0, 0, 0] },
  mulin: { p: [0.15, -0.16, -0.26], r: [0, 0, 0] },
  miedi: { p: [0.14, -0.12, -0.28], r: [0, 0, 0] },
  gjalinis: { p: [0.15, -0.13, -0.2], r: [0, 0, 0] },
  lanciafrico: { p: [0.16, -0.13, -0.24], r: [0, 0, 0] },
  mitraie: { p: [0.14, -0.1, -0.3], r: [0, 0, 0] }
}

function nameLabel(name: string, color: string) {
  const c = document.createElement("canvas")
  c.width = 256
  c.height = 64
  const g = c.getContext("2d")!
  g.font = "bold 34px Georgia, serif"
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.lineWidth = 7
  g.strokeStyle = "rgba(10,8,6,0.85)"
  g.strokeText(name, 128, 34, 248)
  g.fillStyle = color
  g.fillText(name, 128, 34, 248)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const tmpV = new THREE.Vector3()
const tmpW = new THREE.Vector3()
const Z_NEG = new THREE.Vector3(0, 0, -1)

export function createAvatar(team: Team, name: string): Avatar {
  const sp = sharedParts()
  const mat = bakedMaterial().clone()
  let p = partsOf(team)

  const object = new THREE.Group()
  const body = new THREE.Group() // pivot at the feet: falling and staggering
  object.add(body)
  const mesh = (geo: THREE.BufferGeometry, parent: THREE.Object3D, m: THREE.Material = mat) => {
    const x = new THREE.Mesh(geo, m)
    x.castShadow = true
    parent.add(x)
    return x
  }
  const pivot = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    parent.add(g)
    return g
  }

  const hips = pivot(body, 0, HIP, 0)
  const pelvis = mesh(p.pelvis, hips)
  const legs = [-1, 1].map(s => {
    const thighP = pivot(hips, s * 0.1, -0.02, 0)
    const thigh = mesh(p.thigh, thighP)
    const knee = pivot(thighP, 0, -THIGH, 0)
    const shin = mesh(p.shin, knee)
    return { thighP, knee, thigh, shin }
  })
  const spine = pivot(hips, 0, 0.06, 0)
  const torso = mesh(p.torso, spine)
  const neck = pivot(spine, 0, 0.56, 0)
  const head = mesh(p.head, neck)
  const cheeks = mesh(sp.cheeks, neck)
  cheeks.visible = false
  const frico = mesh(sp.frico, spine)
  frico.position.set(0, 0.3, 0.27)
  frico.visible = false
  const aim = pivot(spine, 0, AIM_Y, 0)
  const weapon = new THREE.Mesh(bakedWeapon("mandi").geometry, mat)
  weapon.castShadow = true
  aim.add(weapon)
  const muzzleFlash = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: sp.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffd090 })
  )
  muzzleFlash.visible = false
  weapon.add(muzzleFlash)
  const arms = [1, -1].map(s => {
    const a = mesh(p.arm, spine)
    a.position.set(s * 0.24, SHOULDER_Y, 0)
    const h = mesh(p.hand, spine)
    return { a, h, s }
  })
  const aura = new THREE.Mesh(sp.aura, sp.auraMat)
  aura.visible = false
  body.add(aura)

  const labelMat = new THREE.SpriteMaterial({ map: nameLabel(name, TEAM_INFO[team].color), depthWrite: false, transparent: true })
  const label = new THREE.Sprite(labelMat)
  label.scale.set(1.3, 0.325, 1)
  label.visible = false
  label.renderOrder = 5
  object.add(label)

  let curWeapon: WeaponId | null = null
  let leftGrip: THREE.Vector3 | null = null
  let labelOn = false
  let t = Math.random() * 10
  let phase = 0
  let amp = 0
  let crouch = 0
  let air = 0
  let rec = 0
  let flashT = 9
  let deadT = -1
  let fallX = 0
  let fallZ = 0
  let fading = false
  let pitch = 0
  let yaw = 0
  let fwdK = 1
  let sideK = 0
  let ready = 0

  function setWeapon(id: WeaponId) {
    curWeapon = id
    const b = bakedWeapon(id)
    weapon.geometry = b.geometry
    // at the turret the weapon is the turret's own, drawn by the world
    weapon.visible = id !== "mitraie"
    muzzleFlash.position.copy(b.muzzle)
    muzzleFlash.scale.setScalar(id === "lanciafrico" ? 0.6 : id === "doplete" ? 0.5 : 0.35)
    leftGrip = b.left
    const g = GRIP[id]
    weapon.position.set(...g.p)
    weapon.rotation.set(...g.r)
  }

  function setFade(o: number) {
    const tr = o < 0.999
    if (tr !== fading) {
      fading = tr
      mat.transparent = tr
      mat.depthWrite = !tr
      mat.needsUpdate = true
    }
    mat.opacity = o
  }

  /** Points an arm from the shoulder to the point `to` (torso space). */
  function reach(a: THREE.Mesh, h: THREE.Mesh, to: THREE.Vector3) {
    tmpW.copy(to).sub(a.position)
    const d = tmpW.length()
    a.quaternion.setFromUnitVectors(Z_NEG, tmpW.divideScalar(d))
    a.scale.set(1, 1, Math.max(0.2, d))
    h.position.copy(to)
    h.quaternion.copy(a.quaternion)
  }

  return {
    object,
    update(dt, pose: AvatarPose) {
      dt = Math.min(dt, 0.1)
      t += dt
      if (pose.weapon !== curWeapon) setWeapon(pose.weapon)
      object.position.set(pose.x, pose.y, pose.z)

      // death: topples over, then sinks and fades
      if (!pose.alive) {
        if (deadT < 0) {
          deadT = 0
          const a = Math.random() * Math.PI * 2
          fallX = Math.cos(a)
          fallZ = Math.sin(a) * 0.6
        }
        deadT += dt
        const f = 1 - Math.pow(1 - clamp(deadT / 0.55, 0, 1), 3)
        body.rotation.set(fallX * f * 1.45, 0, fallZ * f * 1.45)
        const sink = clamp((deadT - 1.4) / 1.6, 0, 1)
        body.position.y = -sink * 0.9 + Math.abs(Math.sin(f * Math.PI)) * 0.1
        setFade(1 - sink)
        label.visible = false
        muzzleFlash.visible = false
        aura.visible = false
        legs.forEach((l, i) => {
          l.thighP.rotation.x = damp(l.thighP.rotation.x, 0.3 + i * 0.3, 6, dt)
          l.knee.rotation.x = damp(l.knee.rotation.x, -0.5, 6, dt)
        })
        return
      }
      if (deadT >= 0) {
        deadT = -1
        body.rotation.set(0, 0, 0)
        body.position.set(0, 0, 0)
        setFade(1)
      }

      // body turns towards the view, the shortest way round
      let dy = pose.yaw - yaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      yaw += dy * (1 - Math.exp(-14 * dt))
      object.rotation.y = yaw
      pitch = damp(pitch, clamp(pose.pitch, -1.3, 1.3), 18, dt)

      // walk from horizontal velocity, split into forward and sideways
      const speed = Math.hypot(pose.vx, pose.vz)
      const sy = Math.sin(yaw)
      const cy = Math.cos(yaw)
      const fwd = -pose.vx * sy - pose.vz * cy
      const side = pose.vx * cy - pose.vz * sy
      if (speed > 0.3) {
        fwdK = damp(fwdK, fwd / speed, 8, dt)
        sideK = damp(sideK, side / speed, 8, dt)
      }
      crouch = damp(crouch, pose.crouch ? 1 : 0, 12, dt)
      air = damp(air, pose.grounded ? 0 : 1, 10, dt)
      amp = damp(amp, pose.grounded ? clamp(speed / 6, 0, 1.2) : 0, 8, dt)
      phase += dt * speed * (Math.PI / (1.25 - crouch * 0.45))
      ready = damp(ready, pose.firing || speed < 5 ? 1 : 0, 6, dt)

      const bend = Math.acos(clamp((HIP_CROUCH - 0.06) / (THIGH + SHIN), -1, 1)) * crouch
      const hipY = HIP + (HIP_CROUCH - HIP) * crouch
      hips.position.y = hipY + Math.abs(Math.sin(phase)) * 0.05 * amp - air * 0.06
      legs.forEach((l, i) => {
        const ph = phase + i * Math.PI
        const sw = Math.sin(ph) * 0.75 * amp
        const lift = Math.max(0, -Math.cos(ph)) * 0.9 * amp
        l.thighP.rotation.x = bend + sw * fwdK + air * (0.55 - i * 0.35)
        l.thighP.rotation.z = sw * sideK * 0.4 + (i ? 1 : -1) * crouch * 0.12
        l.knee.rotation.x = -2 * bend - lift - air * (0.9 - i * 0.4)
      })
      const lean = crouch * 0.35 + amp * 0.08 * fwdK
      spine.rotation.x = -lean + pitch * 0.2
      spine.rotation.y = Math.sin(phase) * 0.08 * amp
      neck.rotation.x = pitch * 0.55 - spine.rotation.x * 0.5
      neck.rotation.y = -spine.rotation.y

      // weapon and arms follow the pitch; recoil on the flash
      rec = damp(rec, 0, 14, dt)
      flashT += dt
      const low = (1 - ready) * 0.45
      aim.rotation.x = pitch - spine.rotation.x - low + rec * 0.25
      aim.rotation.y = -spine.rotation.y
      aim.position.z = rec * 0.08
      muzzleFlash.visible = flashT < 0.06
      if (muzzleFlash.visible) muzzleFlash.material.rotation = t * 41

      aim.updateMatrix()
      tmpV.copy(weapon.position).applyMatrix4(aim.matrix)
      reach(arms[0].a, arms[0].h, tmpV)
      if (leftGrip) {
        tmpV.copy(leftGrip).applyEuler(weapon.rotation).add(weapon.position).applyMatrix4(aim.matrix)
      } else {
        const sw = Math.sin(phase) * 0.35 * amp
        tmpV.set(-0.27, 0.0 + crouch * 0.05, -sw * 0.5 * fwdK + 0.02)
      }
      reach(arms[1].a, arms[1].h, tmpV)

      // sgnape: staggers and blushes
      cheeks.visible = pose.sgnape
      body.rotation.z = pose.sgnape ? Math.sin(t * 2.3) * 0.07 : damp(body.rotation.z, 0, 6, dt)
      body.rotation.x = pose.sgnape ? Math.sin(t * 1.7) * 0.04 : damp(body.rotation.x, 0, 6, dt)

      frico.visible = pose.carrier
      aura.visible = pose.shield
      if (pose.shield) {
        const k = 1 + Math.sin(t * 6) * 0.03
        const h = 1.8 - crouch * 0.7
        aura.position.y = h / 2
        aura.scale.set(0.55 * k, h * 0.56 * k, 0.55 * k)
        aura.rotation.y = t * 0.7
        sp.auraMat.map!.offset.y = (performance.now() / 1000) * 0.35
        sp.auraMat.opacity = 0.4 + Math.sin(performance.now() / 160) * 0.12
      }

      label.visible = labelOn
      label.position.y = 2.15 - crouch * 0.6
    },
    flash() {
      rec = 1
      if (curWeapon !== "mescul") flashT = 0
    },
    setTeam(next) {
      if (next === team) return
      team = next
      p = partsOf(team)
      pelvis.geometry = p.pelvis
      torso.geometry = p.torso
      head.geometry = p.head
      for (const l of legs) {
        l.thigh.geometry = p.thigh
        l.shin.geometry = p.shin
      }
      for (const a of arms) {
        a.a.geometry = p.arm
        a.h.geometry = p.hand
      }
      labelMat.map?.dispose()
      labelMat.map = nameLabel(name, TEAM_INFO[team].color)
    },
    setLabelVisible(v) {
      labelOn = v
    },
    dispose() {
      object.removeFromParent()
      mat.dispose()
      labelMat.map?.dispose()
      labelMat.dispose()
      muzzleFlash.material.dispose()
    }
  }
}
