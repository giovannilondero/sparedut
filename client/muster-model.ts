/**
 * The Muster screen's state, with no DOM in it: fed the room's messages (the room, its snapshots,
 * its chat), it says what the screen shows (the teams or, in a mode with none, one list; the
 * primary chosen and the tiles to choose from; the countdown; the score and time for a member
 * joining a match already on) and turns the member's presses into the messages to send. The game
 * draws the view and forwards the presses.
 */
import type { Team } from "../shared/map.ts"
import { teamSwitch } from "../shared/teams.ts"
import { FLAG_BIT, type ClientMessage, type RoomInfo, type Snapshot } from "../shared/protocol.ts"
import { CLASSES, PRIMARIES, type PrimaryId } from "../shared/weapons.ts"
import { musterCountdown, musterFocus, musterScreen, primaryPicker, singleOf, startsAtOnce, type MusterMember } from "./match-menus.ts"

/** A member as the Muster lists them, marked when it is the player. */
export type MusterRow = MusterMember & { readonly me: boolean }

/**
 * The members: two teams, the player's own named, and whether the switch to the other is offered
 * (always in the Muster; joining a match already on, only where the room would take it); or one
 * list in a mode with no teams (the Tampieste).
 */
export type MusterSides =
  | { readonly tag: "teams"; readonly mine: Team; readonly canSwitch: boolean; readonly benandanti: readonly MusterRow[]; readonly malandanti: readonly MusterRow[] }
  | { readonly tag: "alone"; readonly members: readonly MusterRow[] }

/** A primary's tile: its class's health and speed, and the same as bars from 0 to 1 to compare at a glance. */
export interface PrimaryTile {
  readonly primary: PrimaryId
  readonly health: number
  readonly speed: number
  readonly bars: { readonly health: number; readonly speed: number }
}

/** The primary picker: the one chosen, and whether single weapon locks it on the host's choice. */
export interface MusterPicker {
  readonly chosen: PrimaryId
  readonly locked: boolean
  readonly tiles: readonly PrimaryTile[]
}

/**
 * A class figure as a bar: from half the lowest figure any class has (an empty bar would read as
 * none) to the highest, so that the differences between classes show.
 */
const bar = (all: readonly number[]) => {
  const low = Math.min(...all) / 2
  const high = Math.max(...all)
  return (v: number) => (v - low) / (high - low)
}
const healthBar = bar(PRIMARIES.map((p) => CLASSES[p].hp))
const speedBar = bar(PRIMARIES.map((p) => CLASSES[p].speed))

const TILES: readonly PrimaryTile[] = PRIMARIES.map((primary) => {
  const { hp, speed } = CLASSES[primary]
  return { primary, health: hp, speed, bars: { health: healthBar(hp), speed: speedBar(speed) } }
})

/**
 * The actions under the thumb. In the Muster: start, or cancel while the countdown runs, for the
 * host (null for a guest); the player's ready mark and how many are ready; the countdown's whole
 * seconds, null while none runs. Joining a match already on: the confirm that enters it, which in a
 * Tampieste plays from the next match.
 */
export type MusterActions =
  | {
      readonly tag: "muster"
      readonly start: "start" | "cancel" | null
      readonly ready: boolean
      /** How many human members are ready, of how many; null when the player is the only one. */
      readonly readyCount: { readonly ready: number; readonly of: number } | null
      readonly countdown: number | null
    }
  | { readonly tag: "joining"; readonly nextMatch: boolean }

/**
 * The match a joining member is about to enter: the score (in Spingi il Cjar a share of the way),
 * or in a mode with no teams how many are still standing; and the ticks left.
 */
export type MusterLive =
  | { readonly tag: "teams"; readonly benandanti: number; readonly malandanti: number; readonly percent: boolean; readonly left: number }
  | { readonly tag: "alone"; readonly alive: number; readonly left: number }

/** A chat message as the Muster shows it: the sender's name in their team's colour, when they have one. */
export interface MusterChatLine {
  readonly name: string
  readonly team: Team | null
  readonly text: string
}

/** The Muster's chat keeps this many of the last messages. */
const CHAT_LINES = 30

