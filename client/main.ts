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
import { inviteLink } from "./invite.ts"
import { decideOpening, Launches, type Opening, readOpening } from "./opening.ts"
import { t } from "./i18n.ts"
import { createLook, lookFromUrl } from "./looks.ts"
import { loadDetailed } from "./models/detailed.ts"
import { Menu } from "./menu.ts"
import { Net } from "./net.ts"
import { BrowserHostConnection } from "./offline.ts"
import { registerServiceWorker } from "./offline-cache/register.ts"
import { keepVerFilesOnceControlled, lookToShow, verState } from "./offline-cache/ver.ts"
import { CheckOnReturn, SelfUpdate } from "./offline-cache/self-update.ts"
import { loadNewVersion, watchNewVersion } from "./offline-cache/update.ts"
import { addsToHomeScreenByHand, keepStorage, runsInstalled } from "./installed.ts"
import { Link } from "./connection.ts"
import { PerfMonitor } from "./perf.ts"
import { loadSettings, saveSettings } from "./settings.ts"
import type { WorldScene } from "./contracts.ts"
import { createViewmodel } from "./viewmodel.ts"
import { onViewportChange } from "./viewport.ts"
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
const chosenLook = lookFromUrl()
// Vêr chosen with no network and never fetched: Cumò for this page, and the saved choice kept,
// so Vêr comes back by itself once it can load (`client/offline-cache/ver.ts`). Asked only when
// the browser says it is offline: online, the boot waits for nothing (and the `load` listeners
// below are added before the page's `load`, which a top-level await can let pass).
const shownLook = lookToShow(
  chosenLook,
  chosenLook === "ver" && !navigator.onLine ? await verState({ caches: "caches" in globalThis ? caches : undefined, fetch: (url, init) => fetch(url, init) }) : "reachable"
)
const look = createLook(shownLook.look, renderer)

/** The maximum pixel ratio per quality; dynamic resolution goes down to `minRatio`. */
const maxRatio = () => Math.min(devicePixelRatio, settings.quality === "alta" ? 2 : settings.quality === "media" ? 1.5 : 1)
const minRatio = () => Math.min(maxRatio(), settings.quality === "bassa" ? 0.6 : 0.75)
const pixelRatio = () => (settings.autoRes ? Math.min(perf.scale, maxRatio()) : maxRatio())
perf.scale = maxRatio()
renderer.setPixelRatio(pixelRatio())

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 2500)
camera.rotation.order = "YXZ"

/** The size the canvas was last drawn for: resizing it clears it, so a change that moved nothing leaves it alone. */
let sized = ""
const viewport = () => `${innerWidth}x${innerHeight}@${devicePixelRatio}`
const resize = () => {
  sized = viewport()
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
// On the first visit Vêr's files arrive before the service worker controls the page: kept once it does.
if (look.id === "ver" && import.meta.env.PROD)
  keepVerFilesOnceControlled({
    container: navigator.serviceWorker as ServiceWorkerContainer | undefined,
    fetched: () => performance.getEntriesByType("resource").map((entry) => entry.name),
    fetch: (url) => fetch(url),
    origin: location.origin
  })
const audio = createAudio()
audio.setVolumes(settings.master, settings.music)
onViewportChange(() => viewport() !== sized && resize())
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
// After one visit online the game opens with no network (`client/offline-cache/`): production
// build only, after the page has loaded so the worker's downloads don't compete with the boot.
// `navigator.serviceWorker` is missing over plain http on a LAN address: the game plays as before.
const serviceWorkers = navigator.serviceWorker as ServiceWorkerContainer | undefined
const registration = new Promise<ServiceWorkerRegistration | null>((resolve) => {
  const register = () => resolve(registerServiceWorker({ production: import.meta.env.PROD, container: serviceWorkers }))
  // The top-level await for Vêr with no network (above) can let `load` pass before this line.
  if (document.readyState === "complete") register()
  else addEventListener("load", register, { once: true })
})
/** A cached game too old for the server updates itself; a match or an Offline room is never cut. */
const selfUpdate = new SelfUpdate({
  registration,
  container: serviceWorkers,
  session: sessionStorage,
  reload: () => location.reload(),
  tell: (notice) => toast(t().tooOld[notice]),
  playing: () => playing()
})
/**
 * An installed game brought to the front from its icon does not reload (`launch_handler:
 * focus-existing`): coming back into view or back to the menu looks for a new version, quietly.
 */
const checkOnReturn = new CheckOnReturn({
  registration,
  visible: () => document.visibilityState === "visible",
  playing: () => playing(),
  now: () => Date.now()
})
document.addEventListener("visibilitychange", () => checkOnReturn.returned())
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
/** The name the game server knows the player by: the one told on connecting, or since. */
let toldName: string | null = null
/** Tells the game server the player's name (`hello`), so that a room created or joined next shows it. */
const sayHello = () => {
  toldName = settings.name
  net.send({ t: "hello", name: settings.name, version: PROTOCOL_VERSION })
}
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
    sayHello()
    net.send({ t: "create", ...o, primary: settings.primary })
  },
  training: (start) => {
    // Like an Offline room: in this page, with or without the game server, entered from the tap.
    game?.requestFullscreen()
    autostart = false
    roomPassword = null
    forgetRoomAddress()
    link.use(browserHostConnection)
    browserHostConnection.open(settings.name)
    browserHostConnection.send({ t: "training", primary: settings.primary, ...start })
  },
  mapChanged: (id) => {
    if (!game?.active) loadMap(id)
  },
  join: (code, password) => {
    if (!ensureOnline()) return
    game?.requestFullscreen()
    sayHello()
    sendJoin(code, password)
  },
  settingsChanged: persist,
  install: promptInstall,
  // The menu asks only from the menu: never over a match.
  update: () => void registration.then((reg) => loadNewVersion(reg, serviceWorkers, () => location.reload()))
}, look.id)
if (shownLook.fellBack) toast(t().net.verOffline)

