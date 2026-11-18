// World preview: map with ?map=osoppo, look with ?look=ver, quality with ?q=alta, menu camera (or fixed with ?cam=x,y,z,lx,ly,lz), mode with ?mode=frico|culine|cjar|tampieste.
// Walking it on foot with ?walk (from the Benandanti's first spawn, or ?walk=x,z,yaw): click to look with the mouse, WASD, space, C to crouch, shift to sprint.
// A turret's gunner's view with ?gunner=<turret>&aim=<yaw from its facing>,<pitch> (radians, clamped to the arc) and ?shot=<seconds since a shot>.
import * as THREE from "three"
import { BUTTON, IDLE_INPUT } from "../../shared/input.ts"
import { trackLength, trackPoint, type MapId } from "../../shared/map.ts"
import { EYE_STAND, eyeHeight, stepBody, type Body } from "../../shared/movement.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../../shared/physics.ts"
import { firstPerson } from "../firstperson.ts"
import { MAP_IDS, MAPS } from "../../shared/maps/index.ts"
import type { WorldFrame } from "../contracts.ts"
import { createLook, lookFromUrl } from "../looks.ts"
import { createWorld } from "../world.ts"

const q = new URLSearchParams(location.search)
const canvas = document.getElementById("view") as HTMLCanvasElement
const info = document.getElementById("info")!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setPixelRatio(Math.min(devicePixelRatio, Number(q.get("pr") ?? 1.5)))

const look = createLook(lookFromUrl(), renderer)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 2500)
const t0 = performance.now()
const mapId = MAP_IDS.find((id) => id === q.get("map")) ?? ("glemone" satisfies MapId)
const map = MAPS[mapId]
const { flagBases: FLAG_BASES, pickups: PICKUPS } = map
const world = createWorld(scene, renderer, map)
const buildMs = performance.now() - t0
// ?q=bassa|media|alta: the quality setting, as the game applies it
const quality = (["bassa", "media", "alta"] as const).find((x) => x === q.get("q"))
if (quality) {
  world.setQuality(quality)
  look.setQuality(quality)
}

