/**
 * The match in progress on the client: fixed-tick inputs, prediction of our own
 * body, interpolation of the others, events → sounds and effects, HUD and overlays.
 */
import * as THREE from "three"
import { BOT_LEVEL_IDS, QUICK_CHAT, TEAM_INFO, type BotLevel } from "../shared/folklore.ts"
import { rayPose } from "../shared/hitbox.ts"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { freeTurretInReach, turretAim, turretSeat, type MapId, type PickupKind, type Team } from "../shared/map.ts"
import { DISCO } from "../shared/maps/maran.ts"
import { DT, EYE_CROUCH, EYE_STAND, lookDir, MOVE, seatedBody, sprinting } from "../shared/movement.ts"
import type { PhysicsWorld } from "../shared/physics.ts"
import { FLAG_BIT, type BoardRow, type RoomInfo, type ServerMessage, type SnapOther, type Snapshot } from "../shared/protocol.ts"
import type { GameEvent, Winner } from "../shared/sim/events.ts"
import { outsideStorm, owned, RAISE_TICKS, weaponInSlot } from "../shared/sim/rules.ts"
import { isTraining } from "../shared/training/index.ts"
import { closedGates, viewedStation } from "../shared/training/gates.ts"
import type { InterfaceAction } from "../shared/training/interface.ts"
import { UnavailableSteps } from "./training-unavailable.ts"
import type { StationId } from "../shared/training/index.ts"
import { FRESH_TRAINING, trainingProgressed } from "./settings.ts"
import { stationEntries, stationListHtml } from "./training-menu.ts"
import { WEAPONS, type Slot, type WeaponId } from "../shared/weapons.ts"
import { firstPerson } from "./firstperson.ts"
import type { Avatar, Fx, GameAudio, P3, SoundName, TurretVisual, Viewmodel, WorldScene } from "./contracts.ts"
import { Controls, trackedIn } from "./controls.ts"
import { boardHtml, esc, Hud, rosterHtml } from "./hud.ts"
import { t } from "./i18n.ts"
import type { Look } from "./looks.ts"
import type { Menu } from "./menu.ts"
import type { Connection } from "./connection.ts"
import { inviteLink } from "./invite.ts"
import { requestFullscreen } from "./fullscreen.ts"
import { MatchClock } from "./match-clock.ts"
import { Predictor } from "./predict.ts"
import type { Settings } from "./settings.ts"
// UI SDK's dialog holds each in-match menu: focus moved in and kept inside. The game's own Esc steps close them.
import "@ui-sdk/web/dialog"
// UI SDK's select, for the host's bot skill: opens on a tap or a key (never on hover), as a sheet on a small touch screen.
import "@ui-sdk/web/select"
import { alwaysChosen } from "./choice.ts"
import { afterEscape, endFocus, focusOnOpen, MATCH_MENUS, type MatchMenu } from "./match-menus.ts"
import { pickerEntries } from "./touch.ts"
import { onViewportChange } from "./viewport.ts"

type DialogElement = HTMLElementTagNameMap["ui-dialog"]
type SelectElement = HTMLElementTagNameMap["ui-select"]

/**
 * Each in-match menu's dialog and the content the game draws into it: the menus the player opens,
 * and the end screen, which the match opens and no Esc step leads to.
 */
const MENU_PARTS = {
  pause: ["pause-dialog", "pause"],
  loadout: ["loadout-dialog", "loadout"],
  settings: ["settings-dialog", "settings-ingame"],
  end: ["end-dialog", "endscreen"]
} as const satisfies Record<Exclude<MatchMenu, "none"> | "end", readonly [string, string]>
/** The contents of the menus the player opens, for `closest`: built once. */
const OPENED_CONTENT = MATCH_MENUS.map((m) => `#${MENU_PARTS[m][1]}`).join(", ")

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const INTERP_TICKS = 6
const SHOT_SOUND: Partial<Record<WeaponId, SoundName>> = {
  mandi: "shot_mandi",
  cramar: "shot_cramar",
  doplete: "shot_doplete",
  cjampanili: "shot_cjampanili",
  mulin: "shot_mulin",
  miedi: "beam_miedi",
  mitraie: "shot_mitraie"
}
const PICK_SOUND = {
  frico: "pickup_frico",
  gubane: "pickup_gubane",
  sgnape: "pickup_sgnape",
  munizions: "pickup_munizions",
  lanciafrico: "pickup_lanciafrico"
} as const satisfies Record<PickupKind, SoundName>

export interface GameDeps {
  readonly renderer: THREE.WebGLRenderer
  /** How a frame reaches the screen: the graphic look (`looks.ts`). */
  readonly look: Look
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  /** The visible world and physics of a map (the world is rebuilt only if it changes). */
  readonly loadMap: (id: MapId) => { readonly world: WorldScene; readonly physics: PhysicsWorld }
  readonly audio: GameAudio
  readonly fx: Fx
  readonly viewmodel: Viewmodel
  /** Whoever hosts the room: the game server or this browser. */
  readonly net: Connection
  readonly settings: Settings
  readonly menu: Menu
  readonly createAvatar: (team: Team, name: string) => Avatar
  readonly saveSettings: () => void
  readonly onLeave: () => void
  /** Leaves the room, and once the host has let go of it starts the home screen's one-tap match (the training's completion screen). */
  readonly leaveForOneTap: () => void
  /** Origin and path for invite links (the public address when playing from localhost). */
  readonly inviteBase: () => string
  /** The room's password, if this client knows it: it goes into the invite link's fragment. */
  readonly roomPassword: () => string | null
}

interface Frame {
  readonly tick: number
  readonly players: Map<string, SnapOther>
}

const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

