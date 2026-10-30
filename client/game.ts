/**
 * La partita in corso sul client: ingressi a tick fissi, predizione del proprio
 * corpo, interpolazione degli altri, eventi → suoni ed effetti, HUD e overlay.
 */
import * as THREE from "three"
import { BOT_LEVEL_IDS, QUICK_CHAT, TEAM_INFO, type BotLevel } from "../shared/folklore.ts"
import { rayPose } from "../shared/hitbox.ts"
import { BUTTON, type PlayerInput } from "../shared/input.ts"
import { FLAG_BASES, PICKUPS, type Team } from "../shared/map.ts"
import { DT, EYE_CROUCH, EYE_STAND, lookDir, MOVE } from "../shared/movement.ts"
import type { PhysicsWorld } from "../shared/physics.ts"
import { FLAG_BIT, type BoardRow, type RoomInfo, type ServerMessage, type SnapOther, type Snapshot } from "../shared/protocol.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { owned } from "../shared/sim/rules.ts"
import { WEAPONS, type WeaponId } from "../shared/weapons.ts"
import type { Avatar, Fx, GameAudio, P3, SoundName, Viewmodel, WorldScene } from "./contracts.ts"
import { Controls } from "./controls.ts"
import { boardHtml, esc, Hud, rosterHtml } from "./hud.ts"
import { t } from "./i18n.ts"
import type { Menu } from "./menu.ts"
import type { Net } from "./net.ts"
import { Predictor } from "./predict.ts"
import type { Settings } from "./settings.ts"

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const INTERP_TICKS = 6
const SHOT_SOUND: Partial<Record<WeaponId, SoundName>> = {
  mandi: "shot_mandi",
  cramar: "shot_cramar",
  doplete: "shot_doplete",
  cjampanili: "shot_cjampanili"
}
const PICK_SOUND = {
  frico: "pickup_frico",
  gubane: "pickup_gubane",
  sgnape: "pickup_sgnape",
  munizions: "pickup_munizions",
  lanciafrico: "pickup_lanciafrico"
} as const satisfies Record<(typeof PICKUPS)[number]["kind"], SoundName>

