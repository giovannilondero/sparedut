/**
 * Anteprima di avatar, viewmodel ed effetti. A sinistra il mondo in terza persona,
 * a destra la prima persona con l'arma che cicla. Tasti: 1-6 arma, F spara,
 * R ricarica, G bomba, E esplosione, P pausa del ciclo automatico.
 */
import * as THREE from "three"
import { createAvatar } from "../avatars.ts"
import type { AvatarPose } from "../contracts.ts"
import { createFx } from "../fx.ts"
import { createViewmodel } from "../viewmodel.ts"
import type { PickupKind } from "../../shared/map.ts"
import { WEAPONS, WEAPON_IDS, type WeaponId } from "../../shared/weapons.ts"

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.autoClear = false
document.body.appendChild(renderer.domElement)
const info = document.getElementById("info")!

// un pezzo di plaçute al tramonto
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xe8b98a)
scene.fog = new THREE.Fog(0xe8b98a, 25, 70)
scene.add(new THREE.HemisphereLight(0xffe2b8, 0x5a4a3a, 1.2))
const sun = new THREE.DirectionalLight(0xffc27a, 2.6)
sun.position.set(-10, 12, 6)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 })
scene.add(sun)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0xb8a58a, roughness: 1 }))
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)
const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 0.6), new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.9 }))
wall.position.set(0, 2, -9)
wall.receiveShadow = wall.castShadow = true
scene.add(wall)

const tpCam = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
const fpCam = new THREE.PerspectiveCamera(80, 1, 0.05, 200)
fpCam.position.set(0, 1.62, 6)
scene.add(fpCam)

const fx = createFx(scene)
const vm = createViewmodel(fpCam)

// avatar: per squadra, uno per comportamento
type Act = "walk" | "run" | "crouch" | "death" | "jump" | "idle"
interface Actor {
  avatar: ReturnType<typeof createAvatar>
  act: Act
  ox: number
  oz: number
  weapon: WeaponId
  shield: boolean
  carrier: boolean
  sgnape: boolean
}
const acts: Act[] = ["walk", "run", "crouch", "death", "jump", "idle"]
const actors: Actor[] = []
for (const [ti, team] of (["benandanti", "malandanti"] as const).entries())
  acts.forEach((act, i) => {
    const avatar = createAvatar(team, team === "benandanti" ? `Toni ${act}` : `Strie ${act}`)
    avatar.setLabelVisible(true)
    scene.add(avatar.object)
    actors.push({
      avatar,
      act,
      ox: (i - 2.5) * 2.2,
      oz: ti ? -4 : 0,
      weapon: WEAPON_IDS[(i + ti * 3) % WEAPON_IDS.length],
      shield: act === "idle" && ti === 0,
      carrier: act === "walk" || (act === "idle" && ti === 1),
      sgnape: act === "idle" || act === "run"
    })
  })

function poseOf(a: Actor, t: number): AvatarPose {
  const base = { pitch: Math.sin(t * 0.7) * 0.5, crouch: false, grounded: true, alive: true, weapon: a.weapon, firing: false, shield: a.shield, carrier: a.carrier, sgnape: a.sgnape }
  const circle = (r: number, w: number) => {
    const ang = t * w
    // tangente del cerchio: direzione di marcia, quindi yaw
    const vx = -Math.sin(ang) * r * w
    const vz = Math.cos(ang) * r * w
    return { x: a.ox + Math.cos(ang) * r, z: a.oz + Math.sin(ang) * r, vx, vz, yaw: Math.atan2(-vx, -vz) }
  }
  switch (a.act) {
    case "walk":
      return { ...base, y: 0, ...circle(0.7, 3 / 0.7) }
    case "run":
      return { ...base, y: 0, ...circle(0.8, 6.5 / 0.8) }
    case "crouch":
      return { ...base, y: 0, crouch: true, ...circle(0.6, 2.2 / 0.6) }
    case "jump": {
      const ph = (t * 1.2) % 1
      return { ...base, x: a.ox, z: a.oz, y: Math.max(0, Math.sin(ph * Math.PI) * 1.1), vx: 0, vz: -2, yaw: 0, grounded: ph > 0.95 }
    }
    case "death":
      return { ...base, x: a.ox, z: a.oz, y: 0, vx: 0, vz: 0, yaw: t * 0.3, alive: t % 5 < 1.5 }
    default:
      return { ...base, x: a.ox, z: a.oz, y: 0, vx: 0, vz: 0, yaw: Math.sin(t * 0.5) * 1.2, firing: true }
  }
}

// ciclo automatico dell'arma in prima persona
let auto = true
const force = { aim: null as boolean | null, walk: null as boolean | null }
let wIndex = 0
let wTimer = 0
let fireAcc = 0
let lastLook = 0
vm.setWeapon(WEAPON_IDS[0])
const muzzle = new THREE.Vector3()
const target = new THREE.Vector3()

function shoot() {
  const id = WEAPON_IDS[wIndex]
  vm.fire()
  if (WEAPONS[id].mode === "melee") return
  vm.muzzleWorld(muzzle)
  const m: [number, number, number] = [muzzle.x, muzzle.y, muzzle.z]
  fx.muzzle(m)
  if (id === "lanciafrico") return
  for (let i = 0; i < WEAPONS[id].pellets; i++) {
    target.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2.2, -8.7)
    const end: [number, number, number] = [target.x, target.y, target.z]
    fx.tracer(m, end, id)
    fx.impact(end)
  }
}