const resize = () => {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener("resize", resize)
resize()

const cam = q.get("cam")?.split(",").map(Number)
const mode = q.get("mode")
const gunnerAt = q.get("gunner") === null ? -1 : Number(q.get("gunner"))
const gunnerSpot = map.turrets[gunnerAt]
const gunnerAim = (q.get("aim") ?? "0,0").split(",").map(Number)
/** The gunner's own view, decided by the first-person presentation as in a match. */
const gunner = gunnerSpot
  ? firstPerson({
      chosen: "mandi",
      mount: { turret: gunnerAt, spot: gunnerSpot },
      alive: true,
      aim: 0,
      baseFov: 80,
      aspect: innerWidth / innerHeight,
      look: { yaw: gunnerSpot.yaw + (gunnerAim[0] ?? 0), pitch: gunnerAim[1] ?? 0 },
      sinceShot: q.get("shot") === null ? Infinity : Number(q.get("shot")),
      mag: 0,
      reserve: 0,
      reload: null
    })
  : null
const gunnerCamera = () => {
  if (!gunnerSpot || !gunner?.mitraie) return false
  // The seat turns with the aim, as in a match: the gunner sits behind the gun.
  const seat = gunner.mitraie.seat
  camera.fov = gunner.fov
  camera.updateProjectionMatrix()
  camera.position.set(seat[0], seat[1] + EYE_STAND, seat[2])
  camera.rotation.set(gunner.mitraie.pitch, gunner.mitraie.yaw, 0, "YXZ")
  return true
}
/** On foot: the body moves through the map's physics, a tick at a time, as in a match. */
const walk = q.get("walk") === null ? null : (() => {
  const [wx, wz, wyaw = 0] = (q.get("walk") ?? "").split(",").map(Number)
  const from = Number.isFinite(wx) && Number.isFinite(wz) ? { at: [wx, 0, wz], yaw: wyaw } : map.spawns.benandanti[0]
  const state = {
    physics: null as PhysicsWorld | null,
    body: { x: from.at[0], y: from.at[1] + 0.05, z: from.at[2], vx: 0, vy: 0, vz: 0, grounded: false, crouch: false } as Body,
    yaw: from.yaw,
    pitch: 0,
    keys: new Set<string>(),
    acc: 0
  }
  void initPhysics().then(() => (state.physics = createPhysicsWorld(map)))
  document.addEventListener("keydown", (e: KeyboardEvent) => state.keys.add(e.code))
  document.addEventListener("keyup", (e: KeyboardEvent) => state.keys.delete(e.code))
  canvas.addEventListener("click", () => void canvas.requestPointerLock())
  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return
    state.yaw -= e.movementX * 0.0025
    state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch - e.movementY * 0.0025))
  })
  return state
})()
const walkCamera = (dt: number) => {
  if (!walk) return false
  const { physics, keys } = walk
  if (physics) {
    const key = (code: string) => (keys.has(code) ? 1 : 0)
    const buttons = (keys.has("Space") ? BUTTON.jump : 0) | (keys.has("KeyC") || keys.has("ControlLeft") ? BUTTON.crouch : 0) | (keys.has("ShiftLeft") ? BUTTON.sprint : 0)
    const input = { ...IDLE_INPUT, mz: key("KeyW") - key("KeyS"), mx: key("KeyD") - key("KeyA"), yaw: walk.yaw, buttons }
    for (walk.acc += dt; walk.acc >= 1 / 60; walk.acc -= 1 / 60) walk.body = stepBody(walk.body, input, physics, 1).body
  }
  camera.position.set(walk.body.x, walk.body.y + eyeHeight(walk.body), walk.body.z)
  camera.rotation.set(walk.pitch, walk.yaw, 0, "YXZ")
  return true
}
/** The cjar going back and forth along the track, the storm closing in. */
/** `?panel=wall|off` holds the casot's panel on its wall or torn off; otherwise it shakes and comes away with the door. */
const panelAt = q.get("panel")
const extras = (t: number): Pick<WorldFrame, "cart" | "storm" | "turrets" | "doors" | "gates" | "panels"> => {
  const len = trackLength(map.track)
  const p = trackPoint(map.track, ((Math.sin(t * 0.05) + 1) / 2) * len)
  // the turrets turn and heat up, the doors break and come back
  const heat = (Math.sin(t * 0.4) + 1) / 2
  return {
    turrets: map.turrets.map((s, i) => {
      const pose = gunner?.mitraie?.turret === i ? gunner.mitraie : null
      if (pose) return { yaw: pose.yaw, pitch: pose.pitch, heat, jammed: heat > 0.95, manned: true, mine: true, recoil: pose.recoil }
      return { yaw: s.yaw + Math.sin(t * 0.7 + i) * 0.8, pitch: Math.sin(t * 0.5) * 0.15, heat, jammed: heat > 0.95, manned: true, mine: false, recoil: 0 }
    }),
    doors: map.doors.map(() => Math.max(0, Math.cos(t * 0.2))),
    // the gates close and open with the doors
    gates: (map.gates ?? []).map(() => Math.cos(t * 0.2) > 0),
    panels: (map.panels ?? []).map(() => (panelAt === "off" ? null : panelAt === "wall" ? 0 : Math.cos(t * 0.2) > 0 ? Math.max(0, Math.sin(t * 0.8)) : null)),
    cart: mode === "cjar" ? { at: p.at, yaw: p.yaw, contested: Math.floor(t / 5) % 3 === 2, pushers: 1 } : null,
    storm: mode === "tampieste" ? { x: map.hill.at[0], z: map.hill.at[2], radius: 10 + ((Math.cos(t * 0.1) + 1) / 2) * 80 } : null
  }
}
const tFixed = q.get("t") ? Number(q.get("t")) : null
let last = performance.now()
let frames = 0
let fpsT = last
let fps = 0
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  const t = tFixed ?? (now - t0) / 1000
  if (gunnerCamera() || walkCamera(dt)) camera.updateMatrixWorld()
  else if (cam && cam.length === 6) {
    camera.position.set(cam[0], cam[1], cam[2])
    camera.lookAt(cam[3], cam[4], cam[5])
  } else world.menuCamera(t, camera)
  camera.updateMatrixWorld()
  const frame: WorldFrame = {
    pickups: PICKUPS.map((_, i) => (i + Math.floor(t / 3)) % 4 !== 0),
    flags: mode === "frico" ? { benandanti: { pos: FLAG_BASES.benandanti, state: "base" }, malandanti: { pos: [0, 2.1, 60], state: "carried" } } : null,
    hill: mode === "culine" ? { owner: Math.floor(t / 4) % 3 === 0 ? null : "malandanti", contested: Math.floor(t / 4) % 3 === 2 } : null,
    ...extras(t),
    camera
  }
  world.update(dt, t, frame)
  look.render(scene, camera)
  frames++
  if (now - fpsT > 500) {
    fps = (frames * 1000) / (now - fpsT)
    frames = 0
    fpsT = now
    const r = renderer.info.render
    info.textContent = `fps ${fps.toFixed(0)}  draw ${r.calls}  tri ${(r.triangles / 1000).toFixed(0)}k  build ${buildMs.toFixed(0)} ms\ngeo ${renderer.info.memory.geometries}  tex ${renderer.info.memory.textures}${walk ? `\non foot ${walk.body.x.toFixed(1)} ${walk.body.y.toFixed(1)} ${walk.body.z.toFixed(1)}` : ""}`
  }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

// For tooling: snapshots a framing (downscaled jpeg) without waiting for the loop.
;(globalThis as Record<string, unknown>).__shot = (c: number[] | null, t = 5, w = 960) => {
  if (c) {
    camera.position.set(c[0], c[1], c[2])
    camera.lookAt(c[3], c[4], c[5])
  } else world.menuCamera(t, camera)
  camera.updateMatrixWorld()
  world.update(0.016, t, { pickups: PICKUPS.map(() => true), flags: mode === "frico" ? { benandanti: { pos: FLAG_BASES.benandanti, state: "base" }, malandanti: { pos: FLAG_BASES.malandanti, state: "base" } } : null, hill: mode === "culine" ? { owner: null, contested: false } : null, ...extras(t), camera })
  look.render(scene, camera)
  const out = document.createElement("canvas")
  out.width = w
  out.height = Math.round((w * canvas.height) / canvas.width)
  out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height)
  ;(globalThis as Record<string, unknown>).__img = out.toDataURL("image/jpeg", 0.72)
  return ((globalThis as Record<string, unknown>).__img as string).length
}