export interface GameDeps {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly world: WorldScene
  readonly audio: GameAudio
  readonly fx: Fx
  readonly viewmodel: Viewmodel
  readonly physics: PhysicsWorld
  readonly net: Net
  readonly settings: Settings
  readonly menu: Menu
  readonly createAvatar: (team: Team, name: string) => Avatar
  readonly saveSettings: () => void
  readonly onLeave: () => void
  /** Origine e percorso per i link d'invito (l'indirizzo pubblico se si gioca da localhost). */
  readonly inviteBase: () => string
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
  private room: RoomInfo | null = null
  private me = ""
  private snap: Snapshot | null = null
  private frames: Frame[] = []
  private offset: number | null = null
  private acc = 0
  private seq = 0
  private wanted: WeaponId = "cramar"
  private lastWeapon: WeaponId = "mandi"
  /** Primo comando che porta l'arma scelta: finché il server non l'ha visto, il cambio è in viaggio. */
  private wantedSeq = 0
  private shownWeapon: WeaponId | null = null
  private localCooldown = 0
  private localMag: number | null = null
  private shots: number[] = []
  private prevFire = false
  private prevBomb = false
  private avatars = new Map<string, { avatar: Avatar; blob: THREE.Mesh; team: Team; stepAcc: number; last: { x: number; z: number } | null }>()
  /** Ombre vere dei giocatori solo in qualità alta; altrimenti un disco scuro ai piedi. */
  private dynamicShadows = false
  private snapArrivals: number[] = []
  private names = new Map<string, string>()
  private teams = new Map<string, Team>()
  private board: readonly BoardRow[] = []
  private boardOpen = false
  private chatting = false
  private quickOpen = false
  private overlay: "none" | "pause" | "loadout" = "none"
  /** Da dove si è aperta l'armeria: Esc ci torna. */
  private loadoutFrom: "none" | "pause" = "none"
  /** Quando il browser ha tolto il blocco del mouse: lo stesso Esc non deve anche chiudere la pausa. */
  private unlockedAt = 0
  private eye = EYE_STAND
  private stepAcc = 0
  private wasGrounded = true
  private wasAlive = false
  private shake = 0
  private aimBlend = 0
  private kickPitch = 0
  private seed = 1
  private lastPhase = ""
  private renderTick = 0
  private time = 0
  private running = false
  private readonly blobGeo = new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2)
  private readonly blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
  private readonly deathCam = new THREE.Vector3()
  private readonly deathLook = new THREE.Vector3()

  constructor(private readonly d: GameDeps) {
    this.predictor = new Predictor(d.physics)
    this.controls = new Controls(d.renderer.domElement, {
      onSlot: (slot) => this.selectSlot(slot),
      onLastWeapon: () => this.selectWeapon(this.lastWeapon),
      onWheel: (dir) => this.cycleWeapon(dir),
      onKey: (code, down) => this.key(code, down)
    })
    d.renderer.domElement.addEventListener("click", () => {
      if (this.running && this.overlay === "none" && !this.chatting) this.controls.lock()
    })
    document.addEventListener("pointerlockchange", () => {
      if (!this.running) return
      const locked = document.pointerLockElement === d.renderer.domElement
      if (!locked) this.unlockedAt = performance.now()
      if (!locked && this.overlay === "none" && !this.chatting && this.snap?.phase.tag !== "Over") this.openOverlay("pause")
      if (locked && this.overlay !== "none") this.openOverlay("none")
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
    // Solo in sviluppo: i test automatici pilotano il giocatore senza pointer lock.
    if (import.meta.env.DEV) Object.assign(window, { __sparedut: { controls: this.controls, game: this } })
  }

  // ---------------------------------------------------------------- ciclo di vita

  start(room: RoomInfo, me: string) {
    this.running = true
    this.room = room
    this.me = me
    this.snap = null
    this.frames = []
    this.offset = null
    this.predictor.reset()
    this.wanted = this.d.settings.primary
    this.wantedSeq = 0
    this.shownWeapon = null
    this.applySettings()
    this.updateRoster(room)
    this.hud.show(true)
    this.d.viewmodel.setVisible(true)
    this.openOverlay("none")
    this.controls.lock()
    this.hud.announce(t().modes[room.mode].name, t().modes[room.mode].rules)
  }

  stop() {
    this.running = false
    for (const a of this.avatars.values()) {
      this.d.scene.remove(a.avatar.object, a.blob)
      a.avatar.dispose()
    }
    this.avatars.clear()
    this.hud.show(false)
    this.openOverlay("none")
    this.d.viewmodel.setVisible(false)
    if (document.pointerLockElement) document.exitPointerLock()
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
  }

  // ---------------------------------------------------------------- rete

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
  }

  private onSnapshot(s: Snapshot) {
    this.snapArrivals.push(performance.now())
    if (this.snapArrivals.length > 31) this.snapArrivals.shift()
    const now = performance.now() / 1000
    const target = s.tick - now * 60
    if (this.offset === null || Math.abs(target - this.offset) > 30) this.offset = target
    // L'orologio degli altri si sposta piano: un'istantanea in anticipo o in ritardo
    // non deve accelerare o frenare tutti i giocatori disegnati.
    else this.offset += (target - this.offset) * (target > this.offset ? 0.05 : 0.01)
    const players = new Map(s.players.map((p) => [p.id, p]))
    this.frames.push({ tick: s.tick, players })
    while (this.frames.length > 40) this.frames.shift()

    const prev = this.snap
    this.snap = s
    const you = s.you
    if (you) {
      const mine = players.get(this.me)
      if (you.alive && !this.wasAlive) {
        // Rinascita: corpo e sguardo dal server.
        this.predictor.reset()
        this.predictor.body = you.body
        if (mine) {
          this.controls.yaw = mine.yaw
          this.controls.pitch = 0
        }
        this.wanted = you.arsenal.current
        this.localMag = null
      } else if (you.alive) {
        if (!this.predictor.body) this.predictor.body = you.body
        else this.predictor.reconcile(you.body, you.seq, true)
      }
      this.wasAlive = you.alive
      // Il server ha già visto il mio ultimo cambio d'arma e ne impugna un'altra: l'ha
      // cambiata lui (raccolta del lanciafrico, armeria, rinascita) o ha rifiutato il cambio. Lo seguo.
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
      this.renderEnd()
    } else {
      $("endscreen").classList.add("hidden")
      if (tag === "Live" && this.overlay === "none") this.controls.lock()
    }
  }

  // ---------------------------------------------------------------- eventi

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
        fx.muzzle(muzzle)
        this.avatars.get(e.s)?.avatar.flash()
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
        if (e.s === me) return
        const at = this.posOf(e.s)
        if (at) audio.play(e.k === "frico" ? "launch_frico" : "throw", { at })
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
        const down = this.d.physics.raycast({ x: e.p[0], y: e.p[1] + 0.3, z: e.p[2] }, { x: 0, y: -1, z: 0 }, 4)
        fx.explosion(e.p, e.k, down ? e.p[1] + 0.3 - down.dist : null)
        audio.play("boom", { at: e.p })
        const b = this.predictor.body
        if (b) {
          const d = Math.hypot(e.p[0] - b.x, e.p[1] - b.y, e.p[2] - b.z)
          this.shake = Math.min(1.6, this.shake + Math.max(0, 1.4 - d / 22))
        }
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
        if (this.room?.mode === "culine") this.hud.announce(e.team ? t().game.hillTaken(t().teams[e.team].name) : t().hud.hillFree)
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
        if (e.s === me) this.d.viewmodel.reload(WEAPONS[e.w].reloadTicks / 60)
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
          this.hud.announce(t().game.start, t().game.startSub)
        } else {
          const myTeam = this.teams.get(me)
          audio.play(e.winner === myTeam ? "victory" : "defeat")
        }
        return
    }
  }

  // ---------------------------------------------------------------- armi

  private you() {
    return this.snap?.you ?? null
  }

  private selectWeapon(id: WeaponId) {
    const you = this.you()
    if (!you || !owned(you.arsenal, id) || id === this.wanted) return
    this.lastWeapon = this.wanted
    this.wanted = id
    this.wantedSeq = this.seq + 1
    this.localCooldown = 18
    this.localMag = null
    this.d.audio.play("switch", { volume: 0.6 })
  }

  private selectSlot(slot: 1 | 2 | 3 | 4) {
    if (this.quickOpen) return
    const you = this.you()
    if (!you) return
    const id: WeaponId = slot === 1 ? you.arsenal.primary : slot === 2 ? "mandi" : slot === 3 ? "lanciafrico" : "mescul"
    this.selectWeapon(id)
  }

  private cycleWeapon(dir: 1 | -1) {
    const you = this.you()
    if (!you) return
    const order = ([you.arsenal.primary, "mandi", "lanciafrico", "mescul"] as WeaponId[]).filter((id) => owned(you.arsenal, id))
    const i = order.indexOf(this.wanted)
    this.selectWeapon(order[(i + dir + order.length) % order.length])
  }

  // ---------------------------------------------------------------- tasti e overlay

  private key(code: string, down: boolean) {
    if (!this.running || this.chatting) return
    if (code === "Tab") {
      this.boardOpen = down
      this.hud.board(this.board, this.me, down)
      return
    }
    if (!down) return
    if (code === "Escape") return this.escape()
    if (this.quickOpen && /^Digit\d$/.test(code)) {
      const n = Number(code.slice(5))
      const phrase = QUICK_CHAT[(n + 9) % 10]
      if (phrase) this.d.net.send({ t: "chat", text: phrase })
      this.toggleQuick(false)
      return
    }
    if (code === "KeyV" && this.controls.locked) this.toggleQuick(!this.quickOpen)
    if ((code === "Enter" || code === "KeyT") && this.controls.locked) this.openChat()
    if (code === "KeyB") this.openOverlay(this.overlay === "loadout" ? "none" : "loadout")
  }

  /** Esc chiude quel che è aperto, un passo alla volta. Il blocco del mouse lo ridà solo un clic. */
  private escape() {
    if (this.quickOpen) this.toggleQuick(false)
    else if (this.overlay === "loadout") this.openOverlay(this.loadoutFrom)
    else if (this.overlay === "pause" && performance.now() - this.unlockedAt > 300) this.openOverlay("none")
  }

  private toggleQuick(on: boolean) {
    this.quickOpen = on
    const q = $("quickchat")
    q.classList.toggle("hidden", !on)
    const gloss = t().game.quickGloss
    if (on) q.innerHTML = QUICK_CHAT.map((p, i) => `<div><kbd>${(i + 1) % 10}</kbd>${esc(p)}${gloss ? ` <span class="muted">· ${gloss[i]}</span>` : ""}</div>`).join("")
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
    if (!this.controls.locked) this.controls.lock()
  }

  private openOverlay(which: "none" | "pause" | "loadout") {
    if (which === "loadout" && this.overlay !== "loadout") this.loadoutFrom = this.overlay === "pause" ? "pause" : "none"
    this.overlay = which
    $("pause").classList.toggle("hidden", which !== "pause")
    $("loadout").classList.toggle("hidden", which !== "loadout")
    if (which === "pause") this.renderPause()
    if (which === "loadout") {
      if (document.pointerLockElement) document.exitPointerLock()
      const el = $("loadout")
      const lo = t().loadout
      el.innerHTML = `<h2>${lo.title}</h2><p class="muted">${lo.note}</p><div class="weapons" id="loadout-list"></div><div class="row"><button id="lo-close" class="primary">${lo.resume}</button></div>`
      this.d.menu.buildArmarie($("loadout-list"), (p) => {
        this.d.net.send({ t: "primary", p })
        // Se avevo in mano la vecchia principale, impugno subito la nuova.
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
  }

  private renderPause() {
    const room = this.room
    if (!room) return
    const host = room.hostId === this.me
    const el = $("pause")
    const link = `${this.d.inviteBase()}?p=${room.code}`
    const myTeam = this.teams.get(this.me)
    const other: Team = myTeam === "benandanti" ? "malandanti" : "benandanti"
    const phase = this.snap?.phase.tag ?? "Warmup"
    const s = t()
    const p = s.pause
    el.innerHTML = `
      <h2>${s.modes[room.mode].name} <small class="muted">· ${s.modes[room.mode].sub}</small></h2>
      <div class="row" style="align-items:center;justify-content:space-between">
        <div><div class="muted">${p.code}</div><div class="invite">${room.code}</div></div>
        <div style="text-align:right"><button id="p-copy">${p.copy}</button><div class="muted" style="font-size:12px;margin-top:4px">${room.visibility === "lan" ? p.visLan : p.visCode}</div></div>
      </div>
      <div class="roster">${rosterHtml(room, this.me)}</div>
      ${
        host
          ? `<div class="host-tools">👑 Host:
        <button id="p-start" class="primary">${phase === "Warmup" ? p.start : p.restart}</button>
        <button data-bot="benandanti:1">+ bot ${TEAM_INFO.benandanti.short}</button><button data-bot="benandanti:-1">− bot ${TEAM_INFO.benandanti.short}</button>
        <button data-bot="malandanti:1">+ bot ${TEAM_INFO.malandanti.short}</button><button data-bot="malandanti:-1">− bot ${TEAM_INFO.malandanti.short}</button>
        <label class="inline-field">${p.level} <select id="p-level">${BOT_LEVEL_IDS.map((l) => `<option value="${l}"${l === room.level ? " selected" : ""}>${s.levels[l].name}</option>`).join("")}</select></label>
      </div>`
          : `<div class="muted" style="margin-top:8px">${p.hostOnly}</div>`
      }
      <div class="row">
        <button id="p-resume" class="primary">${s.loadout.resume}</button>
        <button id="p-team">${p.switchTeam(s.teams[other].name)}</button>
        <button id="p-loadout">${s.loadout.title}</button>
        <button id="p-leave">${p.leave}</button>
      </div>
      <label class="field" style="margin-top:10px"><span>${p.sens}</span><input type="range" id="p-sens" min="0.2" max="3" step="0.05" value="${this.d.settings.sensitivity}" /></label>`
    $("p-resume").onclick = () => {
      this.openOverlay("none")
      this.controls.lock()
    }
    $("p-team").onclick = () => this.d.net.send({ t: "team", team: other })
    $("p-loadout").onclick = () => this.openOverlay("loadout")
    $("p-leave").onclick = () => {
      this.d.net.send({ t: "leave" })
      this.d.onLeave()
    }
    $("p-copy").onclick = () => {
      void navigator.clipboard?.writeText(link)
      $("p-copy").textContent = p.copied
    }
    $<HTMLInputElement>("p-sens").oninput = (e) => {
      this.d.settings.sensitivity = Number((e.target as HTMLInputElement).value)
      this.d.saveSettings()
      this.applySettings()
    }
    if (host) {
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
      $<HTMLSelectElement>("p-level").onchange = (e) => this.d.net.send({ t: "level", level: (e.target as HTMLSelectElement).value as BotLevel })
    }
  }

  private renderEnd() {
    const s = this.snap
    if (!s || s.phase.tag !== "Over") return
    const el = $("endscreen")
    el.classList.remove("hidden")
    const winner = s.phase.winner
    const myTeam = this.teams.get(this.me)
    const en = t().end
    const title = winner === "pari" ? en.draw : winner === myTeam ? en.win : en.lose
    const sub = winner === "pari" ? en.drawSub : en.winSub(t().teams[winner].name, t().teams[winner].motto)
    const rows = [...this.board]
    const best = <K extends keyof BoardRow>(k: K) => rows.slice().sort((a, b) => (b[k] as number) - (a[k] as number))[0]
    const award = (title: string, row: BoardRow | undefined, value: string) =>
      `<div class="award"><b>${title}</b><span>${row ? esc(row.name) : "—"}</span><small>${row ? value : ""}</small></div>`
    const mvp = best("score")
    const killer = best("kills")
    const streak = best("best")
    const head = best("headshots")
    el.innerHTML = `
      <h1 class="end-title" style="color:${winner === "pari" ? "var(--gold)" : TEAM_INFO[winner].color}">${title}</h1>
      <p style="text-align:center;font-family:var(--serif);font-style:italic">${sub} · ${s.score.benandanti} – ${s.score.malandanti}</p>
      <div class="awards">
        ${award(en.mvp[mvp?.team ?? "benandanti"], mvp, en.points(mvp?.score ?? 0))}
        ${award(en.killer, killer, en.kills(killer?.kills ?? 0))}
        ${award(en.streak, streak, en.row(streak?.best ?? 0))}
        ${award(en.head, head, en.heads(head?.headshots ?? 0))}
      </div>
      ${boardHtml(rows, this.me)}
      <p class="muted" style="text-align:center">${en.restartIn(Math.max(0, Math.ceil((s.phase.restarts - s.tick) / 60)))}</p>
      <div class="row"><button id="e-leave">${en.leave}</button>${this.room?.hostId === this.me ? `<button id="e-again" class="primary">${en.again}</button>` : ""}</div>`
    $("e-leave").onclick = () => {
      this.d.net.send({ t: "leave" })
      this.d.onLeave()
    }
    const again = document.getElementById("e-again")
    if (again) again.onclick = () => this.d.net.send({ t: "start" })
  }

  // ---------------------------------------------------------------- tick fisso

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

    // Spari predetti: effetti subito, il danno lo decide il server.
    if (this.localCooldown > 0) this.localCooldown--
    const def = WEAPONS[this.wanted]
    const fire = (buttons & BUTTON.fire) !== 0
    const pressedFire = fire && !this.prevFire
    this.prevFire = fire
    const action = you.arsenal.action._tag
    const busy = action === "reload" || (action === "switch" && you.arsenal.current === this.wanted)
    const mag = this.localMag ?? you.arsenal.ammo[this.wanted].mag
    const trigger = def.mode === "auto" ? fire : pressedFire
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
  }

  private localShot(id: WeaponId, input: PlayerInput) {
    const { audio, fx, viewmodel, physics } = this.d
    const def = WEAPONS[id]
    viewmodel.fire()
    this.kickPitch += def.kick
    if (def.mode === "melee") {
      audio.play("melee_swing")
      return
    }
    if (def.mode === "projectile") {
      audio.play("launch_frico")
      return
    }
    audio.play(SHOT_SOUND[id] ?? "shot_mandi")
    const b = this.predictor.body
    if (!b) return
    const eye = { x: b.x, y: b.y + this.eye, z: b.z }
    const muzzle = viewmodel.muzzleWorld(new THREE.Vector3())
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

  // ---------------------------------------------------------------- interpolazione

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
    // Un salto grande (rinascita, cjar di fen) non si interpola.
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
    this.time = t
    const { camera, audio, viewmodel, world, fx, settings } = this.d
    const now = performance.now() / 1000
    if (this.offset !== null) this.renderTick = now * 60 + this.offset - INTERP_TICKS

    this.acc += Math.min(dt, 0.25)
    while (this.acc >= DT) {
      this.acc -= DT
      this.fixedStep()
    }
    this.predictor.decay(dt)

    const s = this.snap
    const you = s?.you ?? null
    const myTeam = this.teams.get(this.me)

    // Avatar degli altri.
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
          // Il disco sta sul terreno sotto i piedi: in aria si rimpicciolisce.
          const ground = this.d.physics.raycast({ x: q.x, y: q.y + 0.3, z: q.z }, { x: 0, y: -1, z: 0 }, 12)
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
    const def = WEAPONS[this.wanted]
    const aiming = c.isHeld("aim") && !!you?.alive
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * Math.min(1, dt * 12)
    const scoped = this.wanted === "cjampanili" && this.aimBlend > 0.85
    const baseFov = settings.fov
    camera.fov = baseFov + (def.aimFov - baseFov) * this.aimBlend
    if (you?.arsenal.sgnape) camera.fov += Math.sin(t * 2.3) * 2
    camera.updateProjectionMatrix()
    c.zoomScale = camera.fov / baseFov
    this.hud.scope(scoped)
    viewmodel.setVisible(!!you?.alive && !scoped)

    const b = this.predictor.body
    const drawn = this.predictor.render(this.acc / DT)
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
      // Da morto: la camera sale e guarda chi ti ha fatto frico.
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
      if (this.shownWeapon !== this.wanted) {
        this.shownWeapon = this.wanted
        viewmodel.setWeapon(this.wanted)
      }
      viewmodel.update(dt, {
        speed: b ? Math.hypot(b.vx, b.vz) : 0,
        grounded: b?.grounded ?? true,
        aiming,
        sprinting: c.isHeld("sprint") && c.move().mz > 0,
        crouch: b?.crouch ?? false,
        lookDx,
        lookDy,
        sgnape: you.arsenal.sgnape > 0
      })
    }

    // Mondo, effetti, audio.
    if (s) {
      const mode = this.room?.mode
      const flagPos = (team: Team): { pos: P3; state: "base" | "carried" | "dropped" } => {
        const f = s.flags[team]
        if (f._tag === "base") return { pos: FLAG_BASES[team], state: "base" }
        if (f._tag === "dropped") return { pos: [f.x, f.y, f.z], state: "dropped" }
        const carrier = f.by === this.me && b ? { x: b.x, y: b.y, z: b.z } : this.interpolated(f.by)
        return { pos: carrier ? [carrier.x, carrier.y + 2.1, carrier.z] : FLAG_BASES[team], state: "carried" }
      }
      world.update(dt, t, {
        pickups: [...s.pickups].map((ch) => ch === "1"),
        flags: mode === "frico" ? { benandanti: flagPos("benandanti"), malandanti: flagPos("malandanti") } : null,
        hill: mode === "culine" ? { owner: s.hill.owner, contested: s.hill.contested } : null,
        camera
      })
      fx.projectiles(s.proj)
      this.hud.top(s, this.room?.mode ?? "bataie", this.names)
      this.hud.death(you, this.names, Math.floor(this.seed / 7))
      if (s.phase.tag === "Over" && Math.floor(t) !== Math.floor(t - dt)) this.renderEnd()
    }
    fx.update(dt, camera)
    audio.setListener([camera.position.x, camera.position.y, camera.position.z], c.yaw)

    if (you) {
      this.hud.vitals(you, { owned: (id) => owned(you.arsenal, id) }, this.wanted === you.arsenal.current ? this.localMag : null)
      const speed = b ? Math.hypot(b.vx, b.vz) : 0
      const spread = aiming ? def.spread.aimed : speed > 1.5 || !b?.grounded ? def.spread.moving : def.spread.still
      const px = (Math.tan(spread) / Math.tan(((camera.fov / 2) * Math.PI) / 180)) * (innerHeight / 2)
      this.hud.crosshair(Math.min(60, px * 1.6), you.alive && !scoped)
    }
    this.hud.clickToPlay(!this.controls.locked && this.overlay === "none" && !this.chatting && !this.boardOpen && s?.phase.tag !== "Over")
  }

  render() {
    const { renderer, scene, camera, viewmodel } = this.d
    renderer.autoClear = false
    renderer.info.reset()
    renderer.clear()
    renderer.render(scene, camera)
    renderer.clearDepth()
    renderer.render(viewmodel.scene, viewmodel.camera)
  }
}
