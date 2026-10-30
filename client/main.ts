/**
 * Avvio del client: renderer, mondo, audio, menu, connessione, partita.
 */
import * as THREE from "three"
import { createPhysicsWorld, initPhysics } from "../shared/physics.ts"
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
import { createViewmodel } from "./viewmodel.ts"
import { createWorld } from "./world.ts"

const settings = loadSettings()
let game: Game | null = null
const canvas = document.getElementById("view") as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== "bassa", powerPreference: "high-performance" })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
// Il conteggio di draw call e triangoli copre mondo e arma: lo azzera il frame.
renderer.info.autoReset = false
const perf = new PerfMonitor(renderer)

/** Il pixel ratio massimo per qualità; la risoluzione dinamica scende fino a `minRatio`. */
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

const world = createWorld(scene, renderer)
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
  join: (code) => {
    if (!ensureOnline()) return
    net.send({ t: "hello", name: settings.name, version: PROTOCOL_VERSION })
    net.send({ t: "join", code, primary: settings.primary })
  },
  settingsChanged: persist
})

/** Indirizzo pubblico annunciato dal server: serve ai link d'invito quando si gioca da localhost. */
let publicUrl: string | null = null
const inviteBase = () => `${publicUrl && isLocalHost(location.hostname) ? publicUrl : location.origin}${location.pathname}`

/** La partita veloce contro i bot parte subito, senza riscaldamento. */
let autostart = false
const physicsReady = initPhysics().then(() => {
  game = new Game({
    renderer,
    scene,
    camera,
    world,
    audio,
    fx,
    viewmodel,
    physics: createPhysicsWorld(),
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

async function connect() {
  menu.status(t().net.connecting)
  try {
    await net.connect(settings.name || "Furlan")
    menu.status(t().net.connected(settings.name || t().net.stranger))
    net.send({ t: "list" })
    const invite = new URLSearchParams(location.search).get("p")
    if (invite && settings.name) {
      menu.status(t().net.invite(invite))
      net.send({ t: "join", code: invite.toUpperCase(), primary: settings.primary })
    } else if (invite) toast(t().net.inviteNeedName(invite))
  } catch {
    menu.status(t().net.retry)
    setTimeout(connect, 2500)
  }
}
net.onClose = () => {
  if (game?.active) {
    toast(t().net.lost)
    backToMenu()
  }
  menu.status(t().net.lostRetry)
  setTimeout(connect, 2000)
}
void connect()
setInterval(() => net.open && !game?.active && net.send({ t: "list" }), 3000)

// La musica parte al primo gesto (i browser bloccano l'audio prima).
addEventListener("pointerdown", () => {
  audio.unlock()
  if (!game?.active) audio.menuMusic(true)
}, { once: true })

let last = performance.now()
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  const time = now / 1000
  const cpuStart = performance.now()
  if (game?.active) {
    game.frame(dt, time)
    game.render()
  } else {
    world.menuCamera(time, camera)
    camera.updateMatrixWorld()
    world.update(dt, time, { pickups: [], flags: null, hill: null, camera })
    fx.update(dt, camera)
    renderer.info.reset()
    renderer.autoClear = true
    renderer.render(scene, camera)
  }
  perf.sample(dt * 1000, performance.now() - cpuStart)
  if (settings.autoRes && !document.hidden && perf.adapt(now, minRatio(), maxRatio())) resize()
  perf.panel(now, { quality: `${t().quality[quality]}${settings.autoRes ? ` · ${t().perf.dynRes}` : ""}`, net: game?.active ? game.netStats() : null })
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
