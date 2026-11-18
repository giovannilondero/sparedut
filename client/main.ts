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
import { createAvatar, setDetailedWeapon } from "./avatars.ts"
import { createFx } from "./fx.ts"
import { isLocalHost } from "../shared/hosts.ts"
import { Game } from "./game.ts"
import { inviteLink, readInvite } from "./invite.ts"
import { t } from "./i18n.ts"
import { createLook, lookFromUrl } from "./looks.ts"
import { loadDetailed } from "./models/detailed.ts"
import { Menu } from "./menu.ts"
import { Net } from "./net.ts"
import { BrowserHostConnection } from "./offline.ts"
import { Link } from "./connection.ts"
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
const look = createLook(lookFromUrl(), renderer)

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
// The realistic look holds the weapons modelled in Blender; the files are fetched only then.
if (look.id === "ver")
  loadDetailed((id, model) => {
    const far = model.getObjectByName("far")
    if (far) {
      far.removeFromParent()
      setDetailedWeapon(id, far)
    }
    viewmodel.remodel(id, model)
  })
const audio = createAudio()
audio.setVolumes(settings.master, settings.music)
addEventListener("resize", resize)
resize()

let quality = settings.quality
const applyQuality = () => {
  quality = settings.quality
  perf.scale = maxRatio()
  world.setQuality(quality)
  look.setQuality(quality)
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
/** An Offline room's host, in a worker of this page: started on create, ended on leave. */
const browserHostConnection = new BrowserHostConnection()
/** What the game talks to: the server, or the browser's host while in an Offline room. */
const link = new Link([net, browserHostConnection])
const offline = () => link.uses(browserHostConnection)
browserHostConnection.onError = (error) => {
  console.error("The Offline room's host failed:", error)
  toast(t().net.offlineFailed)
  if (offline()) leaveOffline()
  backToMenu()
}
/** Back to the server: the browser's host and its Offline room end. */
function leaveOffline() {
  browserHostConnection.close()
  link.use(net)
}
const persist = () => {
  saveSettings(settings)
  audio.setVolumes(settings.master, settings.music)
  game?.applySettings()
  perf.show(settings.showInfo)
  if (settings.quality !== quality) applyQuality()
  else resize()
}

/** The room being joined, for the password prompt. */
let joining = ""
/** The password of the room being created, joined or played, if it has one: it goes into the invite link. */
let roomPassword: string | null = null
const sendJoin = (code: string, password?: string) => {
  joining = code
  roomPassword = password ?? null
  net.send({ t: "join", code, ...(password === undefined ? {} : { password }), primary: settings.primary })
}

const menu = new Menu(settings, audio, {
  create: (o, oneTap = false) => {
    if (o.reach === "offline") {
      // Still inside the tap that asks for the match: the only moment the browser grants fullscreen.
      game?.requestFullscreen()
      // The room lives in this page: the game server need not be reachable.
      autostart = oneTap
      roomPassword = null
      // An invite still in the address must not pull the player out when the server comes back.
      forgetRoomAddress()
      link.use(browserHostConnection)
      browserHostConnection.open(settings.name)
      browserHostConnection.send({ t: "create", ...o, primary: settings.primary })
      return
    }
    if (!ensureOnline()) return
    game?.requestFullscreen()
    autostart = oneTap
    roomPassword = o.access.kind === "password" ? o.access.password : null
    net.send({ t: "hello", name: settings.name, version: PROTOCOL_VERSION })
    net.send({ t: "create", ...o, primary: settings.primary })
  },
  mapChanged: (id) => {
    if (!game?.active) loadMap(id)
  },
  join: (code, password) => {
    if (!ensureOnline()) return
    game?.requestFullscreen()
    net.send({ t: "hello", name: settings.name, version: PROTOCOL_VERSION })
    sendJoin(code, password)
  },
  settingsChanged: persist
}, look.id)

/** Public address announced by the server: used for invite links when playing from localhost. */
let publicUrl: string | null = null
const inviteBase = () => `${publicUrl && isLocalHost(location.hostname) ? publicUrl : location.origin}${location.pathname}`

/** The home screen's one-tap match against the bots starts right away, without warm-up. */
let autostart = false
const physicsReady = initPhysics().then(() => {
  game = new Game({
    renderer,
    look,
    scene,
    camera,
    loadMap,
    audio,
    fx,
    viewmodel,
    net: link,
    settings,
    menu,
    createAvatar,
    saveSettings: () => saveSettings(settings),
    onLeave: backToMenu,
    inviteBase,
    roomPassword: () => roomPassword
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

/** The address no longer names a room: nothing joins it again on its own. */
function forgetRoomAddress() {
  history.replaceState(null, "", location.pathname)
}

function backToMenu() {
  game?.stop()
  menu.show(true)
  audio.menuMusic(true)
}

link.on((msg: ServerMessage) => {
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
        // An Offline room has no code to share.
        if (msg.room.reach !== "offline") history.replaceState(null, "", inviteLink("", msg.room.code, roomPassword))
        game!.start(msg.room, msg.you)
        if (autostart && msg.room.hostId === msg.you) link.send({ t: "start" })
        autostart = false
      })
      return
    case "left":
      if (offline()) leaveOffline()
      roomPassword = null
      forgetRoomAddress()
      backToMenu()
      return
    case "error":
      // A password room: ask for it, saying why when the last one did not work.
      if (msg.code === "passwordRequired" || msg.code === "wrongPassword" || msg.code === "tooManyAttempts") menu.hostRefused(joining, msg.code)
      else toast(t().errors[msg.code])
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
    // An invite joins on its own only from the menu: never over a room in progress.
    const invite = game?.active || offline() ? null : readInvite(location.search, location.hash)
    if (invite && settings.name) {
      menu.status(t().net.invite(invite.code))
      sendJoin(invite.code, invite.password ?? undefined)
    } else if (invite) toast(t().net.inviteNeedName(invite.code))
  } catch {
    connecting = false
    menu.status(t().net.retry)
    reconnect(2500)
  }
}
net.onClose = () => {
  if (game?.active && !offline()) {
    toast(t().net.lost)
    roomPassword = null
    forgetRoomAddress()
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
    look.render(scene, camera)
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