/** What the Muster screen shows, or closed when it is not on screen. */
export type MusterView =
  | { readonly tag: "closed" }
  | {
      readonly tag: "muster" | "joining"
      readonly sides: MusterSides
      readonly picker: MusterPicker
      readonly actions: MusterActions
      /** Joining a match already on: its score and time; null in the Muster. */
      readonly live: MusterLive | null
      readonly chat: readonly MusterChatLine[]
      /** The host's tools: the bots and their skill, and single weapon (`single`) in the Muster. Null for a guest. */
      readonly hostTools: { readonly single: boolean } | null
      /** The control that takes focus when the screen opens, or null for its first. */
      readonly focus: string | null
    }

/** The modes played each for themselves: no teams to show, none to switch to. */
const alone = (mode: RoomInfo["mode"]) => mode === "tampieste"

const live = (room: RoomInfo, snap: Snap, left: number): MusterLive =>
  alone(room.mode)
    ? { tag: "alone", alive: snap.players.filter((p) => p.f & FLAG_BIT.alive).length, left }
    : { tag: "teams", benandanti: snap.score.benandanti, malandanti: snap.score.malandanti, percent: room.mode === "cjar", left }

const other = (team: Team): Team => (team === "benandanti" ? "malandanti" : "benandanti")

type Snap = Pick<Snapshot, "phase" | "tick" | "score" | "players">

/**
 * Ticks between two sends of a pick: the game server takes two commands a second, so the picks
 * alone never use up its allowance.
 */
const PICK_GAP = 30

export class MusterModel {
  private info: RoomInfo | null = null
  private snap: Snap | null = null
  private lines: MusterChatLine[] = []
  /** The player's last pick while the room does not have it yet; null once it does. */
  private pending: PrimaryId | null = null
  /** The tick the last pick was sent at. */
  private sentAt = -Infinity

  /** `me`: the player's id in the room; `own`: the primary the player chose last, remembered by the browser. */
  constructor(
    private readonly me: string,
    private readonly own: () => PrimaryId
  ) {}

  /** The room as its host sent it: on joining, and on every change. A pick the room now has is settled. */
  room(info: RoomInfo) {
    this.info = info
    if (this.pending === this.roomPrimary) this.pending = null
  }

  /**
   * A snapshot of the match: its phase, the countdown, the score and who is alive. Returns the
   * player's last pick to send again while the room does not have it (the game server may have
   * dropped it, or it was held back by `PICK_GAP`), at most once every `PICK_GAP` ticks; nothing
   * once the screen closes, where the room no longer takes a pick.
   */
  snapshot(snap: Snap): ClientMessage | null {
    this.snap = snap
    if (this.view.tag === "closed") this.pending = null
    return this.sendPending()
  }

  /** The primary the room has for the player. */
  private get roomPrimary(): PrimaryId | null {
    return this.info?.roster.find((r) => r.id === this.me)?.primary ?? null
  }

  private sendPending(): ClientMessage | null {
    const tick = this.snap?.tick ?? 0
    if (this.pending === null || this.info?.single || tick - this.sentAt < PICK_GAP) return null
    this.sentAt = tick
    return { t: "primary", p: this.pending }
  }

  /** The switch under the other team: to that team. Nothing in a mode with no teams, nor where the room would refuse it. */
  switchTeam(): ClientMessage | null {
    const room = this.info
    if (!room || alone(room.mode)) return null
    const mine = this.mine(room)
    const to = other(mine)
    return this.canSwitch(room, mine, to) ? { t: "team", team: to } : null
  }

  private mine(room: RoomInfo): Team {
    return room.roster.find((r) => r.id === this.me)?.team ?? "benandanti"
  }

  /** In the Muster a switch is always taken; while a match is on, the room's balance rule decides. */
  private canSwitch(room: RoomInfo, from: Team, to: Team) {
    return this.inMuster || teamSwitch(room.roster, from, to).tag !== "refused"
  }

