// Anteprima del mondo: camera del menu (o fissa con ?cam=x,y,z,lx,ly,lz), modalità con ?mode=frico|culine.
import * as THREE from "three"
import { FLAG_BASES, PICKUPS } from "../../shared/map.ts"
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
const world = createWorld(scene, renderer)
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

// Per gli strumenti: fotografa un'inquadratura (jpeg ridotto) senza aspettare il ciclo.
;(globalThis as Record<string, unknown>).__shot = (c: number[] | null, t = 5, w = 960) => {
  if (c) {
    camera.position.set(c[0], c[1], c[2])
    camera.lookAt(c[3], c[4], c[5])
  } else world.menuCamera(t, camera)
  camera.updateMatrixWorld()
  world.update(0.016, t, { pickups: PICKUPS.map(() => true), flags: mode === "frico" ? { benandanti: { pos: FLAG_BASES.benandanti, state: "base" }, malandanti: { pos: FLAG_BASES.malandanti, state: "base" } } : null, hill: mode === "culine" ? { owner: null, contested: false } : null, camera })
  renderer.render(scene, camera)
  const out = document.createElement("canvas")
  out.width = w
  out.height = Math.round((w * canvas.height) / canvas.width)
  out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height)
  ;(globalThis as Record<string, unknown>).__img = out.toDataURL("image/jpeg", 0.72)
  return ((globalThis as Record<string, unknown>).__img as string).length
}
