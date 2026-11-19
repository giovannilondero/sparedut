/**
 * A room: the authoritative simulation, the connected players, the bots.
 */
import { BOT_NAMES, QUICK_CHAT, type BotLevel, type ModeId } from "../shared/folklore.ts"
import { IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { TEAMS, type MapId, type Team } from "../shared/map.ts"
import { MAPS } from "../shared/maps/index.ts"
import { createPhysicsWorld, type PhysicsWorld } from "../shared/physics.ts"
import {
  FLAG_BIT,
  PICKUP_CHAR,
  MAX_PLAYERS,
  SNAPSHOT_EVERY,
  type BoardRow,
  type RoomInfo,
  type RoomSummary,
  type ServerMessage,
  type SnapOther,
  type Access,
  type Reached,
  type RoomAccess,
  type Snapshot
} from "../shared/protocol.ts"
import { createSim, type GameEvent, type PostValue, type Sim, type WorldView } from "../shared/sim/index.ts"
import { isTraining, TRAINING, type StationId } from "../shared/training/index.ts"
import { teamSwitch } from "../shared/teams.ts"
import { STATION_BOT_PRIMARY, type StationBot } from "../shared/training/station.ts"
import type { TrainingStart } from "../shared/training/start.ts"
import type { PrimaryId } from "../shared/weapons.ts"
import { BotBrain } from "./bot.ts"
import { navGraph } from "./nav.ts"
import { botsOf, FoeBrain, postOf, RouteBrain, stationGraph, stationOf, type Brain } from "./station-bot.ts"

/** Pending commands per player: beyond this the client is running ahead and the old ones are dropped. */
const MAX_QUEUE = 20
/** Max commands applied in one tick (catching up after network lag, no more). */
const STEPS_PER_TICK = 3
/** Steps that can accumulate during lag, to be caught up afterwards. */
const MAX_CREDIT = 12
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

/**
 * Where a member is in the match. `waiting`: they joined while a match was on and have not entered
 * it: no body, no hits, no seat on a team for scoring, until their enter intent (or the Muster).
 * `inMatch`: one of the match's players, on the map whenever the match puts them there.
 */
export type Place = "waiting" | "inMatch"

export interface Member {
  readonly id: string
  place: Place
  name: string
  team: Team
  /** The primary the member chose, kept under single weapon: the roster shows `primaryOf` this. */
  primary: PrimaryId
  /** Marked ready in the Muster (cleared whenever the room enters it); a bot always is. */
  ready: boolean
  readonly bot: boolean
  send: ((msg: ServerMessage) => void) | null
  queue: PlayerInput[]
  last: PlayerInput
  ping: number
  credit: number
}

/** A room's settings. Read the password of its access only through `admits`. */
export type RoomSettings = Reached<RoomAccess> & {
  readonly mode: ModeId
  readonly map: MapId
  readonly minutes: number
  readonly level: BotLevel
  readonly ff: boolean
  /** Single weapon: the one primary everybody carries, or null when it is off. */
  readonly single: PrimaryId | null
}

/** A training's settings: the request fixes them all. Always Offline, on the fair, in the Dutrine. */
export const TRAINING_ROOM: RoomSettings = { reach: "offline", mode: TRAINING.mode, map: TRAINING.map, minutes: 0, level: "zovin", ff: false, single: null }

let botCounter = 0

export class Room {
  readonly physics: PhysicsWorld
  readonly sim: Sim
  readonly members = new Map<string, Member>()
  private bots = new Map<string, BotBrain>()
  /** A training's bots: the current station's, kept present by `keepStationBots`. */
  private stationBots = new Map<string, Brain>()
  /** The station whose bots are present. */
  private botsFor: StationId | null = null
  private events: GameEvent[] = []
  /**
   * Joins the simulation has not taken yet: it takes them at the next step. A member who leaves
   * before then (a bot added and removed while an Offline room is paused) never enters it; within
   * one step the simulation handles leaves before joins, and would keep them.
   */
  private readonly arriving = new Map<string, () => void>()
  private world: WorldView
  /** A start sent to the simulation since its last step: it may have begun a countdown the view does not show yet. */
  private startSent = false
  level: BotLevel

  constructor(
    readonly code: string,
    public hostId: string,
    public hostName: string,
    readonly networkKey: string,
    /** Fixed at creation, but for single weapon, which the host changes in the Muster (`setSingle`). */
    public settings: RoomSettings,
    /** A training's start, from its request (`shared/training/start.ts`). */
    start?: TrainingStart
  ) {
    this.level = settings.level
    this.physics = createPhysicsWorld(MAPS[settings.map])
    this.sim = createSim({ mode: settings.mode, minutes: settings.minutes, friendlyFire: settings.ff, single: settings.single, seed: Math.floor(Math.random() * 2 ** 31), physics: this.physics, ...(start ? { training: start } : {}) })
    this.world = this.sim.view()
  }

  /** A training: one player, a Benandante, and no host tools. */
  get training() {
    return isTraining(this.settings.mode)
  }

  get humans() {
    return [...this.members.values()].filter((m) => !m.bot)
  }

  get full() {
    return this.members.size >= MAX_PLAYERS
  }

  /**
   * Whether one more human can come in: a free seat, or a bot to give its seat up to them. A bot
   * already promised to a member who has not entered yet is not promised again.
   */
  get admitsAnother() {
    const bots = [...this.members.values()].filter((m) => m.bot).length
    return this.members.size - MAX_PLAYERS < bots
  }

  /** Whether a match is on (live, or its results): a human who joins now waits until they enter. */
  private get matchOn() {
    return !this.training && this.world.phase.tag !== "Muster"
  }

  /** A member who joined a match already on and has not entered it. False for anybody else, and for a stranger. */
  hasNotEntered(id: string): boolean {
    return this.members.get(id)?.place === "waiting"
  }

  private get seated() {
    return [...this.members.values()].filter((m) => m.place === "inMatch").length
  }

  /** A bot gives up its seat to a person entering `team`: one of that team's if it has one. */
  private freeSeatFor(team: Team) {
    if (this.seated < MAX_PLAYERS) return
    const bots = [...this.members.values()].filter((m) => m.bot)
    const bot = bots.findLast((m) => m.team === team) ?? bots.at(-1)
    if (bot) this.removeMember(bot.id)
  }

  /** The member takes their seat in the match, with the team and primary they chose: the simulation takes them at the next step. */
  private seat(m: Member) {
    this.freeSeatFor(m.team)
    m.place = "inMatch"
    const { id, name, team, primary } = m
    this.arriving.set(id, () => this.sim.join(id, name, team, false, primary))
  }

  private teamCount(team: Team) {
    return [...this.members.values()].filter((m) => m.team === team).length
  }

  private smallerTeam(): Team {
    return this.teamCount("benandanti") <= this.teamCount("malandanti") ? "benandanti" : "malandanti"
  }

  /**
   * A human comes in. In the Muster (and in a training) they are one of the match's players at
   * once, a bot giving up its seat if the room is full; while a match is on they wait, off the map,
   * until they enter (`enter`), and the bot keeps its seat until then.
   */
  addHuman(id: string, name: string, primary: PrimaryId, send: (msg: ServerMessage) => void) {
    if (!this.admitsAnother) return false
    const team = this.training ? "benandanti" : this.smallerTeam()
    const m: Member = { id, place: "waiting", name, team, primary, ready: false, bot: false, send, queue: [], last: IDLE_INPUT, ping: 0, credit: MAX_CREDIT }
    if (!this.matchOn) this.seat(m)
    this.members.set(id, m)
    return true
  }

  /** The enter intent: a member who has not entered takes their seat in the match on. Refused (false) from anybody else. */
  enter(id: string): boolean {
    const m = this.members.get(id)
    if (!m || m.place !== "waiting" || !this.matchOn) return false
    this.seat(m)
    return true
  }

  addBot(team: Team) {
    if (this.full) return
    const primaries: PrimaryId[] = ["cramar", "cramar", "doplete", "cjampanili", "mulin", "miedi", "gjalinis", "cramar", "motosee"]
    const id = this.seatBot(team, (n) => primaries[n % primaries.length], null)
    this.bots.set(id, new BotBrain(id, this.level, navGraph(this.physics), this.physics, botCounter))
  }

  /**
   * A bot's seat in the room: a new id, a name of its team no member has, its member record, and
   * its join at the next step with the primary `primaryFor` its number picks and its post, if any.
   */
  private seatBot(team: Team, primaryFor: (n: number) => PrimaryId, post: PostValue | null): string {
    const id = `bot-${++botCounter}`
    const used = new Set([...this.members.values()].map((m) => m.name))
    const name = BOT_NAMES[team].find((n) => !used.has(n)) ?? `${BOT_NAMES[team][0]} ${botCounter}`
    const primary = primaryFor(botCounter)
    this.members.set(id, { id, place: "inMatch", name, team, primary, ready: true, bot: true, send: null, queue: [], last: IDLE_INPUT, ping: 0, credit: MAX_CREDIT })
    this.arriving.set(id, () => this.sim.join(id, name, team, true, primary, post))
    return id
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
    this.stationBots.delete(id)
    if (!this.arriving.delete(id) && m.place === "inMatch") this.sim.leave(id)
    if (this.hostId === id) {
      const next = this.humans[0]
      if (next) {
        this.hostId = next.id
        this.hostName = next.name
      }
    }
    // The one member not ready may be the one who left.
    this.goIfAllReady()
  }

  /**
   * A member changes team. In the Muster (and in a training) it is always taken, with no bot moved:
   * the host balances the teams with the bot tools before starting. While a match is on, for a
   * member on the map and one who has not entered alike, the balance rule of `teamSwitch` holds.
   */
  setTeam(id: string, team: Team) {
    const m = this.members.get(id)
    if (!m || m.team === team) return
    if (this.matchOn) {
      const rule = teamSwitch([...this.members.values()], m.team, team)
      if (rule.tag === "refused") return
      if (rule.tag === "swap") {
        const bot = this.members.get(rule.bot)!
        bot.team = m.team
        this.sim.team(bot.id, m.team)
      }
    }
    m.team = team
    // Not on a team for scoring yet: the side they will enter on.
    if (m.place === "inMatch") this.sim.team(id, team)
  }

  /** The primary a member enters a match with: the room's single weapon when it is on, else their own. */
  primaryOf(m: Member): PrimaryId {
    return this.settings.single ?? m.primary
  }

  /**
   * The change-primary intent. The primary is fixed for the match: accepted only in the Muster, from
   * a member who has not entered the match on, and in a training (where it arrives at once). Refused
   * (false), with nothing changed, from a player on the map while a match is live or over, and from
   * everybody under single weapon, where each member's own choice stays as it was.
   */
  setPrimary(id: string, primary: PrimaryId): boolean {
    const m = this.members.get(id)
    if (!m || this.settings.single || (this.matchOn && m.place === "inMatch")) return false
    m.primary = primary
    if (m.place === "inMatch") this.sim.primary(id, primary)
    return true
  }

  queueInput(id: string, input: PlayerInput) {
    const m = this.members.get(id)
    if (!m || m.bot) return
    // Out of order or duplicate (network): drop it.
    const lastSeq = m.queue.length ? m.queue[m.queue.length - 1].seq : m.last.seq
    if (input.seq <= lastSeq) return
    m.queue.push(input)
    if (m.queue.length > MAX_QUEUE) {
      // Keep the button presses of dropped commands.
      const dropped = m.queue.shift()!
      m.queue[0] = { ...m.queue[0], buttons: m.queue[0].buttons | dropped.buttons }
    }
  }

  chat(from: string, text: string) {
    const m = this.members.get(from)
    if (!m) return
    this.broadcast({ t: "chat", from, name: m.name, team: m.team, text })
  }

  /** Every human member is ready (bots always are). */
  private get allReady() {
    return this.humans.every((m) => m.ready)
  }

  /** In the Muster: the countdown, or nothing yet. */
  private get countingDown() {
    const phase = this.world.phase
    return phase.tag === "Muster" && (phase.starts !== null || this.startSent)
  }

  /** A member marks themselves ready or takes the mark back: only a human, only in the Muster. */
  setReady(id: string, ready: boolean) {
    const m = this.members.get(id)
    if (!m || m.bot || this.world.phase.tag !== "Muster") return
    m.ready = ready
    this.goIfAllReady()
  }

  /** A running countdown ends as soon as every human member is ready. */
  private goIfAllReady() {
    if (this.countingDown && this.allReady) this.sim.start(true)
  }

  /**
   * The host's start. In the Muster it counts as the host's ready mark and begins the countdown,
   * or the match at once if every human member is ready; a start while a countdown runs restarts
   * it. During a match it sends the room back to the Muster.
   */
  start() {
    const host = this.members.get(this.hostId)
    if (this.world.phase.tag === "Muster" && host) host.ready = true
    this.sim.start(this.world.phase.tag !== "Muster" || this.allReady)
    this.startSent = true
  }

  /**
   * A running countdown starts again from the beginning, so that everybody has time to take in a
   * change to the room (single weapon). Nothing when no countdown runs.
   */
  restartCountdown() {
    if (!this.countingDown) return
    this.sim.start(false)
    this.startSent = true
  }

  /**
   * The host sets single weapon in the Muster: every member is shown with, and enters with, the
   * setting's primary, or their own again when it is off. A running countdown restarts, so that
   * everybody has time to take in the change. Refused (false) from anybody but the host, outside
   * the Muster, and in a training.
   */
  setSingle(id: string, single: PrimaryId | null): boolean {
    if (id !== this.hostId || this.training || this.world.phase.tag !== "Muster" || single === this.settings.single) return false
    this.settings = { ...this.settings, single }
    this.sim.single(single)
    this.restartCountdown()
    return true
  }

  /** The host cancels the countdown: the room stays in the Muster with none running. */
  cancelCountdown() {
    if (!this.countingDown) return
    this.sim.cancelCountdown()
    this.startSent = false
  }

  /** One tick: inputs, bots, simulation. */
  step() {
    for (const join of this.arriving.values()) join()
    this.arriving.clear()
    // Each command is one step: deliver the ones that arrived, up to STEPS_PER_TICK
    // (the rest stays queued for the next tick). No repeated commands: the server
    // would take a step the client never took, and the camera would snap.
    for (const m of this.members.values()) {
      if (m.bot || m.place === "waiting") continue
      // Step credit: one per tick on average, so nobody runs faster by sending more commands.
      m.credit = Math.min(MAX_CREDIT, m.credit + 1)
      for (let i = 0; i < STEPS_PER_TICK && m.queue.length && m.credit >= 1; i++) {
        m.credit--
        const next = m.queue.shift()!
        m.last = next
        this.sim.input(m.id, next)
      }
    }
    for (const [id, brain] of this.bots) this.sim.input(id, brain.think(this.world))
    for (const [id, brain] of this.stationBots) this.sim.input(id, brain.think(this.world))
    const events = this.sim.step()
    const before = this.world.phase.tag
    const world = this.sim.view()
    this.world = world
    this.startSent = false
    // Entering the Muster clears every ready mark: the members must see it.
    const mustered = before !== "Muster" && world.phase.tag === "Muster"
    if (mustered) for (const m of this.humans) m.ready = false
    const swapped = (this.training && this.keepStationBots()) || this.seatWaiting()
    for (const e of events) {
      this.events.push(e)
      // Bots are furlans: now and then they comment.
      if (e.t === "kill" && e.k && this.bots.has(e.k) && Math.random() < 0.18) {
        this.chat(e.k, QUICK_CHAT[Math.floor(Math.random() * QUICK_CHAT.length)])
      }
    }
    if (this.world.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots()
    if (this.world.tick % 60 === 0) this.broadcast({ t: "board", rows: this.board() })
    // The roster names and colours the bodies the client draws from the snapshots: it must have the
    // new bots before the first snapshot that brings them, or they are drawn nameless in the wrong colours.
    if (swapped || mustered) this.broadcast({ t: "room", room: this.info() })
  }

  /**
   * The room is in the Muster again: whoever had not entered the match that ended is in it like
   * everybody else. True when somebody was seated, so that the members are told.
   */
  private seatWaiting(): boolean {
    if (this.matchOn) return false
    const waiting = [...this.members.values()].filter((m) => m.place === "waiting")
    for (const m of waiting) this.seat(m)
    return waiting.length > 0
  }

  get tick() {
    return this.world.tick
  }

  /**
   * A training: the current station's bots are present, and no other's. They join at the next step.
   * True when a bot left or came: the members must be told, or the client keeps drawing the old
   * station's bots where they last stood.
   */
  private keepStationBots(): boolean {
    const station = stationOf(this.world)
    if (station === this.botsFor) return false
    const left = this.stationBots.size
    for (const id of [...this.stationBots.keys()]) this.removeMember(id)
    this.botsFor = station
    if (station) for (const bot of botsOf(station)) this.addStationBot(station, bot)
    return left + this.stationBots.size > 0
  }

  private addStationBot(station: StationId, bot: StationBot) {
    const post = postOf(station, bot)
    const id = this.seatBot(bot.team, () => STATION_BOT_PRIMARY, post)
    const route = new RouteBrain(id, bot.route, post.yaw)
    this.stationBots.set(id, bot.fires ? new FoeBrain(new BotBrain(id, this.level, stationGraph(navGraph(this.physics), station), this.physics, botCounter), route) : route)
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
        (p.firing ? FLAG_BIT.firing : 0) |
        (p.buttons & 2 ? FLAG_BIT.aiming : 0) |
        (carriers.has(p.session) ? FLAG_BIT.carrier : 0) |
        (p.arsenal.sgnape > 0 ? FLAG_BIT.sgnape : 0),
      w: w.turrets.some((t) => t.gunner === p.session) ? "mitraie" : p.arsenal.current,
      hp: Math.ceil(p.hp)
    }))
    const base: Omit<Snapshot, "you"> = {
      t: "snap",
      tick: w.tick,
      phase: w.phase,
      objective: w.objective,
      score: w.score,
      flags: w.flags,
      hill: w.hill,
      cart: w.cart,
      storm: w.storm,
      turrets: w.turrets.map((t) => ({ ...t, heat: r2(t.heat) })),
      doors: w.doors.map((d) => Math.ceil(d)),
      panels: w.panels.map((p) => (p.tag === "tearing" ? { ...p, progress: r2(p.progress) } : p)),
      pickups: w.pickups.map((p) => PICKUP_CHAR[p]).join(""),
      proj: w.projectiles.map((p) => [p.kind, r2(p.x), r2(p.y), r2(p.z)] as const),
      players: others,
      training: w.training,
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
      primary: p.arsenal.primary,
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

  /** Whether a password lets a player in: always for an open room. */
  admits(password: string | undefined): boolean {
    const s = this.settings
    return s.reach === "offline" || s.access.kind !== "password" || password === s.access.password
  }

  summary(): RoomSummary {
    return {
      code: this.code,
      host: this.hostName,
      mode: this.settings.mode,
      map: this.settings.map,
      ...shownReach(this.settings),
      players: this.humans.length,
      bots: this.bots.size + this.stationBots.size,
      max: MAX_PLAYERS,
      phase: this.world.phase.tag,
      single: this.settings.single
    }
  }

  info(): RoomInfo {
    return {
      ...this.summary(),
      hostId: this.hostId,
      minutes: this.settings.minutes,
      level: this.level,
      ff: this.settings.ff,
      roster: [...this.members.values()].map((m) => ({ id: m.id, name: m.name, team: m.team, primary: this.primaryOf(m), ready: m.ready, bot: m.bot, away: false, onMap: m.place === "inMatch" }))
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

/** A room's reach as the room list shows it: the access's kind, never its password. */
const shownReach = (s: Reached<RoomAccess>): Reached<Access> => (s.reach === "offline" ? { reach: s.reach } : { reach: s.reach, access: s.access.kind })
