/**
 * Client startup: renderer, world, audio, menu, connection, match.
 */
import "./zod-config.ts"
import * as THREE from "three"
import type { MapId } from "../shared/map.ts"
import { MAPS } from "../shared/maps/index.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import { PROTOCOL_VERSION, type ServerMessage } from "../shared/protocol.ts"
import { createAudio } from "./audio.ts"
import { createAvatar } from "./avatars.ts"
import { createFx } from "./fx.ts"
import { isLocalHost } from "../shared/hosts.ts"
import { Game } from "./game.ts"
import { t } from "./i18n.ts"
import { Menu } from "./menu.ts"
import { Net } from "./net.ts"
import { PerfMonitor } from "./perf.ts"
import { loadSettings, saveSettings } from "./settings.ts"
import type { WorldScene } from "./contracts.ts"
import { createViewmodel } from "./viewmodel.ts"
import { createWorld } from "./world.ts"

const settings = loadSettings()
let game: Game | null = null
const canvas = document.getElementById("view") as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== "bassa", powerPreference: "high-performance" })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
// The draw call and triangle count covers world and weapon: the frame resets it.
renderer.info.autoReset = false
const perf = new PerfMonitor(renderer)

/** The maximum pixel ratio per quality; dynamic resolution goes down to `minRatio`. */
const maxRatio = () => Math.min(devicePixelRatio, settings.quality === "alta" ? 2 : settings.quality === "media" ? 1.5 : 1)
const minRatio = () => Math.min(maxRatio(), settings.quality === "bassa" ? 0.6 : 0.75)
const pixelRatio = () => (settings.autoRes ? Math.min(perf.scale, maxRatio()) : maxRatio())
perf.scale = maxRatio()
renderer.setPixelRatio(pixelRatio())

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 2500)
camera.rotation.order = "YXZ"

const resize = () => {
  renderer.setPixelRatio(pixelRatio())
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  viewmodel.camera.aspect = innerWidth / innerHeight
  viewmodel.camera.updateProjectionMatrix()
}

/** The visible world of the current map: the menu background is the last chosen map. */
let worldMap: MapId = settings.lastMap
let world: WorldScene = createWorld(scene, renderer, MAPS[worldMap])
/** One physics world per map, built the first time it's needed (the WASM must be ready). */
const physicsOf = new Map<MapId, PhysicsWorld>()
const loadMap = (id: MapId) => {
  if (id !== worldMap) {
    world.dispose()
    world = createWorld(scene, renderer, MAPS[id])
    world.setQuality(quality)
    worldMap = id
  }
  let physics = physicsOf.get(id)
  if (!physics) {
    physics = createPhysicsWorld(MAPS[id])
    physicsOf.set(id, physics)
  }
  return { world, physics }
}
const fx = createFx(scene)
const viewmodel = createViewmodel(camera)
viewmodel.setVisible(false)
const audio = createAudio()
audio.setVolumes(settings.master, settings.music)
addEventListener("resize", resize)
resize()

let quality = settings.quality
const applyQuality = () => {
  quality = settings.quality
  perf.scale = maxRatio()
  world.setQuality(quality)
  fx.setQuality(quality)
  game?.setQuality(quality)
  resize()
}
applyQuality()
perf.show(settings.showInfo)
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.code !== "F3") return
  e.preventDefault()
  settings.showInfo = !settings.showInfo
  perf.show(settings.showInfo)
  menu.syncSettings()
  saveSettings(settings)
})

const net = new Net()
const persist = () => {
  saveSettings(settings)
  audio.setVolumes(settings.master, settings.music)
  game?.applySettings()
  perf.show(settings.showInfo)
  if (settings.quality !== quality) applyQuality()
  else resize()
}

const menu = new Menu(settings, audio, {
  create: (o, quick = false) => {
    if (!ensureOnline()) return
    autostart = quick
    net.send({ t: "hello", name: settings.name, version: PROTOCOL_VERSION })
    net.send({ t: "create", ...o, primary: settings.primary })
  },
  mapChanged: (id) => {
    if (!game?.active) loadMap(id)
  },
  join: (code) => {
    if (!ensureOnline()) return
    net.send({ t: "hello", name: settings.name, version: PROTOCOL_VERSION })
    net.send({ t: "join", code, primary: settings.primary })
  },
  settingsChanged: persist
})

/** Public address announced by the server: used for invite links when playing from localhost. */
let publicUrl: string | null = null
const inviteBase = () => `${publicUrl && isLocalHost(location.hostname) ? publicUrl : location.origin}${location.pathname}`

