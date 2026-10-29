/**
 * Avvio del client: renderer, mondo, audio, menu, connessione, partita.
 */
import * as THREE from "three"
import { createPhysicsWorld, initPhysics } from "../shared/physics.ts"
import { PROTOCOL_VERSION, type ServerMessage } from "../shared/protocol.ts"
import { createAudio } from "./audio.ts"
import { createAvatar } from "./avatars.ts"
import { createFx } from "./fx.ts"
import { Game } from "./game.ts"
import { Menu } from "./menu.ts"
import { Net } from "./net.ts"
import { loadSettings, saveSettings } from "./settings.ts"
import { createViewmodel } from "./viewmodel.ts"
import { createWorld } from "./world.ts"

const settings = loadSettings()
const canvas = document.getElementById("view") as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== "bassa", powerPreference: "high-performance" })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = settings.quality !== "bassa"
renderer.shadowMap.type = settings.quality === "alta" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
const pixelRatio = () => Math.min(devicePixelRatio, settings.quality === "alta" ? 2 : settings.quality === "media" ? 1.5 : 1)
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

const net = new Net()
const persist = () => {
  saveSettings(settings)
  audio.setVolumes(settings.master, settings.music)
  game?.applySettings()
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

let game: Game | null = null
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
    onLeave: backToMenu
  })
})

function toast(text: string) {
  const t = document.getElementById("toast")!
  t.textContent = text
  t.classList.remove("hidden")
  setTimeout(() => t.classList.add("hidden"), 3500)
}

function ensureOnline() {
  if (net.open) return true
  toast("Il server nol rispuint. Al è impiât? (pnpm dev)")
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
      toast(msg.message)
      return
  }
})

async function connect() {
  menu.status("Conession al server…")
  try {
    await net.connect(settings.name || "Furlan")
    menu.status(`Conetût · Mandi, ${settings.name || "forest"}!`)
    net.send({ t: "list" })
    const invite = new URLSearchParams(location.search).get("p")
    if (invite && settings.name) {
      menu.status(`Invît a la partide ${invite}…`)
      net.send({ t: "join", code: invite.toUpperCase(), primary: settings.primary })
    } else if (invite) toast(`Scrîf il to non e jentre cun codiç ${invite}`)
  } catch {
    menu.status("Server no rivât. Torni a provâ…")
    setTimeout(connect, 2500)
  }
}
net.onClose = () => {
  if (game?.active) {
    toast("Conession pierdude. Mandi!")
    backToMenu()
  }
  menu.status("Conession pierdude: torni a provâ…")
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
  const t = now / 1000
  if (game?.active) {
    game.frame(dt, t)
    game.render()
  } else {
    world.menuCamera(t, camera)
    camera.updateMatrixWorld()
    world.update(dt, t, { pickups: [], flags: null, hill: null, camera })
    fx.update(dt, camera)
    renderer.autoClear = true
    renderer.render(scene, camera)
  }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