/** Public address announced by the server: used for invite links when playing from localhost. */
let publicUrl: string | null = null
const inviteBase = () => `${publicUrl && isLocalHost(location.hostname) ? publicUrl : location.origin}${location.pathname}`

/** The home screen's one-tap match against the bots starts right away, without warm-up. */
let autostart = false
/** What to do once the room is left (its `left` message): a match asked for while leaving waits for it. */
let afterLeft: (() => void) | null = null
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
    leaveForOneTap: () => {
      afterLeft = () => menu.press("one-tap")
      link.send({ t: "leave" })
      backToMenu()
    },
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
  selfUpdate.atMenu()
  checkOnReturn.returned()
}

link.on((msg: ServerMessage) => {
  switch (msg.t) {
    case "welcome":
      publicUrl = msg.publicUrl
      // Only the game server's word counts: the in-browser host is this very build, it always accepts.
      if (!offline()) selfUpdate.welcomed()
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
      if (afterLeft) {
        const then = afterLeft
        afterLeft = null
        then()
      }
      return
    case "error":
      // A password room: ask for it, saying why when the last one did not work.
      if (msg.code === "passwordRequired" || msg.code === "wrongPassword" || msg.code === "tooManyAttempts") menu.hostRefused(joining, msg.code)
      // Too old for the server: fetch the new version and reload into it, once (or say why not).
      else if (msg.code === "version") selfUpdate.refused()
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

/** A match is in progress (an Offline room or the training counts). */
function playing() {
  return Boolean(game?.active) || offline()
}

/**
 * Acts on how the page was opened (`client/opening.ts`): never over a match in progress. An
 * invite joins through the game server, so only once it is connected; the shortcut starts an
 * Offline room, so it does not wait for it.
 */
function answerOpening(opening: Opening) {
  const action = decideOpening(opening, { playing: playing(), named: Boolean(settings.name) })
  switch (action.kind) {
    case "join":
      if (!net.open) {
        // As if the page had been opened on the invite: `connect` joins it once the game server is there.
        history.replaceState(null, "", inviteLink("", action.code, action.password))
        return
      }
      menu.status(t().net.invite(action.code))
      // A connection older than the name would join under the old one: the server learns the new one first.
      if (toldName !== settings.name) sayHello()
      sendJoin(action.code, action.password ?? undefined)
      return
    case "start":
      menu.press(action.button)
      return
    case "askName":
      toast(action.message(t().net))
      return
    case "nothing":
      return
  }
}

async function connect() {
  clearTimeout(retry)
  if (connecting || net.open) return
  connecting = true
  menu.status(t().net.connecting)
  try {
    const name = settings.name || "Furlan"
    await net.connect(name)
    toldName = name
    connecting = false
    menu.status(t().net.connected(settings.name || t().net.stranger))
    net.send({ t: "list" })
    const opening = readOpening(location.search, location.hash)
    if (opening.kind === "invite") answerOpening(opening)
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
// Each launch of the installed game is answered once. The one that opened the page is answered
// here: the shortcut at once, then its marker leaves the address so that nothing starts again on
// its own; an invite once the game server is connected (`connect`).
const launches = new Launches(location.href)
const opened = readOpening(location.search, location.hash)
if (opened.kind === "shortcut") {
  forgetRoomAddress()
  answerOpening(opened)
}
// The installed game launched again while open (its icon, its shortcut, a captured invite) focuses
// this window (`launch_handler` in the manifest) and the launch arrives here.
;(window as { launchQueue?: LaunchQueue }).launchQueue?.setConsumer(({ targetURL }) => {
  if (targetURL) answerOpening(launches.opening(targetURL))
})
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
    game?.menuFrame()
    world.menuCamera(time, camera)
    camera.updateMatrixWorld()
    world.update(dt, time, { pickups: [], flags: null, hill: null, cart: null, storm: null, turrets: [], doors: [], gates: [], camera })
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

// Installed, the game asks the browser to keep its storage (cache, settings, training progress):
// at every start, since the browser may only grant it later, and in the tab that installs it.
const storage = navigator.storage as StorageManager | undefined
const installed = runsInstalled({ matchMedia: (q) => matchMedia(q), fullscreenElement: document.fullscreenElement, standalone: (navigator as { standalone?: boolean }).standalone })
void keepStorage({ installed, storage })
addEventListener("appinstalled", () => void keepStorage({ installed: true, storage }), { once: true })

// The menu's install entry: the browser's own prompt where it has one, how to do it by hand on
// iPhone and iPad, nothing once installed. Then its update notice when a new version waits.
/** `beforeinstallprompt`, which no TypeScript library describes yet. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>
}
/** The browser's install prompt, kept for the entry's tap: it can be shown once. */
let installPrompt: InstallPromptEvent | null = null
menu.installSurroundings({ installed, byHand: addsToHomeScreenByHand(navigator) })
addEventListener("beforeinstallprompt", (e) => {
  // The browser's own banner stays away: the menu offers it.
  e.preventDefault()
  installPrompt = e as InstallPromptEvent
  menu.installOffered()
})
addEventListener("appinstalled", () => menu.installed())
function promptInstall() {
  void installPrompt?.prompt().catch((error: unknown) => console.warn("install prompt refused", error))
  installPrompt = null
}
void registration.then((reg) => reg && watchNewVersion(reg, () => Boolean(serviceWorkers?.controller), () => menu.newVersionWaiting()))