/** A quick match against bots starts right away, without warmup. */
let autostart = false
const physicsReady = initPhysics().then(() => {
  game = new Game({
    renderer,
    scene,
    camera,
    loadMap,
    audio,
    fx,
    viewmodel,
    net,
    settings,
    menu,
    createAvatar,
    saveSettings: () => saveSettings(settings),
    onLeave: backToMenu,
    inviteBase
  })
  game.setQuality(quality)
})

function toast(text: string) {
  const t = document.getElementById("toast")!
  t.textContent = text
  t.classList.remove("hidden")
  setTimeout(() => t.classList.add("hidden"), 3500)
}

function ensureOnline() {
  if (net.open) return true
  toast(t().net.down)
  void connect()
  return false
}

function backToMenu() {
  game?.stop()
  menu.show(true)
  audio.menuMusic(true)
}

net.on((msg: ServerMessage) => {
  switch (msg.t) {
    case "welcome":
      publicUrl = msg.publicUrl
      return
    case "public":
      publicUrl = msg.url
      return
    case "rooms":
      menu.rooms(msg.rooms)
      return
    case "joined":
      void physicsReady.then(() => {
        menu.show(false)
        audio.menuMusic(false)
        history.replaceState(null, "", `?p=${msg.room.code}`)
        game!.start(msg.room, msg.you)
        if (autostart && msg.room.hostId === msg.you) net.send({ t: "start" })
        autostart = false
      })
      return
    case "left":
      history.replaceState(null, "", location.pathname)
      backToMenu()
      return
    case "error":
      toast(t().errors[msg.code])
      return
  }
})

/** A single pending retry: a failure or a click while offline never adds a second one. */
let retry = 0
let connecting = false
const reconnect = (ms: number) => {
  clearTimeout(retry)
  retry = window.setTimeout(connect, ms)
}

async function connect() {
  clearTimeout(retry)
  if (connecting || net.open) return
  connecting = true
  menu.status(t().net.connecting)
  try {
    await net.connect(settings.name || "Furlan")
    connecting = false
    menu.status(t().net.connected(settings.name || t().net.stranger))
    net.send({ t: "list" })
    const invite = new URLSearchParams(location.search).get("p")
    if (invite && settings.name) {
      menu.status(t().net.invite(invite))
      net.send({ t: "join", code: invite.toUpperCase(), primary: settings.primary })
    } else if (invite) toast(t().net.inviteNeedName(invite))
  } catch {
    connecting = false
    menu.status(t().net.retry)
    reconnect(2500)
  }
}
net.onClose = () => {
  if (game?.active) {
    toast(t().net.lost)
    backToMenu()
  }
  menu.status(t().net.lostRetry)
  reconnect(2000)
}
void connect()
setInterval(() => net.open && !game?.active && net.send({ t: "list" }), 3000)

// Music starts on the first gesture (browsers block audio before that).
addEventListener("pointerdown", () => {
  audio.unlock()
  if (!game?.active) audio.menuMusic(true)
}, { once: true })

let last = performance.now()
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  const time = now / 1000
  // Dynamic resolution changes the canvas size, and changing it clears it: it must happen
  // before drawing, never after (otherwise the frame reaches the screen black: the black flashes).
  if (settings.autoRes && !document.hidden && perf.adapt(now, minRatio(), maxRatio())) resize()
  const cpuStart = performance.now()
  if (game?.active) {
    game.frame(dt, time)
    game.render()
  } else {
    world.menuCamera(time, camera)
    camera.updateMatrixWorld()
    world.update(dt, time, { pickups: [], flags: null, hill: null, cart: null, storm: null, turrets: [], doors: [], camera })
    fx.update(dt, camera)
    renderer.info.reset()
    renderer.autoClear = true
    renderer.render(scene, camera)
  }
  perf.sample(dt * 1000, performance.now() - cpuStart)
  perf.panel(now, { quality: `${t().quality[quality]}${settings.autoRes ? ` · ${t().perf.dynRes}` : ""}`, net: game?.active ? game.netStats() : null })
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

// The first frame is drawn and the menu translated: remove the loading screen.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    document.documentElement.classList.remove("booting")
    const loader = document.getElementById("loader")!
    loader.classList.add("done")
    loader.addEventListener("transitionend", () => loader.remove(), { once: true })
    setTimeout(() => loader.remove(), 1000)
  })
)
