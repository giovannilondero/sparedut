/**
 * Una stanza: la simulazione autoritativa, i giocatori collegati, i bot.
 */
import { BOT_NAMES, QUICK_CHAT, type BotLevel, type ModeId } from "../shared/folklore.ts"
import { IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { TEAMS, type MapId, type Team } from "../shared/map.ts"
import { MAPS } from "../shared/maps/index.ts"
import { createPhysicsWorld, type PhysicsWorld } from "../shared/physics.ts"
import {
  FLAG_BIT,
  MAX_PLAYERS,
  SNAPSHOT_EVERY,
  type BoardRow,
  type RoomInfo,
  type RoomSummary,
  type ServerMessage,
  type SnapOther,
  type Snapshot,
  type Visibility
} from "../shared/protocol.ts"
import { createSim, type GameEvent, type Sim, type WorldView } from "../shared/sim/index.ts"
import type { PrimaryId } from "../shared/weapons.ts"
import { BotBrain } from "./bot.ts"
import { navGraph } from "./nav.ts"

/** Comandi in attesa per giocatore: oltre, il client corre troppo e si scartano i vecchi. */
const MAX_QUEUE = 20
/** Comandi applicati al massimo in un tick (recupero dopo un ritardo di rete, non di più). */
const STEPS_PER_TICK = 3
/** Passi accumulabili durante un ritardo, da recuperare dopo. */
const MAX_CREDIT = 12
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

export interface Member {
  readonly id: string
  name: string
  team: Team
  readonly bot: boolean
  send: ((msg: ServerMessage) => void) | null
  queue: PlayerInput[]
  last: PlayerInput
  ping: number
  credit: number
}

export interface RoomSettings {
  readonly mode: ModeId
  readonly map: MapId
  readonly minutes: number
  readonly visibility: Visibility
  readonly level: BotLevel
  readonly ff: boolean
}

let botCounter = 0

export class Room {
  readonly physics: PhysicsWorld
  readonly sim: Sim
  readonly members = new Map<string, Member>()
  private bots = new Map<string, BotBrain>()
  private events: GameEvent[] = []
  private world: WorldView
  level: BotLevel

  constructor(
    readonly code: string,
    public hostId: string,
    public hostName: string,
    readonly networkKey: string,
    readonly settings: RoomSettings
  ) {
    this.level = settings.level
    this.physics = createPhysicsWorld(MAPS[settings.map])
    this.sim = createSim({ mode: settings.mode, minutes: settings.minutes, friendlyFire: settings.ff, seed: Math.floor(Math.random() * 2 ** 31), physics: this.physics })
    this.world = this.sim.view()
  }

  get humans() {
    return [...this.members.values()].filter((m) => !m.bot)
  }

  get full() {
    return this.members.size >= MAX_PLAYERS
  }

  private teamCount(team: Team) {
    return [...this.members.values()].filter((m) => m.team === team).length
  }

  private smallerTeam(): Team {
    return this.teamCount("benandanti") <= this.teamCount("malandanti") ? "benandanti" : "malandanti"
  }

  addHuman(id: string, name: string, primary: PrimaryId, send: (msg: ServerMessage) => void) {
    if (this.full) {
      // Un bot lascia il posto a una persona.
      const bot = [...this.members.values()].findLast((m) => m.bot)
      if (!bot) return false
      this.removeMember(bot.id)
    }
    const team = this.smallerTeam()
    this.members.set(id, { id, name, team, bot: false, send, queue: [], last: IDLE_INPUT, ping: 0, credit: MAX_CREDIT })
    this.sim.join(id, name, team, false, primary)
    return true
  }

  addBot(team: Team) {
    if (this.full) return
    const used = new Set([...this.members.values()].map((m) => m.name))
    const name = BOT_NAMES[team].find((n) => !used.has(n)) ?? `${BOT_NAMES[team][0]} ${++botCounter}`
    const id = `bot-${++botCounter}`
    const primaries: PrimaryId[] = ["cramar", "cramar", "doplete", "cjampanili", "mulin", "miedi", "cramar"]
    const primary = primaries[botCounter % primaries.length]
    this.members.set(id, { id, name, team, bot: true, send: null, queue: [], last: IDLE_INPUT, ping: 0, credit: MAX_CREDIT })
    this.bots.set(id, new BotBrain(id, this.level, navGraph(this.physics), this.physics, botCounter))
    this.sim.join(id, name, team, true, primary)
  }

  removeBot(team: Team) {
    const bot = [...this.members.values()].findLast((m) => m.bot && m.team === team)
    if (bot) this.removeMember(bot.id)
  }

  setLevel(level: BotLevel) {
    this.level = level
    for (const b of this.bots.values()) b.level = level
  }

  removeMember(id: string) {
    const m = this.members.get(id)
    if (!m) return
    this.members.delete(id)
    this.bots.delete(id)
    this.sim.leave(id)
    if (this.hostId === id) {
      const next = this.humans[0]
      if (next) {
        this.hostId = next.id
        this.hostName = next.name
      }
    }
  }

  setTeam(id: string, team: Team) {
    const m = this.members.get(id)
    if (!m || m.team === team) return
    // Non si sbilanciano le squadre: se l'altra è più numerosa, un bot fa cambio.
    if (this.teamCount(team) >= this.teamCount(m.team)) {
      const swap = [...this.members.values()].find((o) => o.bot && o.team === team)
      if (!swap) return
      swap.team = m.team
      this.sim.team(swap.id, m.team)
    }
    m.team = team
    this.sim.team(id, team)
  }

  queueInput(id: string, input: PlayerInput) {
    const m = this.members.get(id)
    if (!m || m.bot) return
    // Fuori ordine o doppio (rete): si scarta.
    const lastSeq = m.queue.length ? m.queue[m.queue.length - 1].seq : m.last.seq
    if (input.seq <= lastSeq) return
    m.queue.push(input)
    if (m.queue.length > MAX_QUEUE) {
      // Si tengono le pressioni dei comandi scartati.
      const dropped = m.queue.shift()!
      m.queue[0] = { ...m.queue[0], buttons: m.queue[0].buttons | dropped.buttons }
    }
  }

  chat(from: string, text: string) {
    const m = this.members.get(from)
    if (!m) return
    this.broadcast({ t: "chat", from, name: m.name, team: m.team, text })
  }

  start() {
    this.sim.start()
  }

  /** Un tick: ingressi, bot, simulazione. */
  step() {
    // Ogni comando è un passo: si consegnano quelli arrivati, fino a STEPS_PER_TICK
    // (il resto resta in coda per il tick dopo). Niente comandi ripetuti: il server
    // farebbe un passo che il client non ha mai fatto, e la camera scatterebbe.
    for (const m of this.members.values()) {
      if (m.bot) continue
      // Credito di passi: in media uno per tick, così nessuno corre più veloce mandando più comandi.
      m.credit = Math.min(MAX_CREDIT, m.credit + 1)
      for (let i = 0; i < STEPS_PER_TICK && m.queue.length && m.credit >= 1; i++) {
        m.credit--
        const next = m.queue.shift()!
        m.last = next
        this.sim.input(m.id, next)
      }
    }
    for (const [id, brain] of this.bots) this.sim.input(id, brain.think(this.world))
    const events = this.sim.step()
    this.world = this.sim.view()
    for (const e of events) {
      this.events.push(e)
      // I bot sono furlans: ogni tanto commentano.
      if (e.t === "kill" && e.k && this.bots.has(e.k) && Math.random() < 0.18) {
        this.chat(e.k, QUICK_CHAT[Math.floor(Math.random() * QUICK_CHAT.length)])
      }
    }
    if (this.world.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots()
    if (this.world.tick % 60 === 0) this.broadcast({ t: "board", rows: this.board() })
  }

  get tick() {
    return this.world.tick
  }

  private sendSnapshots() {
    const w = this.world
    const carriers = new Set<string>()
    for (const f of Object.values(w.flags)) if (f._tag === "carried") carriers.add(f.by)
    const others: SnapOther[] = w.players.map((p) => ({
      id: p.session,
      x: r2(p.body.x),
      y: r2(p.body.y),
      z: r2(p.body.z),
      yaw: r3(p.yaw),
      pitch: r3(p.pitch),
      vx: r2(p.body.vx),
      vy: r2(p.body.vy),
      vz: r2(p.body.vz),
      f:
        (p.alive ? FLAG_BIT.alive : 0) |
        (p.body.crouch ? FLAG_BIT.crouch : 0) |
        (p.body.grounded ? FLAG_BIT.grounded : 0) |
        (p.shield > 0 ? FLAG_BIT.shield : 0) |
        (p.buttons & 1 ? FLAG_BIT.firing : 0) |
        (p.buttons & 2 ? FLAG_BIT.aiming : 0) |
        (carriers.has(p.session) ? FLAG_BIT.carrier : 0) |
        (p.arsenal.sgnape > 0 ? FLAG_BIT.sgnape : 0),
      w: p.arsenal.current,
      hp: Math.ceil(p.hp)
    }))
    const base: Omit<Snapshot, "you"> = {
      t: "snap",
      tick: w.tick,
      phase: w.phase,
      score: w.score,
      flags: w.flags,
      hill: w.hill,
      cart: w.cart,
      storm: w.storm,
      pickups: w.pickups.map((p) => (p ? "1" : "0")).join(""),
      proj: w.projectiles.map((p) => [p.kind, r2(p.x), r2(p.y), r2(p.z)] as const),
      players: others,
      ev: this.events
    }
    this.events = []
    for (const m of this.members.values()) {
      if (!m.send) continue
      const me = w.players.find((p) => p.session === m.id)
      m.send({
        ...base,
        you: me
          ? {
              body: me.body,
              seq: me.seq,
              hp: Math.ceil(me.hp),
              armor: Math.ceil(me.armor),
              shield: me.shield,
              respawn: me.respawn,
              killer: me.killer,
              arsenal: me.arsenal,
              alive: me.alive
            }
          : null
      })
    }
  }

  board(): BoardRow[] {
    return this.world.players.map((p) => ({
      id: p.session,
      name: p.name,
      team: p.team,
      bot: p.bot,
      kills: p.stats.kills,
      deaths: p.stats.deaths,
      assists: p.stats.assists,
      caps: p.stats.caps,
      score: Math.round(p.stats.score),
      best: p.stats.best,
      headshots: p.stats.headshots,
      damage: Math.round(p.stats.damage),
      ping: this.members.get(p.session)?.ping ?? 0
    }))
  }

  broadcast(msg: ServerMessage) {
    for (const m of this.members.values()) m.send?.(msg)
  }

  summary(): RoomSummary {
    return {
      code: this.code,
      host: this.hostName,
      mode: this.settings.mode,
      map: this.settings.map,
      visibility: this.settings.visibility,
      players: this.humans.length,
      bots: this.bots.size,
      max: MAX_PLAYERS,
      phase: this.world.phase.tag
    }
  }

  info(): RoomInfo {
    return {
      ...this.summary(),
      hostId: this.hostId,
      minutes: this.settings.minutes,
      level: this.level,
      ff: this.settings.ff,
      roster: [...this.members.values()].map((m) => ({ id: m.id, name: m.name, team: m.team, bot: m.bot, away: false }))
    }
  }

  fillBots(perTeam: number) {
    for (const team of TEAMS) while (this.teamCount(team) < perTeam && !this.full) this.addBot(team)
  }
}

export function newCode(taken: (code: string) => boolean) {
  for (;;) {
    let code = ""
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    if (!taken(code)) return code
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100
const r3 = (n: number) => Math.round(n * 1000) / 1000