  /**
   * A tile pressed: the player's new primary, shown as chosen at once. Sent now, or held back
   * (null) when a pick went less than `PICK_GAP` ticks ago: then the next snapshots send only the
   * last one. Nothing under single weapon, whose picker is locked.
   */
  pick(primary: PrimaryId): ClientMessage | null {
    if (!this.info || this.info.single) return null
    // Kept even when the room has it already: a pick sent before may still be on its way.
    this.pending = primary
    return this.sendPending()
  }

  private get host() {
    return this.info?.hostId === this.me
  }

  private get inMuster() {
    return this.snap?.phase.tag === "Muster"
  }

  private get countdown() {
    return this.snap ? musterCountdown(this.snap.phase, this.snap.tick) : null
  }

  private get readyMark() {
    return this.info?.roster.find((r) => r.id === this.me)?.ready ?? false
  }

  /** A chat message from the room. */
  chat(line: MusterChatLine) {
    this.lines.push(line)
    if (this.lines.length > CHAT_LINES) this.lines.shift()
  }

  /** The host's single-weapon control: a primary, or off for any other value. Only the host, only in the Muster. */
  setSingle(value: string): ClientMessage | null {
    return this.host && this.inMuster ? { t: "single", p: singleOf(value) } : null
  }

  /** The ready toggle: sets the player's mark, or takes it back. Only in the Muster. */
  toggleReady(): ClientMessage | null {
    return this.inMuster ? { t: "ready", ready: !this.readyMark } : null
  }

  /**
   * The host's start: the countdown, or the match at once when every other human member is ready
   * (`live`: the press must then take the pointer for the match). Only the host, only in the Muster.
   */
  start(): { readonly send: ClientMessage; readonly live: boolean } | null {
    if (!this.info || !this.host || !this.inMuster || this.countdown !== null) return null
    return { send: { t: "start" }, live: startsAtOnce(this.info, this.me) }
  }

  /** The host stops the countdown. */
  cancel(): ClientMessage | null {
    return this.host && this.countdown !== null ? { t: "cancel" } : null
  }

  /** Joining a match already on: the confirm that puts the player on the map. */
  enter(): ClientMessage | null {
    return this.view.tag === "joining" ? { t: "enter" } : null
  }

  get view(): MusterView {
    const room = this.info
    const snap = this.snap
    if (!room || !snap) return { tag: "closed" }
    const screen = musterScreen(room, this.me, snap.phase.tag)
    if (screen.tag === "closed") return screen
    const row = (r: RoomInfo["roster"][number]): MusterRow => ({ id: r.id, name: r.name, primary: r.primary, ready: r.ready, bot: r.bot, host: r.id === room.hostId, me: r.id === this.me })
    const rows = room.roster.map(row)
    const sides: MusterSides = alone(room.mode)
      ? { tag: "alone", members: rows }
      : {
          tag: "teams",
          mine: this.mine(room),
          canSwitch: this.canSwitch(room, this.mine(room), other(this.mine(room))),
          benandanti: rows.filter((_, i) => room.roster[i].team === "benandanti"),
          malandanti: rows.filter((_, i) => room.roster[i].team === "malandanti")
        }
    // The last pick while the room does not have it yet, then the room's: never the browser's alone.
    const picker = primaryPicker(room, this.pending ?? this.roomPrimary ?? this.own())
    const humans = room.roster.filter((r) => !r.bot && r.onMap)
    const countdown = this.countdown
    const actions: MusterActions =
      screen.tag === "joining"
        ? { tag: "joining", nextMatch: screen.nextMatch }
        : {
            tag: "muster",
            start: this.host ? (countdown === null ? "start" : "cancel") : null,
            ready: this.readyMark,
            readyCount: humans.some((r) => r.id !== this.me) ? { ready: humans.filter((r) => r.ready).length, of: humans.length } : null,
            countdown
          }
    return {
      tag: screen.tag,
      sides,
      picker: { chosen: picker.chosen, locked: picker._tag === "locked", tiles: TILES },
      actions,
      chat: this.lines,
      hostTools: this.host ? { single: screen.tag === "muster" } : null,
      live: snap.phase.tag === "Live" ? live(room, snap, snap.phase.ends - snap.tick) : null,
      focus: screen.tag === "muster" ? musterFocus({ host: this.host, reach: room.reach }) : null
    }
  }
}

export type { ClientMessage }