export class Game {
  private hud = new Hud()
  private controls: Controls
  private predictor: Predictor
  private world: WorldScene
  private physics: PhysicsWorld
  /** The map's gates closed (true) or open, as the last snapshot's training says: what prediction collides with and the world draws. */
  private gates: readonly boolean[] = []
  /** The station the gates were last closed for (`viewedStation`). */
  private gatesAt: number | null = null
  private room: RoomInfo | null = null
  private me = ""
  private snap: Snapshot | null = null
  private frames: Frame[] = []
  private offset: number | null = null
  private acc = 0
  private seq = 0
  private wanted: WeaponId = "cramar"
  private lastWeapon: WeaponId = "mandi"
  /** First command carrying the chosen weapon: until the server has seen it, the switch is in flight. */
  private wantedSeq = 0
  private shownWeapon: WeaponId | null = null
  private localCooldown = 0
  private localMag: number | null = null
  private shots: number[] = []
  /**
   * This player's reload under way, as it began: weapon, start (frame time, s), length, and the
   * magazine and reserve it started from; `hensIn` counts the cannon's hens that have gone in, and clucked.
   */
  private ownReload: { weapon: WeaponId; at: number; seconds: number; mag: number; reserve: number; hensIn: number } | null = null
  private prevFire = false
  private prevBomb = false
  private prevMine = false
  /** Predicted Mulin spin-up (ticks), counted as the server does. */
  private localSpin = 0
  /** Seconds since my last shot, for the first-person view (the mitraie's recoil on its tripod). */
  private sinceShot = Infinity
  /** Ticks until the next predicted mitraie shot, at the turret. */
  private turretCooldown = 0
  /** Last time (s) the heal sound played, so it doesn't turn into a barrage. */
  private healSoundAt = 0
  private avatars = new Map<string, { avatar: Avatar; blob: THREE.Mesh; team: Team; stepAcc: number; last: { x: number; z: number } | null }>()
  /** Real player shadows only on high quality; otherwise a dark disc at their feet. */
  private dynamicShadows = false
  private snapArrivals: number[] = []
  private names = new Map<string, string>()
  private teams = new Map<string, Team>()
  private board: readonly BoardRow[] = []
  private boardOpen = false
  /** A training's steps the active device cannot perform: the host hears of them (#50). */
  private readonly unavailableSteps = new UnavailableSteps()
  /** The training's completion screen is open: like a match's end, no menu opens over it and no command goes out. */
  private trainingEnded = false
  private chatting = false
  private quickOpen = false
  private overlay: MatchMenu = "none"
  /** The Esc being handled closes the bot-skill list: the list's, not the match menu's. */
  private escapeInPopup = false
  /** Whether the match menu was last drawn for the host (its host tools), null before it is drawn. */
  private pauseHost: boolean | null = null
  /** Where the armoury was opened from: Esc goes back there. */
  private loadoutFrom: "none" | "pause" = "none"
  /** When the browser released the pointer lock: the same Esc must not also close the pause menu. */
  private unlockedAt = 0
  private eye = EYE_STAND
  private stepAcc = 0
  private wasGrounded = true
  private wasAlive = false
  /** The predictor holds me in a turret's seat (the last snapshot had me alive on one). */
  private seated = false
  private shake = 0
  private aimBlend = 0
  private kickPitch = 0
  private seed = 1
  private lastPhase = ""
  private renderTick = 0
  /** Match time (s): reloads, prediction and the others' interpolation all read it. */
  private time = 0
  /** Stands still while an Offline match is paused: on resume, the pause never happened. */
  private clock = new MatchClock(() => performance.now())
  private running = false
  private readonly blobGeo = new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2)
  private readonly blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
  private readonly deathCam = new THREE.Vector3()
  private readonly deathLook = new THREE.Vector3()

  constructor(private readonly d: GameDeps) {
    const stage = d.loadMap(d.settings.lastMap)
    this.world = stage.world
    this.physics = stage.physics
    this.predictor = new Predictor(stage.physics)
    this.controls = new Controls(d.renderer.domElement, {
      onSlot: (slot) => this.selectSlot(slot),
      onLastWeapon: () => this.selectWeapon(this.lastWeapon, "lastWeapon"),
      onWheel: (dir) => this.cycleWeapon(dir),
      onKey: (code, down) => this.key(code, down),
      onPause: () => this.padPause(),
      onTouch: (view) => this.hud.drawTouch(view)
    }, matchMedia("(pointer: coarse)").matches ? "touch" : "keyboard")
    // Rotating the device re-lays the touch controls; fingers already down keep their control.
    onViewportChange(() => this.running && this.placeTouch())
    // On touch, no context menu from a long press during a match (the canvas always refuses it), except
    // in the match's menus: there, as on a desktop, the room code can be selected and copied.
    document.addEventListener("contextmenu", (e) => {
      if (this.running && this.controls.device === "touch" && !(e.target as Element).closest?.(".overlay")) e.preventDefault()
    })
    d.renderer.domElement.addEventListener("click", () => {
      if (this.running && this.overlay === "none" && !this.chatting) this.controls.lock()
    })
    document.addEventListener("pointerlockchange", () => {
      if (!this.running) return
      const locked = document.pointerLockElement === d.renderer.domElement
      if (!locked) this.unlockedAt = performance.now()
      // Touch taking over drops the lock: that is no reason to open the match menu.
      if (!locked && !this.controls.touchActive && this.overlay === "none" && !this.chatting && this.snap?.phase.tag !== "Over" && !this.trainingEnded) this.openOverlay("pause")
      if (locked && this.overlay !== "none") this.openOverlay("none")
    })
    $("quickchat").addEventListener("click", (e) => {
      const n = (e.target as HTMLElement).closest<HTMLElement>("[data-n]")?.dataset.n
      if (n) this.key(`Digit${n}`, true)
    })
    const chat = $<HTMLInputElement>("chat-input")
    chat.addEventListener("keydown", (e) => {
      e.stopPropagation()
      if (e.key === "Enter") {
        const text = chat.value.trim()
        if (text) d.net.send({ t: "chat", text })
        this.closeChat()
      }
      if (e.key === "Escape") this.closeChat()
    })
    d.net.on((msg) => this.running && this.message(msg))
    document.addEventListener("visibilitychange", () => this.syncPause())
    // Before UI SDK's own listener closes the list: an Esc that finds the bot-skill list open is the list's.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.escapeInPopup = document.querySelector("#hud ui-select-content[data-open]") !== null
    }, { capture: true })
    // Development only: automated tests drive the player without pointer lock.
    if (import.meta.env.DEV) Object.assign(window, { __sparedut: { controls: this.controls, game: this } })
  }

  // ---------------------------------------------------------------- lifecycle

  start(room: RoomInfo, me: string) {
    this.running = true
    this.room = room
    this.me = me
    this.snap = null
    this.frames = []
    this.offset = null
    const stage = this.d.loadMap(room.map)
    this.world = stage.world
    this.physics = stage.physics
    // A map's physics may be reused from an earlier room: its gates are set again from the first snapshot.
    this.gates = []
    this.predictor = new Predictor(stage.physics)
    this.wanted = this.d.settings.primary
    this.wantedSeq = 0
    this.shownWeapon = null
    this.ownReload = null
    this.sinceShot = Infinity
    this.trainingEnded = false
    this.clock = new MatchClock(() => performance.now())
    this.applySettings()
    this.updateRoster(room)
    this.hud.show(true)
    this.d.viewmodel.setVisible(true)
    this.openOverlay("none")
    this.controls.inMatch = true
    document.documentElement.classList.add("in-match")
    this.placeTouch()
    this.controls.lock()
    this.hud.announce(t().modes[room.mode].name, t().modes[room.mode].rules)
  }

  stop() {
    this.running = false
    this.d.audio.disco(null, false)
    this.openOverlay("none")
    for (const a of this.avatars.values()) {
      this.d.scene.remove(a.avatar.object, a.blob)
      a.avatar.dispose()
    }
    this.avatars.clear()
    this.hud.show(false)
    this.openOverlay("none")
    $<DialogElement>(MENU_PARTS.end[0]).open = false
    this.d.viewmodel.setVisible(false)
    if (document.pointerLockElement) document.exitPointerLock()
    this.controls.track(null)
    this.controls.inMatch = false
    this.controls.releaseAll()
    document.documentElement.classList.remove("in-match")
  }

  /** Lays the touch controls and the HUD's free area for the canvas and the safe area: on start and on every resize, never per frame. */
  private placeTouch() {
    const canvas = this.d.renderer.domElement
    this.hud.placeTouch(this.controls.relayout({ width: canvas.clientWidth, height: canvas.clientHeight }, this.hud.safeInsets()))
  }

  /**
   * Called from the gesture that enters a match (a tap on the menu): on touch the match goes
   * fullscreen where the browser grants it to a page. A desktop player keeps the window as it is.
   */
  requestFullscreen() {
    if (this.controls.device === "touch") requestFullscreen()
  }

  get active() {
    return this.running
  }

  setQuality(q: "bassa" | "media" | "alta") {
    this.dynamicShadows = q === "alta"
    for (const a of this.avatars.values()) this.castShadows(a.avatar)
  }

  private castShadows(avatar: Avatar) {
    avatar.object.traverse((o) => {
      o.castShadow = this.dynamicShadows
    })
  }

  netStats() {
    const a = this.snapArrivals
    const gaps = a.slice(1).map((t, i) => t - a[i])
    const mean = gaps.length ? gaps.reduce((x, y) => x + y, 0) / gaps.length : 0
    const jitter = gaps.length ? Math.sqrt(gaps.reduce((x, y) => x + (y - mean) ** 2, 0) / gaps.length) : 0
    const corr = this.predictor.corrections
    return {
      ping: this.d.net.rtt,
      tick: this.snap?.tick ?? 0,
      snapEvery: mean,
      snapJitter: jitter,
      players: this.snap?.players.length ?? 0,
      corrections: corr.filter((c) => c > 0.01).length,
      worstCorrection: corr.length ? Math.max(...corr) : 0
    }
  }

  applySettings() {
    const s = this.d.settings
    this.controls.sensitivity = s.sensitivity
    this.controls.invertY = s.invertY
    this.controls.crouchMode = s.crouch
  }

  // ---------------------------------------------------------------- network

  private message(msg: ServerMessage) {
    switch (msg.t) {
      case "snap":
        this.onSnapshot(msg)
        return
      case "room":
        this.updateRoster(msg.room)
        return
      case "board":
        this.board = msg.rows
        if (this.boardOpen) this.hud.board(this.board, this.me, true)
        if (this.snap?.phase.tag === "Over") this.renderEnd()
        return
      case "chat":
        this.hud.chat(msg.name, msg.team, msg.text)
        this.d.audio.play("chat", { volume: 0.5 })
        return
    }
  }

  private updateRoster(room: RoomInfo) {
    this.room = room
    for (const r of room.roster) {
      this.names.set(r.id, r.name)
      this.teams.set(r.id, r.team)
      const a = this.avatars.get(r.id)
      if (a && a.team !== r.team) {
        a.avatar.setTeam(r.team)
        a.team = r.team
      }
    }
    const ids = new Set(room.roster.map((r) => r.id))
    for (const [id, a] of this.avatars) {
      if (!ids.has(id)) {
        this.d.scene.remove(a.avatar.object, a.blob)
        a.avatar.dispose()
        this.avatars.delete(id)
      }
    }
    if (this.overlay === "pause") this.renderPause()
    if (this.snap?.phase.tag === "Over") this.renderEnd()
  }

  private onSnapshot(s: Snapshot) {
    this.snapArrivals.push(this.clock.now())
    if (this.snapArrivals.length > 31) this.snapArrivals.shift()
    const now = this.clock.now() / 1000
    const target = s.tick - now * 60
    if (this.offset === null || Math.abs(target - this.offset) > 30) this.offset = target
    // The others' clock drifts slowly: an early or late snapshot
    // must not speed up or slow down every drawn player.
    else this.offset += (target - this.offset) * (target > this.offset ? 0.05 : 0.01)
    const players = new Map(s.players.map((p) => [p.id, p]))
    this.frames.push({ tick: s.tick, players })
    while (this.frames.length > 40) this.frames.shift()

    const prev = this.snap
    this.snap = s
    // Broken-down doors no longer stop predicted movement or shots.
    this.physics.setDoors(s.doors.map((hp) => hp > 0))
    // The training's closed ways stop predicted movement as they stop it on the host.
    const gates = this.physics.map.gates?.length ?? 0
    const at = viewedStation(s.training)
    if (gates !== this.gates.length || at !== this.gatesAt) {
      this.gates = closedGates(gates, at)
      this.gatesAt = at
      this.physics.setGates(this.gates)
    }
    const you = s.you
    if (you) {
      const mine = players.get(this.me)
      if (you.alive && !this.wasAlive) {
        // Respawn: body and view from the server.
        this.predictor.reset()
        this.predictor.body = you.body
        if (mine) {
          this.controls.yaw = mine.yaw
          this.controls.pitch = 0
        }
        this.wanted = you.arsenal.current
        this.localMag = null
      } else if (you.alive) {
        const turret = this.mounted()
        if (turret >= 0) {
          // On the turret the seat follows my own look, not the body the server sent: see `fixedStep`.
          this.predictor.ack(you.seq)
          if (!this.seated) this.predictor.sit(seatedBody(turretSeat(this.physics.map.turrets[turret], this.controls.yaw)))
        } else if (!this.predictor.body) this.predictor.body = you.body
        else this.predictor.reconcile(you.body, you.seq, true)
      }
      this.wasAlive = you.alive
      this.seated = you.alive && this.mounted() >= 0
      const mounted = this.mounted() >= 0
      const body = this.predictor.body
      this.controls.track(trackedIn(s, this.me, { mounted, freeTurret: body !== null && freeTurretInReach(this.physics.map.turrets, s.turrets, body) >= 0 }))
      // The server has already seen my last weapon switch and holds a different one: it
      // switched it itself (lanciafrico pickup, armoury, respawn) or rejected the switch. Follow it.
      const server = you.arsenal.current
      if (server !== this.wanted && you.seq >= this.wantedSeq) this.wanted = server
      this.shots = this.shots.filter((q) => q > you.seq)
      const mag = you.arsenal.ammo[you.arsenal.current].mag
      this.localMag = you.arsenal.current === this.wanted ? Math.max(0, mag - this.shots.length) : null
    }
    for (const e of s.ev) this.event(e)
    if (prev?.phase.tag !== s.phase.tag) this.phaseChanged(s)
  }

  private phaseChanged(s: Snapshot) {
    const tag = s.phase.tag
    if (tag === this.lastPhase) return
    this.lastPhase = tag
    if (tag === "Over") {
      if (document.pointerLockElement) document.exitPointerLock()
      this.renderEnd(true)
    } else {
      $<DialogElement>(MENU_PARTS.end[0]).open = false
      if (tag === "Live" && this.overlay === "none") this.controls.lock()
    }
    if (this.overlay === "pause") this.renderPause()
  }

  // ---------------------------------------------------------------- events

  private posOf(id: string): P3 | null {
    if (id === this.me && this.predictor.body) {
      const b = this.predictor.body
      return [b.x, b.y + 1, b.z]
    }
    const p = this.interpolated(id)
    return p ? [p.x, p.y + 1, p.z] : null
  }

  private event(e: GameEvent) {
    const { audio, fx } = this.d
    const me = this.me
    this.seed++
    switch (e.t) {
      case "shot": {
        for (let i = 0; i < e.e.length; i++) if (e.hw[i]) fx.impact(e.e[i])
        if (e.s === me) return
        const muzzle: P3 = e.o
        for (const end of e.e) fx.tracer(muzzle, end, e.w)
        if (WEAPONS[e.w].mode !== "beam") {
          fx.muzzle(muzzle)
          this.avatars.get(e.s)?.avatar.flash()
        }
        const snd = SHOT_SOUND[e.w]
        if (snd) audio.play(snd, { at: muzzle })
        return
      }
      case "melee": {
        if (e.s === me) {
          if (e.hit) audio.play("melee_hit")
          return
        }
        const at = this.posOf(e.s)
        if (at) audio.play(e.hit ? "melee_hit" : "melee_swing", { at })
        return
      }
      case "launch": {
        if (e.k === "mine") {
          const at = this.posOf(e.s)
          if (e.s === me) audio.play("mine_plant")
          else if (at) audio.play("mine_plant", { at, volume: 0.6 })
          return
        }
        if (e.s === me) return
        const at = this.posOf(e.s)
        if (at) audio.play(e.k === "frico" ? "launch_frico" : e.k === "gjaline" ? "launch_gjaline" : "throw", { at })
        this.avatars.get(e.s)?.avatar.flash()
        return
      }
      case "hit": {
        const at = this.posOf(e.v)
        if (at) fx.hitPuff([at[0], at[1] + (e.h ? 0.6 : 0.1), at[2]], e.h)
        if (e.a === me && e.v !== me) {
          this.hud.hitmarker(e.kill ? "kill" : e.h ? "head" : "hit")
          audio.play(e.h ? "headshot" : "hitmarker", { volume: 0.7 })
        }
        if (e.v === me) {
          let angle: number | null = null
          const from = e.a && e.a !== me ? this.posOf(e.a) : null
          const b = this.predictor.body
          if (from && b) {
            const dirYaw = Math.atan2(-(from[0] - b.x), -(from[2] - b.z))
            angle = -wrapAngle(dirYaw - this.controls.yaw)
          }
          this.hud.damage(angle)
          this.shake = Math.min(1, this.shake + e.d / 60)
          this.controls.rumble(e.d / 40, 0.4, 180)
        }
        return
      }
      case "kill":
        this.hud.killfeed(e.k, e.v, e.w, e.h, this.names, this.teams, me, this.seed)
        if (e.k === me) audio.play("kill")
        if (e.v === me) {
          audio.play("death")
          this.d.viewmodel.setVisible(false)
        }
        return
      case "boom": {
        const down = this.physics.raycast({ x: e.p[0], y: e.p[1] + 0.3, z: e.p[2] }, { x: 0, y: -1, z: 0 }, 4)
        fx.explosion(e.p, e.k, down ? e.p[1] + 0.3 - down.dist : null)
        const hen = e.k === "gjaline"
        audio.play(hen ? "boom_gjaline" : "boom", { at: e.p })
        const b = this.predictor.body
        if (b) {
          const d = Math.hypot(e.p[0] - b.x, e.p[1] - b.y, e.p[2] - b.z)
          this.shake = Math.min(1.6, this.shake + Math.max(0, (hen ? 0.5 : 1.4) - d / 22))
        }
        return
      }
      case "plumis":
        if (e.v === me) {
          this.hud.feathers(e.n / 60)
          this.hud.announce(t().game.plumis)
        }
        return
      case "turret": {
        const spot = this.physics.map.turrets[e.i]
        if (!spot) return
        const at: P3 = [spot.at[0], spot.at[1] + 1.2, spot.at[2]]
        if (e.a === "on" || e.a === "off") audio.play("turret_on", e.s === me ? {} : { at, volume: 0.7 })
        if (e.a === "hot") audio.play("turret_hot", e.s === me ? {} : { at })
        if (e.a === "on" && e.s === me) this.turretCooldown = 0
        return
      }
      case "door": {
        const door = this.physics.map.doors[e.i]
        if (!door) return
        const at: P3 = [(door.min[0] + door.max[0]) / 2, (door.min[1] + door.max[1]) / 2, (door.min[2] + door.max[2]) / 2]
        const broken = e.a === "broken"
        fx.splinters(at, broken)
        audio.play(broken ? "door_break" : "door_hit", { at })
        if (broken) this.hud.announce(t().game.doorBroken(this.names.get(e.s) ?? "?"), t().game.doorSub)
        return
      }
      case "bounce":
        audio.play("bounce", { at: e.p, volume: 0.6 })
        return
      case "pick": {
        const at = this.posOf(e.s)
        if (at) fx.pickupBurst(at, e.k)
        if (e.s === me) audio.play(PICK_SOUND[e.k])
        else if (at) audio.play(PICK_SOUND[e.k], { at, volume: 0.6 })
        if (e.s === me && e.k === "sgnape") this.hud.announce(t().game.sgnape, t().game.sgnapeSub)
        return
      }
      case "flag": {
        const g = t().game
        const who = e.s ? this.names.get(e.s) ?? "?" : ""
        const mine = this.teams.get(me) === e.team
        const text = {
          taken: mine ? g.flag.takenMine : g.flag.taken,
          dropped: g.flag.dropped,
          returned: g.flag.returned,
          captured: mine ? g.flag.capturedMine : g.flag.captured
        }[e.a]
        this.hud.announce(text, g.flagSub(who, t().teams[e.team].name))
        audio.play(e.a === "captured" ? "flag_captured" : e.a === "returned" ? "flag_returned" : "flag_taken")
        return
      }
      case "hill":
        // Only the plaçute in force publishes it: a culine room, or the training's plaçute step.
        this.hud.announce(e.team ? t().game.hillTaken(t().teams[e.team].name) : t().hud.hillFree)
        return
      case "pad": {
        const at = this.posOf(e.s)
        if (at) {
          fx.padBurst([at[0], at[1] - 1, at[2]])
          audio.play("pad", e.s === me ? {} : { at })
        }
        return
      }
      case "spawn":
        if (e.s === me) {
          audio.play("respawn")
          this.d.viewmodel.setVisible(true)
          this.d.viewmodel.setWeapon(this.wanted)
        }
        return
      case "reload":
        if (e.s === me) {
          const seconds = WEAPONS[e.w].reloadTicks / 60
          const ammo = this.you()?.arsenal.ammo[e.w]
          this.ownReload = ammo ? { weapon: e.w, at: this.time, seconds, mag: ammo.mag, reserve: ammo.reserve, hensIn: 0 } : null
        }
        else {
          const at = this.posOf(e.s)
          if (at) audio.play("reload", { at, volume: 0.7 })
        }
        if (e.s === me) audio.play("reload")
        return
      case "streak":
        this.hud.streak(this.names.get(e.s) ?? "?", e.n)
        audio.play("streak")
        return
      case "match":
        if (e.a === "start") {
          audio.play("bells")
          const mode = this.room?.mode
          if (mode === "tampieste") this.hud.announce(t().game.stormStart, t().game.stormStartSub)
          else if (mode === "cjar") this.hud.announce(t().game.start, t().game.cartSub(this.teams.get(me) === "benandanti"))
          else this.hud.announce(t().game.start, t().game.startSub)
        } else audio.play(e.winner && this.won(e.winner) ? "victory" : "defeat")
        return
      case "cart": {
        const g = t().game
        const ben = this.teams.get(me) === "benandanti"
        this.hud.announce(g.cart[e.a], g.cartSub(ben))
        const good = e.a === "push" || e.a === "arrived" ? ben : !ben
        audio.play(e.a === "arrived" ? (good ? "flag_captured" : "flag_taken") : good ? "flag_returned" : "flag_taken", { volume: 0.7 })
        return
      }
      case "heal": {
        const now = performance.now() / 1000
        if ((e.v === me || e.s === me) && now - this.healSoundAt > 0.45) {
          this.healSoundAt = now
          audio.play("heal")
        }
        return
      }
      case "training": {
        // Saved per completed station, with the other settings: the next training resumes from it.
        const progress = trainingProgressed(this.d.settings.training, e)
        if (progress !== this.d.settings.training) {
          this.d.settings.training = progress
          this.d.saveSettings()
        }
        const tr = t().training
        if (e.a === "step") {
          this.hud.trainingDone()
          audio.play("flag_returned", { volume: 0.6 })
        } else if (e.a === "station") {
          this.hud.announce(tr.stationDone, tr.stations[e.station])
          audio.play("bells", { volume: 0.7 })
        } else {
          audio.play("victory")
          this.showTrainingComplete()
        }
        return
      }
    }
  }

  // ---------------------------------------------------------------- weapons

  private you() {
    return this.snap?.you ?? null
  }

  /** The turret I'm using, or -1. */
  private mounted() {
    return this.snap?.turrets.findIndex((t) => t.gunner === this.me) ?? -1
  }

  /** Changes the weapon in hand; `how` the player chose it, which a training's current step may need to hear (an interface step). */
  private selectWeapon(id: WeaponId, how: InterfaceAction) {
    const you = this.you()
    if (!you || !owned(you.arsenal, id) || id === this.wanted) return
    // Ahead of the input that carries the new weapon. Only a training takes it.
    if (this.room !== null && isTraining(this.room.mode)) this.d.net.send({ t: "report", a: how })
    this.lastWeapon = this.wanted
    this.wanted = id
    this.wantedSeq = this.seq + 1
    this.localCooldown = 18
    this.localMag = null
    this.d.audio.play("switch", { volume: 0.6 })
  }

  private selectSlot(slot: Slot) {
    if (this.quickOpen) return
    const you = this.you()
    const id = you && weaponInSlot(you.arsenal, slot)
    if (id) this.selectWeapon(id, "slot")
  }

  private cycleWeapon(dir: 1 | -1) {
    const you = this.you()
    if (!you) return
    const order = pickerEntries(you.arsenal).map((e) => e.id)
    const i = order.indexOf(this.wanted)
    this.selectWeapon(order[(i + dir + order.length) % order.length], "cycle")
  }

  // ---------------------------------------------------------------- keys and overlays

  private key(code: string, down: boolean) {
    if (!this.running || this.chatting) return
    if (code === "Tab") {
      // With a menu open, Tab moves through it: the scoreboard stays shut.
      const open = down && this.overlay === "none"
      // Opening the scoreboard is a training's interface step: only a training takes the report.
      if (open && !this.boardOpen && this.room !== null && isTraining(this.room.mode)) this.d.net.send({ t: "report", a: "board" })
      this.boardOpen = open
      this.hud.board(this.board, this.me, open)
      return
    }
    if (!down) return
    if (code === "Escape") return this.escape()
    if (this.quickOpen && /^Digit\d$/.test(code)) {
      const n = Number(code.slice(5))
      const phrase = QUICK_CHAT[(n + 9) % 10]
      if (phrase) {
        this.d.net.send({ t: "chat", text: phrase })
        // Sending a quick phrase is a training's interface step.
        if (this.room !== null && isTraining(this.room.mode)) this.d.net.send({ t: "report", a: "phrases" })
      }
      this.toggleQuick(false)
      return
    }
    // Enter presses a menu's button: chat and phrases open only over the match itself.
    const playing = this.controls.active && this.overlay === "none"
    if (code === "KeyV" && playing) this.toggleQuick(!this.quickOpen)
    if ((code === "Enter" || code === "KeyT") && playing) this.openChat()
    if (code === "KeyB") this.openOverlay(this.overlay === "loadout" ? "none" : "loadout")
  }

  /** Options on the gamepad: opens the match menu, or closes it (one step at a time, like Esc). */
  private padPause() {
    if (!this.running || this.chatting) return
    if (this.overlay === "none") {
      if (document.pointerLockElement) document.exitPointerLock()
      this.openOverlay("pause")
    } else if (this.overlay === "pause") this.openOverlay("none")
    else this.escape()
  }

  /** Esc closes whatever is open, one step at a time. Only a click gives back the pointer lock. */
  private escape() {
    if (this.escapeInPopup) {
      this.escapeInPopup = false
      return
    }
    if (this.quickOpen) return this.toggleQuick(false)
    // The Esc that released the pointer lock opened the match menu: it must not close it too.
    if (this.overlay === "pause" && performance.now() - this.unlockedAt <= 300) return
    const next = afterEscape(this.overlay, this.loadoutFrom)
    if (next !== this.overlay) this.openOverlay(next)
  }

  private toggleQuick(on: boolean) {
    this.quickOpen = on
    const q = $("quickchat")
    q.classList.toggle("hidden", !on)
    const gloss = t().game.quickGloss
    // On touch the list takes taps: each row says the phrase as its number key would.
    q.classList.toggle("tap", on && this.controls.touchActive)
    if (on) q.innerHTML = QUICK_CHAT.map((p, i) => `<div data-n="${(i + 1) % 10}"><kbd>${(i + 1) % 10}</kbd>${esc(p)}${gloss ? ` <span class="muted">· ${gloss[i]}</span>` : ""}</div>`).join("")
  }

  private openChat() {
    this.chatting = true
    this.controls.enabled = false
    this.controls.releaseAll()
    const input = $<HTMLInputElement>("chat-input")
    input.classList.remove("hidden")
    input.value = ""
    setTimeout(() => input.focus(), 0)
  }

  private closeChat() {
    this.chatting = false
    this.controls.enabled = true
    const input = $<HTMLInputElement>("chat-input")
    input.blur()
    input.classList.add("hidden")
    if (!this.controls.active) this.controls.lock()
  }

  /** The settings form goes back into the main menu. */
  private restoreSettings() {
    const form = $("settings-form")
    if (form.parentElement?.id !== "settings-home") $("settings-home").append(form)
  }

  private openOverlay(which: MatchMenu) {
    const previous = this.overlay
    if (which === "loadout" && previous !== "loadout") this.loadoutFrom = previous === "pause" ? "pause" : "none"
    this.overlay = which
    if (which === "settings" && previous !== "settings") {
      // The same form as the main menu: same controls, saved and applied immediately.
      this.drawMenu(MENU_PARTS.settings[1], t().static.settings, `<div id="settings-slot" class="overlay-body"></div><div class="row overlay-actions"><button id="st-back">${t().static.back}</button></div>`)
      $("settings-slot").append($("settings-form"))
      $("st-back").onclick = () => this.openOverlay("pause")
    } else if (which !== "settings") this.restoreSettings()
    if (which === "pause" && previous !== "pause") this.renderPause(true)
    if (which === "loadout") {
      if (document.pointerLockElement) document.exitPointerLock()
      if (previous !== "loadout") this.renderLoadout()
    }
    this.showMenus(previous)
    this.syncPause()
  }

  /**
   * Closes every menu but the open one, then opens it with focus where `focusOnOpen` says. With
   * none open, focus leaves the menus: keys go back to the game.
   */
  private showMenus(previous: MatchMenu) {
    const active = document.activeElement
    for (const menu of MATCH_MENUS) {
      if (menu !== this.overlay) $<DialogElement>(MENU_PARTS[menu][0]).open = false
    }
    if (this.overlay === "none") {
      if (active instanceof HTMLElement && active.closest(OPENED_CONTENT)) active.blur()
      return
    }
    const [id, content] = MENU_PARTS[this.overlay]
    const dialog = $<DialogElement>(id)
    if (dialog.open) return
    this.openMenu(id, content, focusOnOpen(this.overlay, previous))
  }

  /**
   * Opens a menu's dialog with focus on `focus` (or its first control). UI SDK leaves focus on the
   * dialog itself when it opens right after a press; with a keyboard, a mouse or a pad it moves on
   * to the control, so Enter acts at once. On touch the dialog itself keeps it: no ring to show.
   */
  private openMenu(dialogId: string, contentId: string, focus: string | null) {
    const dialog = $<DialogElement>(dialogId)
    const content = $(contentId)
    content.setAttribute("initial-focus", focus ? `#${focus}` : "auto")
    dialog.addEventListener("openchangecomplete", () => {
      const active = document.activeElement
      // Opened by the match itself (the end screen), focus can still be outside: bring it in.
      if (active && content.contains(active) && (active !== content || !focus || this.controls.device === "touch")) return
      const target = (this.controls.device === "touch" ? null : focus && document.getElementById(focus)) || content
      target.focus()
    }, { once: true })
    dialog.open = true
  }

  /** A menu's title (the dialog's name, kept in place so UI SDK's labelling holds) and the rest of it. */
  private drawMenu(contentId: string, title: string, main: string, titleClass = "", color = "") {
    const content = $(contentId)
    const head = content.querySelector<HTMLElement>("ui-dialog-title")!
    head.innerHTML = title
    head.className = titleClass
    head.style.color = color
    content.querySelector(".overlay-main")!.innerHTML = main
  }

  private renderLoadout() {
    const lo = t().loadout
    this.drawMenu(MENU_PARTS.loadout[1], lo.title, `<div class="overlay-body"><p class="muted">${lo.note}</p><div class="weapons" id="loadout-list"></div></div><div class="row overlay-actions"><button id="lo-close" class="primary">${lo.resume}</button></div>`)
    this.d.menu.buildArmarie($("loadout-list"), (p) => {
      this.d.net.send({ t: "primary", p })
      // If I was holding the old primary, switch to the new one right away.
      const you = this.you()
      if (you?.alive && this.wanted === you.arsenal.primary && p !== this.wanted) {
        this.lastWeapon = this.wanted
        this.wanted = p
        this.wantedSeq = this.seq + 1
      }
    })
    $("lo-close").onclick = () => {
      this.openOverlay("none")
      this.controls.lock()
    }
  }

  /**
   * An Offline match stands still while a menu is open or the tab is hidden: the host stops
   * stepping and this client stops predicting. A room on the game server never pauses.
   */
  private syncPause() {
    const paused = this.running && this.room?.reach === "offline" && (this.overlay !== "none" || document.hidden)
    if (paused === this.clock.paused) return
    if (paused) this.clock.pause()
    else this.clock.resume()
    // Leaving the match is no resume: the room is already gone.
    if (this.running) this.d.net.send({ t: "pause", paused })
  }

  /** The match menu: drawn whole when it opens (or the host changes), else only what a room or phase update changes, so focus and the open skill list stay. */
  private renderPause(full = false) {
    const room = this.room
    if (!room) return
    // A training has no host tools and no teams to switch: its player is the host of nothing.
    const training = isTraining(room.mode)
    const host = room.hostId === this.me && !training
    if (full || host !== this.pauseHost) this.buildPause(room, host)
    const s = t()
    const p = s.pause
    // A training's menu has its station list in place of the roster.
    if (training) return
    $("p-roster").innerHTML = rosterHtml(room, this.me)
    $("p-team").textContent = p.switchTeam(s.teams[this.otherTeam()].name)
    if (!host) return
    $("p-start").textContent = (this.snap?.phase.tag ?? "Warmup") === "Warmup" ? p.start : p.restart
    const level = $<SelectElement>("p-level")
    if (level.value !== room.level) level.value = room.level
  }

  private otherTeam(): Team {
    return this.teams.get(this.me) === "benandanti" ? "malandanti" : "benandanti"
  }

  private buildPause(room: RoomInfo, host: boolean) {
    this.pauseHost = host
    const training = isTraining(room.mode)
    const el = $("pause")
    const s = t()
    const p = s.pause
    const ben = TEAM_INFO.benandanti.short
    const mal = TEAM_INFO.malandanti.short
    this.drawMenu(MENU_PARTS.pause[1], `${s.modes[room.mode].name} <small class="muted">· ${s.modes[room.mode].sub}</small>`, `
      <div class="overlay-body">
      ${
        // An Offline room (a training too) has no code and no invite link: nobody else can come in.
        training
          ? `<div class="muted pause-reach">${s.training.menuLine}</div>`
          : room.reach === "offline"
          ? `<div class="muted pause-reach">${p.reach.offline}</div>`
          : `<div class="pause-code">
        <div><div class="muted">${p.code}</div><div class="invite">${room.code}</div></div>
        <div class="pause-share"><button id="p-copy">${p.copy}</button><div class="muted pause-reach">${p.reach[room.reach]} · ${p.access[room.access]}</div></div>
      </div>`
      }
      ${training ? stationListHtml(stationEntries(this.snap?.training ?? null), s) : `<div class="roster" id="p-roster"></div>`}
      ${
        training
          ? ""
          : host
          ? `<div class="host-tools"><span class="host-label">👑 ${p.host}</span>
        <button id="p-start" class="primary"></button>
        <div class="host-bots">
          <button data-bot="benandanti:1">${p.addBot(ben)}</button><button data-bot="benandanti:-1">${p.removeBot(ben)}</button>
          <button data-bot="malandanti:1">${p.addBot(mal)}</button><button data-bot="malandanti:-1">${p.removeBot(mal)}</button>
        </div>
        <ui-select id="p-level" class="host-level" presentation="auto" default-value="${room.level}">
          <ui-select-label>${p.level}</ui-select-label>
          <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
          <ui-select-content class="select-list level-list">${BOT_LEVEL_IDS.map((l) => `<ui-select-item value="${l}">${s.levels[l].name}<ui-select-item-indicator aria-hidden="true">✓</ui-select-item-indicator></ui-select-item>`).join("")}</ui-select-content>
        </ui-select>
      </div>`
          : `<div class="muted host-only">${p.hostOnly}</div>`
      }
      </div>
      <div class="row overlay-actions">
        <button id="p-resume" class="primary">${s.loadout.resume}</button>
        ${training ? `<button id="p-restart"${this.snap?.training?.tag === "station" ? "" : " disabled"}>${s.training.restart}</button><button id="p-over">${s.training.startOver}</button>` : `<button id="p-team"></button>`}
        <button id="p-loadout">${s.loadout.title}</button>
        <button id="p-settings">${s.static.settings}</button>
        <button id="p-leave">${p.leave}</button>
      </div>`)
    $("p-resume").onclick = () => {
      this.openOverlay("none")
      this.controls.lock()
    }
    const team = document.getElementById("p-team")
    if (team) team.onclick = () => this.d.net.send({ t: "team", team: this.otherTeam() })
    $("p-loadout").onclick = () => this.openOverlay("loadout")
    $("p-leave").onclick = () => {
      this.d.net.send({ t: "leave" })
      this.d.onLeave()
    }
    const copy = document.getElementById("p-copy")
    if (copy)
      copy.onclick = () => {
        void navigator.clipboard?.writeText(inviteLink(this.d.inviteBase(), room.code, this.d.roomPassword()))
        copy.textContent = p.copied
      }
    $("p-settings").onclick = () => this.openOverlay("settings")
    if (training) this.bindTrainingMenu(el)
    if (!host) return
    $("p-start").onclick = () => {
      this.d.net.send({ t: "start" })
      this.openOverlay("none")
      this.controls.lock()
    }
    for (const b of el.querySelectorAll<HTMLButtonElement>("[data-bot]")) {
      b.onclick = () => {
        const [team, delta] = b.dataset.bot!.split(":")
        this.d.net.send({ t: "bot", team: team as Team, delta: Number(delta) as 1 | -1 })
      }
    }
    // The room's update sets the value back from code ("imperative"): only the host's own choice is sent.
    $<SelectElement>("p-level").addEventListener("valuechange", alwaysChosen((level, reason) => {
      if (reason !== "imperative") this.d.net.send({ t: "level", level: level as BotLevel })
    }))
  }

  /**
   * The training's match menu: a station from the list, restart this station, start over. Each
   * closes the menu, so the training resumes there. Starting over takes a second press: it
   * clears the saved progress.
   */
  private bindTrainingMenu(el: HTMLElement) {
    const resume = () => {
      this.openOverlay("none")
      this.controls.lock()
    }
    const goTo = (station: StationId) => {
      this.d.net.send({ t: "goTo", station })
      resume()
    }
    for (const b of el.querySelectorAll<HTMLButtonElement>("[data-station]")) b.onclick = () => goTo(b.dataset.station as StationId)
    $("p-restart").onclick = () => {
      const view = this.snap?.training
      if (view?.tag === "station") goTo(view.station)
    }
    const over = $("p-over")
    over.onclick = () => {
      if (!over.classList.contains("confirm")) {
        over.classList.add("confirm")
        over.textContent = t().training.startOverSure
        return
      }
      this.d.settings.training = FRESH_TRAINING
      this.d.saveSettings()
      this.d.net.send({ t: "startOver" })
      resume()
    }
  }

  /** Did I win (my team, or me alone in Tampieste)? */
  private won(winner: Winner) {
    return typeof winner === "object" ? winner.player === this.me : winner === this.teams.get(this.me)
  }

  /**
   * The training's completion screen, in the end screen's dialog: three ways on. Home leaves the
   * training; the one-tap match leaves it and starts the home screen's match at once; the station
   * list opens the training's match menu, where the stations are listed (#51).
   */
  private showTrainingComplete() {
    const tr = t().training
    this.trainingEnded = true
    if (document.pointerLockElement) document.exitPointerLock()
    this.controls.releaseAll()
    this.drawMenu(MENU_PARTS.end[1], tr.complete, `
      <div class="overlay-body"><p class="end-sub">${tr.completeSub}</p></div>
      <div class="row overlay-actions training-done">
        <button id="c-home">${tr.done.home}</button>
        <button id="c-stations">${tr.stationList}</button>
        <button id="c-play" class="primary">${t().static.oneTap}</button>
      </div>`, "end-title", "var(--gold)")
    const leave = () => {
      this.d.net.send({ t: "leave" })
      this.d.onLeave()
    }
    $("c-home").onclick = leave
    $("c-play").onclick = () => this.d.leaveForOneTap()
    $("c-stations").onclick = () => {
      this.trainingEnded = false
      $<DialogElement>(MENU_PARTS.end[0]).open = false
      this.openOverlay("pause")
    }
    this.openMenu(...MENU_PARTS.end, "c-play")
  }

  /**
   * The end screen: drawn whole and opened when the match ends (`full`), then only its results and
   * countdown are redrawn (every second and on each scoreboard), so its buttons and focus stay.
   */
  private renderEnd(full = false) {
    const s = this.snap
    if (!s || s.phase.tag !== "Over") return
    const host = this.room?.hostId === this.me
    const winner = s.phase.winner
    const en = t().end
    if (full) {
      const title = winner === "pari" ? en.draw : this.won(winner) ? en.win : en.lose
      const color = winner === "pari" ? "var(--gold)" : typeof winner === "object" ? (this.won(winner) ? "var(--gold)" : "#9fd0ff") : TEAM_INFO[winner].color
      this.drawMenu(MENU_PARTS.end[1], title, `
      <div class="overlay-body"><div id="e-results"></div><p class="muted end-restart" id="e-restart"></p></div>
      <div class="row overlay-actions"><button id="e-leave">${en.leave}</button><button id="e-again" class="primary"${host ? "" : " hidden"}>${en.again}</button></div>`, "end-title", color)
      $("e-leave").onclick = () => {
        this.d.net.send({ t: "leave" })
        this.d.onLeave()
      }
      $("e-again").onclick = () => this.d.net.send({ t: "start" })
    }
    // Not drawn yet (a scoreboard before the snapshot that ended the match): nothing to update.
    if (!document.getElementById("e-results")) return
    // Only the host can start another match: a player who becomes host gets the button, without a redraw.
    const again = $("e-again")
    if (again.hidden === host) {
      if (!host && document.activeElement === again) $("e-leave").focus()
      again.hidden = !host
    }
    const sub =
      winner === "pari" ? en.drawSub
      : typeof winner === "object" ? `${en.lastStanding(esc(winner.name))} · ${en.lastStandingSub}`
      : en.winSub(t().teams[winner].name, t().teams[winner].motto)
    const rows = [...this.board]
    const best = <K extends keyof BoardRow>(k: K) => rows.slice().sort((a, b) => (b[k] as number) - (a[k] as number))[0]
    const award = (title: string, row: BoardRow | undefined, value: string) =>
      `<div class="award"><b>${title}</b><span>${row ? esc(row.name) : "—"}</span><small>${row ? value : ""}</small></div>`
    const mvp = best("score")
    const killer = best("kills")
    const streak = best("best")
    const head = best("headshots")
    $("e-results").innerHTML = `
      <p class="end-sub">${sub}${this.room?.mode === "tampieste" ? "" : ` · ${s.score.benandanti} – ${s.score.malandanti}`}</p>
      <div class="awards">
        ${award(en.mvp[mvp?.team ?? "benandanti"], mvp, en.points(mvp?.score ?? 0))}
        ${award(en.killer, killer, en.kills(killer?.kills ?? 0))}
        ${award(en.streak, streak, en.row(streak?.best ?? 0))}
        ${award(en.head, head, en.heads(head?.headshots ?? 0))}
      </div>
      ${boardHtml(rows, this.me)}`
    $("e-restart").textContent = en.restartIn(Math.max(0, Math.ceil((s.phase.restarts - s.tick) / 60)))
    if (full) this.openMenu(...MENU_PARTS.end, endFocus(host))
  }

  // ---------------------------------------------------------------- fixed tick

  private speedScale() {
    const you = this.you()
    if (!you) return 1
    const a = you.arsenal
    return WEAPONS[this.wanted].moveScale * (a.sgnape > 0 ? 1.3 : 1) * (this.snap?.players.find((p) => p.id === this.me && p.f & FLAG_BIT.carrier) ? 0.9 : 1)
  }

  private fixedStep() {
    const c = this.controls
    const { mx, mz } = c.move()
    let buttons = c.buttons()
    const you = this.you()
    const over = this.snap?.phase.tag === "Over"
    if (over || this.overlay !== "none") buttons = 0
    // At the turret the view stays within the arc the gun can turn through.
    const turret = you?.alive ? this.mounted() : -1
    if (turret >= 0) {
      const aim = turretAim(this.physics.map.turrets[turret], c.yaw, c.pitch)
      c.yaw = aim.yaw
      c.pitch = aim.pitch
    }
    const input: PlayerInput = {
      seq: ++this.seq,
      mx: over ? 0 : mx,
      mz: over ? 0 : mz,
      yaw: c.yaw,
      pitch: Math.max(-1.5, Math.min(1.5, c.pitch)),
      buttons,
      weapon: this.wanted,
      view: Math.max(0, Math.floor(this.renderTick))
    }
    this.d.net.send({ t: "input", i: input })
    if (!you || !you.alive || over) return

    if (turret >= 0) {
      // In the seat behind the gun for this command's look, where the server puts me too: the eye
      // turns with the look at once, and mitraie shots leave from it, predicted like any other.
      this.predictor.hold(seatedBody(turretSeat(this.physics.map.turrets[turret], input.yaw)), input, this.speedScale())
      if (this.turretCooldown > 0) this.turretCooldown--
      const gun = this.snap?.turrets[turret]
      if ((buttons & BUTTON.fire) !== 0 && gun && !gun.jammed && this.turretCooldown === 0) {
        this.localShot("mitraie", input)
        this.turretCooldown = WEAPONS.mitraie.cooldownTicks
      }
      this.prevFire = (buttons & BUTTON.fire) !== 0
      return
    }

    const before = this.predictor.body
    this.predictor.apply(input, this.speedScale())
    const after = this.predictor.body
    if (before && after) {
      if (before.grounded && !after.grounded && after.vy > MOVE.jump * 0.8 && !this.predictor.launched) this.d.audio.play("jump", { volume: 0.5 })
      if (!this.wasGrounded && after.grounded && before.vy < -6) this.d.audio.play("land", { volume: Math.min(1, -before.vy / 16) })
      this.wasGrounded = after.grounded
      if (after.grounded) {
        this.stepAcc += Math.hypot(after.x - before.x, after.z - before.z)
        if (this.stepAcc > (after.crouch ? 3.5 : 2.3)) {
          this.stepAcc = 0
          this.d.audio.play("step", { volume: after.crouch ? 0.15 : 0.35, rate: 0.9 + Math.random() * 0.2 })
        }
      }
    }

    // Predicted shots: effects right away, the server decides the damage (with the same rules).
    if (this.localCooldown > 0) this.localCooldown--
    const def = WEAPONS[this.wanted]
    const fire = (buttons & BUTTON.fire) !== 0
    const pressedFire = fire && !this.prevFire
    this.prevFire = fire
    const action = you.arsenal.action._tag
    const busy = action === "reload" || (action === "switch" && you.arsenal.current === this.wanted)
    // While sprinting the weapon is lowered: as on the server, and it then takes a moment to raise it.
    const running = sprinting(input, after?.crouch ?? false)
    if (running) this.localCooldown = Math.max(this.localCooldown, RAISE_TICKS)
    if (def.spinTicks > 0) {
      const turning = fire && !running && !busy
      if (turning && this.localSpin === 0) this.d.audio.play("spin_mulin")
      this.localSpin = turning ? Math.min(def.spinTicks, this.localSpin + 1) : Math.max(0, this.localSpin - 2)
    } else this.localSpin = 0
    const mag = this.localMag ?? you.arsenal.ammo[this.wanted].mag
    const trigger = (def.mode === "auto" || def.mode === "beam" ? fire : pressedFire) && this.localSpin >= def.spinTicks
    if (trigger && this.localCooldown === 0 && !busy && you.arsenal.current === this.wanted) {
      if (def.mode !== "melee" && mag <= 0) {
        if (pressedFire) this.d.audio.play("dry")
      } else {
        this.localShot(def.id, input)
        this.localCooldown = def.cooldownTicks
        if (def.mode !== "melee") {
          this.shots.push(input.seq)
          this.localMag = mag - 1
        }
      }
    }
    const bomb = (buttons & BUTTON.bomb) !== 0
    const bombEdge = bomb && !this.prevBomb
    this.prevBomb = bomb
    if (bombEdge && you.arsenal.bombs > 0) {
      this.d.viewmodel.throwBomb()
      this.d.audio.play("throw")
    }
    const mine = (buttons & BUTTON.mine) !== 0
    if (mine && !this.prevMine && you.arsenal.mines > 0) this.d.viewmodel.throwBomb()
    this.prevMine = mine
  }

  private localShot(id: WeaponId, input: PlayerInput) {
    const { audio, fx, viewmodel } = this.d
    const physics = this.physics
    const def = WEAPONS[id]
    viewmodel.fire()
    this.sinceShot = 0
    this.kickPitch += def.kick
    this.controls.rumble(def.kick * 4, 0.15 + def.kick * 3, def.mode === "melee" ? 90 : 60)
    if (def.mode === "melee") {
      audio.play("melee_swing")
      return
    }
    if (def.mode === "projectile") {
      audio.play(def.shell === "gjaline" ? "launch_gjaline" : "launch_frico")
      return
    }
    if (def.mode === "beam") {
      // the jet: from the nozzle to the first body or wall within range
      audio.play("beam_miedi")
      const b = this.predictor.body
      if (!b) return
      const eye = { x: b.x, y: b.y + this.eye, z: b.z }
      const dir = lookDir(input.yaw, input.pitch)
      const wall = physics.raycast(eye, dir, def.range)
      let reach = wall ? wall.dist : def.range
      for (const [pid] of this.avatars) {
        const p = this.interpolated(pid)
        if (!p || !(p.f & FLAG_BIT.alive)) continue
        const hit = rayPose(eye, dir, { x: p.x, y: p.y, z: p.z, crouch: (p.f & FLAG_BIT.crouch) !== 0 })
        if (hit && hit.dist < reach) reach = hit.dist
      }
      const muzzle = this.muzzle()
      fx.tracer([muzzle.x, muzzle.y, muzzle.z], [eye.x + dir.x * reach, eye.y + dir.y * reach, eye.z + dir.z * reach], id)
      return
    }
    audio.play(SHOT_SOUND[id] ?? "shot_mandi")
    const b = this.predictor.body
    if (!b) return
    const eye = { x: b.x, y: b.y + this.eye, z: b.z }
    const muzzle = this.muzzle()
    const aiming = (input.buttons & BUTTON.aim) !== 0
    const spread = aiming ? def.spread.aimed : Math.hypot(b.vx, b.vz) > 1.5 ? def.spread.moving : def.spread.still
    for (let i = 0; i < def.pellets; i++) {
      const dir = lookDir(input.yaw + (Math.random() + Math.random() - 1) * spread, input.pitch + (Math.random() + Math.random() - 1) * spread)
      const wall = physics.raycast(eye, dir, def.range)
      let reach = wall ? wall.dist : def.range
      for (const [pid] of this.avatars) {
        const p = this.interpolated(pid)
        if (!p || !(p.f & FLAG_BIT.alive)) continue
        const hit = rayPose(eye, dir, { x: p.x, y: p.y, z: p.z, crouch: (p.f & FLAG_BIT.crouch) !== 0 })
        if (hit && hit.dist < reach) reach = hit.dist
      }
      const end: P3 = [eye.x + dir.x * reach, eye.y + dir.y * reach, eye.z + dir.z * reach]
      fx.tracer([muzzle.x, muzzle.y, muzzle.z], end, id)
    }
    fx.muzzle([muzzle.x, muzzle.y, muzzle.z])
  }

  /** Where my shots leave from: the mitraie's own muzzle on a turret, the carried weapon's otherwise. */
  private muzzle() {
    const turret = this.mounted()
    return turret >= 0 ? this.world.turretMuzzle(turret, new THREE.Vector3()) : this.d.viewmodel.muzzleWorld(new THREE.Vector3())
  }

  // ---------------------------------------------------------------- interpolation

  private interpolated(id: string): SnapOther | null {
    const frames = this.frames
    if (!frames.length) return null
    const t = this.renderTick
    let a = frames[0]
    let b = frames[frames.length - 1]
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i].tick <= t) {
        a = frames[i]
        b = frames[Math.min(i + 1, frames.length - 1)]
        break
      }
    }
    const pa = a.players.get(id)
    const pb = b.players.get(id)
    if (!pa || !pb) return pb ?? pa ?? null
    if (a === b || !(pa.f & FLAG_BIT.alive) !== !(pb.f & FLAG_BIT.alive)) return pb
    const k = Math.max(0, Math.min(1, (t - a.tick) / Math.max(1, b.tick - a.tick)))
    // A big jump (respawn, hay cart) is not interpolated.
    if (Math.hypot(pb.x - pa.x, pb.z - pa.z) > 6) return pb
    return {
      ...pb,
      x: pa.x + (pb.x - pa.x) * k,
      y: pa.y + (pb.y - pa.y) * k,
      z: pa.z + (pb.z - pa.z) * k,
      yaw: pa.yaw + wrapAngle(pb.yaw - pa.yaw) * k,
      pitch: pa.pitch + (pb.pitch - pa.pitch) * k
    }
  }

  // ---------------------------------------------------------------- frame

  frame(dt: number, t: number) {
    if (!this.running) return
    this.time = this.clock.now() / 1000
    const { camera, audio, viewmodel, fx, settings } = this.d
    const world = this.world
    if (this.offset !== null) this.renderTick = this.time * 60 + this.offset - INTERP_TICKS

    const paused = this.clock.paused
    this.controls.poll(dt, this.overlay === "none" && !this.chatting && this.snap?.phase.tag !== "Over" && !this.trainingEnded)
    // Paused: no commands, no prediction, and the paused time never reaches the fixed tick.
    if (!paused) {
      this.acc += Math.min(dt, 0.25)
      while (this.acc >= DT) {
        this.acc -= DT
        this.fixedStep()
      }
      this.predictor.decay(dt)
    }

    const s = this.snap
    const you = s?.you ?? null
    const myTeam = this.teams.get(this.me)

    // The others' avatars.
    if (s) {
      for (const p of s.players) {
        if (p.id === this.me) continue
        let entry = this.avatars.get(p.id)
        if (!entry) {
          const team = this.teams.get(p.id) ?? "benandanti"
          const avatar = this.d.createAvatar(team, this.names.get(p.id) ?? "?")
          this.castShadows(avatar)
          const blob = new THREE.Mesh(this.blobGeo, this.blobMat)
          blob.renderOrder = 1
          this.d.scene.add(avatar.object, blob)
          entry = { avatar, blob, team, stepAcc: 0, last: null }
          this.avatars.set(p.id, entry)
        }
        const q = this.interpolated(p.id) ?? p
        entry.avatar.setLabelVisible(entry.team === myTeam)
        entry.avatar.update(dt, {
          x: q.x,
          y: q.y,
          z: q.z,
          yaw: q.yaw,
          pitch: q.pitch,
          vx: q.vx,
          vz: q.vz,
          crouch: (q.f & FLAG_BIT.crouch) !== 0,
          grounded: (q.f & FLAG_BIT.grounded) !== 0,
          alive: (q.f & FLAG_BIT.alive) !== 0,
          weapon: q.w,
          firing: (q.f & FLAG_BIT.firing) !== 0,
          shield: (q.f & FLAG_BIT.shield) !== 0,
          carrier: (q.f & FLAG_BIT.carrier) !== 0,
          sgnape: (q.f & FLAG_BIT.sgnape) !== 0
        })
        entry.blob.visible = !this.dynamicShadows && (q.f & FLAG_BIT.alive) !== 0
        if (entry.blob.visible) {
          // The disc sits on the ground under the feet: it shrinks while airborne.
          const ground = this.physics.raycast({ x: q.x, y: q.y + 0.3, z: q.z }, { x: 0, y: -1, z: 0 }, 12)
          const gy = ground ? q.y + 0.3 - ground.dist : q.y
          const h = Math.max(0, q.y - gy)
          entry.blob.position.set(q.x, gy + 0.03, q.z)
          entry.blob.scale.setScalar(Math.max(0.3, 1 - h * 0.12))
        }
        if (entry.last && q.f & FLAG_BIT.grounded && q.f & FLAG_BIT.alive) {
          entry.stepAcc += Math.hypot(q.x - entry.last.x, q.z - entry.last.z)
          if (entry.stepAcc > 2.4) {
            entry.stepAcc = 0
            audio.play("step", { at: [q.x, q.y, q.z], volume: 0.5, rate: 0.85 + Math.random() * 0.3 })
          }
        }
        entry.last = { x: q.x, z: q.z }
      }
    }

    // Camera.
    const c = this.controls
    this.kickPitch *= Math.exp(-dt * 9)
    const turret = you?.alive ? this.mounted() : -1
    const aiming = c.isHeld("aim") && !!you?.alive
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * Math.min(1, dt * 12)
    const reload = this.ownReload
    // The reload is over once its time has run out and the server has finished it too (its magazine is then the new one).
    if (reload && (!you?.alive || reload.weapon !== this.wanted || (this.time - reload.at >= reload.seconds && you.arsenal.action._tag !== "reload")))
      this.ownReload = null
    if (!paused) this.sinceShot += dt
    // The reload's one clock: the animation, the clucks and the hen at the mouth all read this.
    const own = this.ownReload
    const reloadProgress = own && Math.min(1, (this.time - own.at) / own.seconds)
    const spot = turret >= 0 ? this.physics.map.turrets[turret] : undefined
    const view = firstPerson({
      chosen: this.wanted,
      mount: spot ? { turret, spot } : null,
      look: { yaw: c.yaw, pitch: c.pitch },
      sinceShot: this.sinceShot,
      alive: !!you?.alive,
      aim: this.aimBlend,
      baseFov: settings.fov,
      aspect: camera.aspect,
      mag: you ? (this.localMag ?? you.arsenal.ammo[this.wanted].mag) : 0,
      reserve: you?.arsenal.ammo[this.wanted].reserve ?? 0,
      reload: own && reloadProgress !== null ? { progress: reloadProgress, mag: own.mag, reserve: own.reserve } : null
    })
    if (this.ownReload && view.hensIn > this.ownReload.hensIn) {
      audio.play("cluck_gjaline")
      this.ownReload.hensIn = view.hensIn
    }
    const inHand = view.inHand
    const def = WEAPONS[inHand]
    camera.fov = view.fov
    if (you?.arsenal.sgnape) camera.fov += Math.sin(t * 2.3) * 2
    camera.updateProjectionMatrix()
    c.zoomScale = view.lookScale
    this.hud.scope(view.scope)
    viewmodel.setVisible(view.drawWeapon)

    const b = this.predictor.body
    // On a turret the eye sits in the seat for this frame's look; on foot, between the last two predicted ticks.
    const seat = view.mitraie?.seat
    const drawn = seat ? { x: seat[0], y: seat[1], z: seat[2] } : this.predictor.render(this.acc / DT)
    if (you?.alive && b && drawn) {
      this.eye += ((b.crouch ? EYE_CROUCH : EYE_STAND) - this.eye) * Math.min(1, dt * 14)
      const sm = this.predictor.smooth
      const shakeAmp = this.shake * 0.08
      this.shake *= Math.exp(-dt * 5)
      camera.position.set(
        drawn.x + sm.x + (Math.random() - 0.5) * shakeAmp,
        drawn.y + sm.y + this.eye + (Math.random() - 0.5) * shakeAmp,
        drawn.z + sm.z + (Math.random() - 0.5) * shakeAmp
      )
      const roll = you.arsenal.sgnape > 0 ? Math.sin(t * 1.7) * 0.06 : 0
      camera.rotation.set(c.pitch + this.kickPitch, c.yaw, roll, "YXZ")
    } else if (you && b) {
      // When dead: the camera rises and looks at whoever made frico of you.
      const killer = you.killer ? this.interpolated(you.killer) : null
      this.deathLook.set(killer?.x ?? b.x, (killer?.y ?? b.y) + 1.2, killer?.z ?? b.z - 1)
      camera.position.lerp(this.deathCam.set(b.x, b.y + 4.5, b.z), Math.min(1, dt * 2))
      camera.lookAt(this.deathLook)
    }
    camera.updateMatrixWorld()

    const lookDx = c.lookDx
    const lookDy = c.lookDy
    c.lookDx = 0
    c.lookDy = 0
    if (you) {
      if (this.shownWeapon !== inHand) {
        this.shownWeapon = inHand
        viewmodel.setWeapon(inHand)
      }
      viewmodel.update(dt, {
        speed: b ? Math.hypot(b.vx, b.vz) : 0,
        grounded: b?.grounded ?? true,
        aiming,
        sprinting: turret < 0 && sprinting({ ...IDLE_INPUT, mz: c.move().mz, buttons: c.heldButtons() }, b?.crouch ?? false),
        crouch: b?.crouch ?? false,
        lookDx,
        lookDy,
        sgnape: you.arsenal.sgnape > 0,
        spin: def.spinTicks > 0 ? this.localSpin / def.spinTicks : 0,
        henAtMouth: view.henAtMouth,
        reloadHens: view.reloadHens,
        reload: own?.weapon === inHand ? reloadProgress : null
      })
    }

    // World, effects, audio.
    if (s) {
      const mode = this.room?.mode
      const bases = this.physics.map.flagBases
      const flagPos = (team: Team): { pos: P3; state: "base" | "carried" | "dropped" } => {
        const f = s.flags[team]
        if (f._tag === "base") return { pos: bases[team], state: "base" }
        if (f._tag === "dropped") return { pos: [f.x, f.y, f.z], state: "dropped" }
        const carrier = f.by === this.me && b ? { x: b.x, y: b.y, z: b.z } : this.interpolated(f.by)
        return { pos: carrier ? [carrier.x, carrier.y + 2.1, carrier.z] : bases[team], state: "carried" }
      }
      world.update(dt, t, {
        pickups: [...s.pickups].map((ch) => ch === "1"),
        // The markers of the objective in force only: the mode's in a room, the current step's in a training.
        flags: s.objective === "frico" ? { benandanti: flagPos("benandanti"), malandanti: flagPos("malandanti") } : null,
        hill: s.objective === "placute" ? { owner: s.hill.owner, contested: s.hill.contested } : null,
        cart: s.cart ? { at: s.cart.at, yaw: s.cart.yaw, contested: s.cart.contested, pushers: s.cart.pushers } : null,
        storm: s.storm,
        turrets: s.turrets.map((tu, i): TurretVisual => {
          const mine = tu.gunner === this.me
          const gunner = tu.gunner && !mine ? this.interpolated(tu.gunner) : null
          const pose = view.mitraie?.turret === i ? view.mitraie : null
          return {
            yaw: pose ? pose.yaw : mine ? c.yaw : gunner?.yaw ?? 0,
            pitch: pose ? pose.pitch : mine ? c.pitch : gunner?.pitch ?? 0,
            heat: tu.heat,
            jammed: tu.jammed,
            manned: tu.gunner !== null,
            mine: pose !== null,
            recoil: pose?.recoil ?? 0
          }
        }),
        doors: s.doors.map((hp, i) => hp / (this.physics.map.doors[i]?.hp ?? 1)),
        gates: this.gates,
        camera
      })
      // The casot's disco: audible only nearby, and muffled while the door is closed.
      audio.disco(this.room?.map === "maran" ? DISCO : null, (s.doors[0] ?? 1) <= 0)
      fx.projectiles(s.proj)
      const outside = !!s.storm && !!you?.alive && !!b && outsideStorm(s.storm, b)
      this.hud.spectating = mode === "tampieste" && s.phase.tag === "Live"
      this.hud.top(s, mode ?? "bataie", this.names, this.controls.device, outside)
      this.hud.training(s.training, this.controls.device)
      // A step this device cannot perform: shown as such, then the host is told, and completes it.
      const unavailable = this.unavailableSteps.check(s.training, this.controls.device, performance.now())
      if (unavailable) this.d.net.send(unavailable)
      this.hud.death(you, this.names, Math.floor(this.seed / 7))
      if (s.phase.tag === "Over" && Math.floor(t) !== Math.floor(t - dt)) this.renderEnd()
    }
    fx.update(dt, camera)
    audio.setListener([camera.position.x, camera.position.y, camera.position.z], c.yaw)

    if (you) {
      this.hud.vitals(you, { owned: (id) => owned(you.arsenal, id) }, this.wanted === you.arsenal.current ? this.localMag : null, turret >= 0)
      // At the turret: the heat. Near a free one: the key to mount it (the same decision as the touch "use" button).
      const gun = turret >= 0 ? s?.turrets[turret] ?? null : null
      this.hud.turret(gun ? { heat: gun.heat, jammed: gun.jammed } : null, this.controls.turretControl === "use", this.controls.device)
      const speed = b ? Math.hypot(b.vx, b.vz) : 0
      const spread = aiming ? def.spread.aimed : speed > 1.5 || !b?.grounded ? def.spread.moving : def.spread.still
      const px = (Math.tan(spread) / Math.tan(((camera.fov / 2) * Math.PI) / 180)) * (innerHeight / 2)
      this.hud.crosshair(Math.min(60, px * 1.6), view.crosshair)
    }
    const free = this.overlay === "none" && !this.chatting && s?.phase.tag !== "Over" && !this.trainingEnded
    const device = this.controls.device
    this.hud.clickToPlay(!this.controls.active && free && !this.boardOpen, device)
    this.hud.layFor(device)
    this.hud.touchShown(this.controls.touchActive && free)
  }

  /** Out of a match, every frame: the page still follows the device the player holds (the menu's key hints). */
  menuFrame() {
    this.hud.layFor(this.controls.device)
  }

  render() {
    const { renderer, look, scene, camera, viewmodel } = this.d
    renderer.info.reset()
    look.render(scene, camera, viewmodel)
  }
}