document.addEventListener("keydown", e => {
  const n = Number(e.key)
  if (n >= 1 && n <= 6) {
    wIndex = n - 1
    vm.setWeapon(WEAPON_IDS[wIndex])
  }
  if (e.key === "f") shoot()
  if (e.key === "r") vm.reload(WEAPONS[WEAPON_IDS[wIndex]].reloadTicks / 60)
  if (e.key === "g") vm.throwBomb()
  if (e.key === "e") fx.explosion([0, 0.3, -3], Math.random() < 0.5 ? "frico" : "sgnape")
  if (e.key === "p") auto = !auto
})

// proiettili in volo e qualche effetto di contorno
const proj: ["frico" | "sgnape", number, number, number][] = []
const kinds: PickupKind[] = ["frico", "gubane", "sgnape", "munizions", "lanciafrico"]
let fxTimer = 0
let fxStep = 0

function resize() {
  renderer.setSize(innerWidth, innerHeight)
}
window.addEventListener("resize", resize)
resize()

const clock = new THREE.Clock()
let t = 0
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05)
  t += dt
  renderer.info.reset()

  for (const a of actors) {
    const p = poseOf(a, t)
    a.avatar.update(dt, p)
    if (a.act === "idle" && Math.random() < dt * 3) a.avatar.flash()
  }

  // ciclo dell'arma: alza, spara, ricarica, bomba, cambia
  if (auto) {
    wTimer += dt
    const id = WEAPON_IDS[wIndex]
    const w = WEAPONS[id]
    if (wTimer > 0.6 && wTimer < 2.2) {
      fireAcc += dt
      if (fireAcc > Math.max(w.cooldownTicks / 60, 0.12)) {
        fireAcc = 0
        shoot()
      }
    }
    if (wTimer > 2.3 && wTimer - dt <= 2.3 && w.reloadTicks > 0) vm.reload(w.reloadTicks / 60)
    if (wTimer > 2.3 + w.reloadTicks / 60 + 0.2 && wTimer - dt <= 2.3 + w.reloadTicks / 60 + 0.2) vm.throwBomb()
    if (wTimer > 3.4 + w.reloadTicks / 60) {
      wTimer = 0
      wIndex = (wIndex + 1) % WEAPON_IDS.length
      vm.setWeapon(WEAPON_IDS[wIndex])
    }
  }
  const look = Math.sin(t * 0.9) * 0.15
  fpCam.rotation.set(Math.sin(t * 0.6) * 0.05, look, 0, "YXZ")
  const lookDx = -(look - lastLook)
  lastLook = look
  const walking = force.walk ?? Math.sin(t * 0.25) > 0
  vm.update(dt, {
    speed: walking ? 5 : 0,
    grounded: true,
    aiming: force.aim ?? Math.sin(t * 0.37) > 0.7,
    sprinting: walking && Math.sin(t * 0.21) > 0.85,
    crouch: false,
    lookDx,
    lookDy: 0,
    sgnape: Math.sin(t * 0.13) > 0.8
  })

  // effetti di contorno nella vista in terza persona
  fxTimer += dt
  if (fxTimer > 1.1) {
    fxTimer = 0
    fxStep++
    const x = ((fxStep * 3.7) % 10) - 5
    if (fxStep % 3 === 0) fx.explosion([x, 0.3, 4], fxStep % 2 ? "frico" : "sgnape")
    if (fxStep % 3 === 1) fx.padBurst([x, 0.05, 4])
    if (fxStep % 3 === 2) fx.pickupBurst([x, 0.5, 4], kinds[fxStep % kinds.length])
    fx.hitPuff([-x, 1.5, -2], fxStep % 2 === 0)
  }
  proj.length = 0
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.5 + i / 3) % 1
    proj.push([i % 2 ? "sgnape" : "frico", -6 + ph * 12, 0.5 + Math.sin(ph * Math.PI) * 3, 2 + i])
  }
  fx.projectiles(proj)

  const ang = t * 0.08
  tpCam.position.set(Math.sin(ang) * 14, 5, 6 + Math.cos(ang) * 8)
  tpCam.lookAt(0, 1, -1)
  fx.update(dt, tpCam)

  // sinistra: terza persona; destra: prima persona + arma
  const W = innerWidth
  const H = innerHeight
  const split = Math.floor(W * 0.4)
  renderer.setScissorTest(true)
  renderer.setViewport(0, 0, split, H)
  renderer.setScissor(0, 0, split, H)
  tpCam.aspect = split / H
  tpCam.updateProjectionMatrix()
  renderer.clear()
  renderer.render(scene, tpCam)
  renderer.setViewport(split, 0, W - split, H)
  renderer.setScissor(split, 0, W - split, H)
  fpCam.aspect = (W - split) / H
  fpCam.updateProjectionMatrix()
  fpCam.updateMatrixWorld()
  renderer.clear()
  renderer.render(scene, fpCam)
  renderer.clearDepth()
  renderer.render(vm.scene, vm.camera)
  renderer.setScissorTest(false)

  info.textContent = `arma: ${WEAPONS[WEAPON_IDS[wIndex]].name}   [1-6 arma, F spara, R ricarica, G bomba, E esplosione, P ${auto ? "ferma" : "riprendi"} ciclo]\ndraw calls: ${renderer.info.render.calls}`
  requestAnimationFrame(frame)
}
renderer.info.autoReset = false
requestAnimationFrame(frame)
Object.assign(window, { __preview: { vm, fx, actors, force, setAuto: (v: boolean) => (auto = v), pick: (i: number) => vm.setWeapon(WEAPON_IDS[(wIndex = i)]), shoot } })
