// World preview: map with ?map=osoppo, menu camera (or fixed with ?cam=x,y,z,lx,ly,lz), mode with ?mode=frico|culine|cjar|tampieste.
import * as THREE from "three"
import { trackLength, trackPoint, type MapId } from "../../shared/map.ts"
import { MAP_IDS, MAPS } from "../../shared/maps/index.ts"
import type { WorldFrame } from "../contracts.ts"
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

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 2500)
const t0 = performance.now()
const mapId = MAP_IDS.find((id) => id === q.get("map")) ?? ("glemone" satisfies MapId)
const map = MAPS[mapId]
const { flagBases: FLAG_BASES, pickups: PICKUPS } = map
const world = createWorld(scene, renderer, map)
const buildMs = performance.now() - t0

const resize = () => {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener("resize", resize)
resize()

const cam = q.get("cam")?.split(",").map(Number)
const mode = q.get("mode")
/** The cjar going back and forth along the track, the storm closing in. */
const extras = (t: number): Pick<WorldFrame, "cart" | "storm" | "turrets" | "doors"> => {
  const len = trackLength(map.track)
  const p = trackPoint(map.track, ((Math.sin(t * 0.05) + 1) / 2) * len)
  // the turrets turn and heat up, the doors break and come back
  const heat = (Math.sin(t * 0.4) + 1) / 2
  return {
    turrets: map.turrets.map((s, i) => ({ yaw: s.yaw + Math.sin(t * 0.7 + i) * 0.8, pitch: Math.sin(t * 0.5) * 0.15, heat, jammed: heat > 0.95, manned: true, mine: false })),
    doors: map.doors.map(() => Math.max(0, Math.cos(t * 0.2))),
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
  if (cam && cam.length === 6) {
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
  renderer.render(scene, camera)
  frames++
  if (now - fpsT > 500) {
    fps = (frames * 1000) / (now - fpsT)
    frames = 0
    fpsT = now
    const r = renderer.info.render
    info.textContent = `fps ${fps.toFixed(0)}  draw ${r.calls}  tri ${(r.triangles / 1000).toFixed(0)}k  build ${buildMs.toFixed(0)} ms\ngeo ${renderer.info.memory.geometries}  tex ${renderer.info.memory.textures}`
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
  renderer.render(scene, camera)
  const out = document.createElement("canvas")
  out.width = w
  out.height = Math.round((w * canvas.height) / canvas.width)
  out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height)
  ;(globalThis as Record<string, unknown>).__img = out.toDataURL("image/jpeg", 0.72)
  return ((globalThis as Record<string, unknown>).__img as string).length
}
