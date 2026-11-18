/**
 * The menu's decisions, with no DOM in it: the screen shown, the name, the creation choices, the
 * code and the password being typed, the latest room list. It turns choices into requests and says
 * why a request is refused; the menu's DOM renders it and forwards the player's events to it.
 */
import { BOT_LEVEL_IDS, ROOM_MODE_IDS, type BotLevel, type RoomModeId } from "../shared/folklore.ts"
import { ROOM_MAP_IDS, type RoomMapId } from "../shared/maps/index.ts"
import { ACCESSES, MAX_BOTS, Password, REACHES, RoomCode, type Access, type ErrorCode, type Reach, type Reached, type RoomAccess, type RoomSummary } from "../shared/protocol.ts"
import { CLASSES, type PrimaryId } from "../shared/weapons.ts"
import type { Lang, Strings } from "./i18n.ts"
import type { TrainingStart } from "../shared/training/start.ts"
import { oneTapRoom, trainingCompleted, trainingStart, type Settings, type TrainingInvitation } from "./settings.ts"

export type CreateOptions = Reached<RoomAccess> & {
  readonly mode: RoomModeId
  readonly map: RoomMapId
  readonly minutes: number
  readonly bots: number
  readonly level: BotLevel
  readonly ff: boolean
}

/** What the menu keeps between visits: the player's settings. The caller decides where they are stored. */
export type Remembered = Settings

/** The settings form's values: the same form in the menu and in a match. */
export type FormSetting = "sensitivity" | "fov" | "master" | "music" | "quality" | "crouch" | "autoRes" | "showInfo" | "invertY"

/** A primary's class as the armoury and the Muster show it: its health, and its speed as a share of the walk. */
export const classFigures = (s: Strings, primary: PrimaryId): readonly (readonly [label: string, value: string])[] => [
  [s.menu.stat.health, `${CLASSES[primary].hp}`],
  [s.menu.stat.speed, `${Math.round(CLASSES[primary].speed * 100)}%`]
]

export const SCREENS = ["home", "create", "password", "armarie", "settings", "vocabolari"] as const
export type Screen = (typeof SCREENS)[number]

/** What the menu asks the game to do. */
export type MenuRequest =
  | { readonly t: "create"; readonly room: CreateOptions }
  /** `password` only once the player typed one. */
  | { readonly t: "join"; readonly code: string; readonly password?: string }
  /** The training: always Offline, its map and mode fixed. */
  | { readonly t: "training"; readonly start: TrainingStart }
  /** The browser's own install prompt, opened from the install entry. */
  | { readonly t: "install" }
  /** The waiting new version takes over and the page reloads into it. */
  | { readonly t: "update" }

/** The answer to a choice: a request to send, a reason the screen shows, or only a new state to draw. */
export type Outcome =
  | { readonly kind: "send"; readonly request: MenuRequest }
  | { readonly kind: "refused"; readonly reason: Refusal }
  | { readonly kind: "none" }

/**
 * Why a request is refused. `needName`: nobody can play without a name; the menu goes home to it.
 * `passwordBad`: a password that must be typed is empty or too long. `codeBad`: a room code is four
 * letters. `roomFull`, `roomGone`: the room chosen in the list is full, or no longer in it.
 */
export type Refusal = "needName" | "passwordBad" | "codeBad" | "roomFull" | "roomGone"

/** The host's reasons to ask for a room's password again. */
export type PasswordRefusal = Extract<ErrorCode, "passwordRequired" | "wrongPassword" | "tooManyAttempts">

/** What the password prompt says about the last attempt: the host's answer, or a password refused before sending. */
export type PromptProblem = Exclude<PasswordRefusal, "passwordRequired"> | "passwordBad"

/** A room as the list shows it: a full room is shown, not selectable. */
export interface ListedRoom {
  readonly room: RoomSummary
  readonly selectable: boolean
}

/**
 * Where each reach stands among creation's choices. LAN comes first and is the one a new room
 * starts on. Every reach needs a place: a new reach does not compile until it has one.
 */
const REACH_PLACE = { lan: 0, online: 1, offline: 2 } as const satisfies Record<Reach, number>

/** What creation offers, from the sets the game defines: a new mode or map appears here by itself. */
export const MENU_OPTIONS = {
  modes: ROOM_MODE_IDS,
  maps: ROOM_MAP_IDS,
  levels: BOT_LEVEL_IDS,
  reaches: [...REACHES].sort((a, b) => REACH_PLACE[a] - REACH_PLACE[b]),
  accesses: ACCESSES,
  minutes: [5, 10, 15, 20],
  /** Bots per team: none up to as many as the server accepts. */
  bots: Array.from({ length: MAX_BOTS + 1 }, (_, n) => n)
} as const satisfies Record<string, readonly unknown[]>

/** Creation's choices as they stand. */
export interface Choices {
  readonly mode: RoomModeId
  readonly map: RoomMapId
  readonly minutes: number
  readonly bots: number
  readonly level: BotLevel
  readonly ff: boolean
  readonly reach: Reach
  readonly access: Access
  /** The room's password as typed, before it is cleaned. */
  readonly password: string
}

/**
 * Where focus lands when the menu goes from one screen to another: `"first"`, the new screen's first
 * control (or its heading when it has none); a screen, the home screen's tile that opens it; null,
 * where it is. The password prompt is a dialog that moves focus in and back by itself.
 */
export function focusOnScreen(from: Screen, to: Screen): "first" | Screen | null {
  if (from === to || from === "password" || to === "password") return null
  return to === "home" ? from : "first"
}

/** The screens a player cannot reach without a name: they create or join a room. */
const NEED_NAME: ReadonlySet<Screen> = new Set(["create", "password"])

/**
 * Where installing the game stands. `offered`: the browser offers its install prompt.
 * `byHand`: it has none, but the game can be added to the home screen from its share menu (Safari
 * on iPhone and iPad). `unavailable`: neither, or the prompt was used and not offered again yet.
 * `installed`: this page runs installed, or installed the game.
 */
type Installing = "unavailable" | "offered" | "byHand" | "installed"

/** What the home screen shows to install the game: a button that opens the prompt, how to do it by hand, or nothing. */
export const INSTALL_ENTRIES = ["button", "instructions", "hidden"] as const
export type InstallEntry = (typeof INSTALL_ENTRIES)[number]

const INSTALL_ENTRY = { unavailable: "hidden", offered: "button", byHand: "instructions", installed: "hidden" } as const satisfies Record<Installing, InstallEntry>

/** A new version of the game: none, downloaded and waiting, or asked to take over (the page reloads). */
type NewVersion = "none" | "waiting" | "loading"

/** The menu's notice of a new version: never over a match. */
export const UPDATE_NOTICES = ["hidden", "shown", "loading"] as const
export type UpdateNotice = (typeof UPDATE_NOTICES)[number]

const UPDATE_NOTICE = { none: "hidden", waiting: "shown", loading: "loading" } as const satisfies Record<NewVersion, UpdateNotice>

/** The home screen's invitation to the training: shown, or gone for good. */
export const INVITATIONS = ["shown", "hidden"] as const
export type Invitation = (typeof INVITATIONS)[number]

const INVITATION = { open: "shown", dismissed: "hidden", started: "hidden" } as const satisfies Record<TrainingInvitation, Invitation>

/** The home screen's training entry: the invitation beside it, and the mark of a training completed. */
export interface TrainingEntry {
  readonly invitation: Invitation
  readonly completed: boolean
}

const NONE: Outcome = { kind: "none" }
const refused = (reason: Refusal): Outcome => ({ kind: "refused", reason })

export class MenuModel {
  private current: Screen = "home"
  private mode: RoomModeId
  private map: RoomMapId
  private minutes: number
  private bots: number
  private level: BotLevel
  private ff: boolean
  private reach: Reach = MENU_OPTIONS.reaches[0]
  private access: Access = MENU_OPTIONS.accesses[0]
  private roomPassword = ""
  private code = ""
  /** The room the password prompt is for, and the password typed into it. */
  private prompt: { code: string; password: string; problem: PromptProblem | null } = { code: "", password: "", problem: null }
  private listed: readonly ListedRoom[] = []

  /** `save` is called whenever a remembered value changed. */
  constructor(
    private readonly remembered: Remembered,
    private readonly save: () => void
  ) {
    this.mode = remembered.lastMode
    this.map = remembered.lastMap
    this.minutes = remembered.lastMinutes
    this.bots = remembered.lastBots
    this.level = remembered.lastLevel
    this.ff = remembered.lastFf
  }

  get screen(): Screen {
    return this.current
  }

  get options(): typeof MENU_OPTIONS {
    return MENU_OPTIONS
  }

  get choices(): Choices {
    const { mode, map, minutes, bots, level, ff, reach, access, roomPassword: password } = this
    return { mode, map, minutes, bots, level, ff, reach, access, password }
  }

  /** Which of creation's fields apply to the current choices. */
  get fields(): { readonly access: boolean; readonly password: boolean } {
    const access = this.reach !== "offline"
    return { access, password: access && this.access === "password" }
  }

  go(screen: Screen): Outcome {
    if (NEED_NAME.has(screen) && !this.remembered.name) return this.needName()
    this.current = screen
    return NONE
  }

  /** `Esc`: one screen back. False when there is nowhere to go back to. */
  back(): boolean {
    if (this.current === "home") return false
    this.current = "home"
    return true
  }

  typeName(text: string) {
    this.remembered.name = text.trim()
    this.save()
  }

  chooseLanguage(lang: Lang) {
    this.change("lang", lang)
  }

  /** The primary weapon, chosen in the armoury: the menu's or a match's. */
  choosePrimary(primary: PrimaryId) {
    this.change("primary", primary)
  }

  /** A value of the settings form: remembered, and applied by whoever `save` calls. */
  changeSetting<K extends FormSetting>(key: K, value: Settings[K]) {
    this.change(key, value)
  }

  /** Remembers a changed value; the value it already has saves nothing. */
  private change<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (this.remembered[key] === value) return
    this.remembered[key] = value
    this.save()
  }

  chooseMode(mode: RoomModeId) {
    this.mode = mode
  }

  /** The map is remembered at once: it becomes the menu's background. */
  chooseMap(map: RoomMapId) {
    this.map = map
    this.remembered.lastMap = map
    this.save()
  }

  chooseMinutes(minutes: number) {
    this.minutes = minutes
  }

  chooseBots(bots: number) {
    this.bots = bots
  }

  chooseLevel(level: BotLevel) {
    this.level = level
  }

  chooseFriendlyFire(on: boolean) {
    this.ff = on
  }

  chooseReach(reach: Reach) {
    this.reach = reach
  }

  chooseAccess(access: Access) {
    this.access = access
  }

  typeRoomPassword(text: string) {
    this.roomPassword = text
  }

  create(): Outcome {
    if (!this.remembered.name) return this.needName()
    let access: RoomAccess = { kind: "open" }
    if (this.fields.password) {
      const password = Password.safeParse(this.roomPassword)
      if (!password.success) return refused("passwordBad")
      access = { kind: "password", password: password.data }
    }
    const room: CreateOptions = {
      mode: this.mode,
      map: this.map,
      minutes: this.minutes,
      bots: this.bots,
      level: this.level,
      ff: this.ff,
      ...(this.reach === "offline" ? { reach: this.reach } : { reach: this.reach, access })
    }
    Object.assign(this.remembered, { lastMode: room.mode, lastMap: room.map, lastBots: room.bots, lastLevel: room.level, lastMinutes: room.minutes, lastFf: room.ff })
    this.save()
    return { kind: "send", request: { t: "create", room } }
  }

  /** The home screen's "play against the bots": an Offline room in one tap, with the remembered values. It stops on the Muster, like any room. */
  oneTap(): Outcome {
    if (!this.remembered.name) return this.needName()
    return { kind: "send", request: { t: "create", room: oneTapRoom(this.remembered) } }
  }

  /**
   * The home screen's training (its entry, or the invitation's own button): one tap, nothing to
   * choose; like any room it needs a name. It resumes at the first station not completed. Started
   * once, the invitation is not shown again.
   */
  training(): Outcome {
    if (!this.remembered.name) return this.needName()
    this.change("trainingInvitation", "started")
    return { kind: "send", request: { t: "training", start: trainingStart(this.remembered.training) } }
  }

  /** The invitation's "no, thanks": never shown again in this browser. */
  dismissInvitation() {
    if (this.remembered.trainingInvitation === "open") this.change("trainingInvitation", "dismissed")
  }

  get trainingEntry(): TrainingEntry {
    return { invitation: INVITATION[this.remembered.trainingInvitation], completed: trainingCompleted(this.remembered.training) }
  }

  typeCode(text: string) {
    this.code = text
  }

  joinByCode(): Outcome {
    if (!this.remembered.name) return this.needName()
    const code = RoomCode.safeParse(this.code)
    return code.success ? { kind: "send", request: { t: "join", code: code.data } } : refused("codeBad")
  }

  /** The latest room list, in the order the host sent it: LAN rooms first, then Online. */
  rooms(list: readonly RoomSummary[]) {
    this.listed = list.map((room) => ({ room, selectable: room.players < room.max }))
  }

  get roomList(): readonly ListedRoom[] {
    return this.listed
  }

  /** A room chosen in the list: joined at once, or through the password prompt. */
  joinFromList(code: string): Outcome {
    if (!this.remembered.name) return this.needName()
    const listed = this.listed.find((l) => l.room.code === code)
    if (!listed) return refused("roomGone")
    if (!listed.selectable) return refused("roomFull")
    if (listed.room.reach !== "offline" && listed.room.access === "password") return this.askPassword(code)
    return { kind: "send", request: { t: "join", code } }
  }

  /** Opens the password prompt for a room; what was typed stays if it is the same room as last time. */
  askPassword(code: string): Outcome {
    if (this.prompt.code !== code) this.prompt = { code, password: "", problem: null }
    else this.prompt.problem = null
    return this.go("password")
  }

  get passwordFor(): string {
    return this.prompt.code
  }

  /** The room the prompt is for, as the list shows it; undefined for a code the list does not have. */
  get promptRoom(): RoomSummary | undefined {
    return this.listed.find((l) => l.room.code === this.prompt.code)?.room
  }

  get typedPassword(): string {
    return this.prompt.password
  }

  typePassword(text: string) {
    this.prompt.password = text
  }

  /** What the last attempt at the prompt got wrong; null when there was none. */
  get promptProblem(): PromptProblem | null {
    return this.prompt.problem
  }

  /** The host asked for a room's password, or refused the one sent: back to the prompt, saying why. */
  hostRefused(code: string, why: PasswordRefusal): Outcome {
    const outcome = this.askPassword(code)
    this.prompt.problem = why === "passwordRequired" ? null : why
    return outcome
  }

  joinWithPassword(): Outcome {
    const password = Password.safeParse(this.prompt.password)
    if (!password.success) {
      this.prompt.problem = "passwordBad"
      return refused("passwordBad")
    }
    return { kind: "send", request: { t: "join", code: this.prompt.code, password: password.data } }
  }

  // ---------------------------------------------------------------- installing and updating the game

  private installing: Installing = "unavailable"
  private newVersion: NewVersion = "none"
  /** The menu is on screen: false during a match. */
  private onScreen = true

  /** What the page found at boot: it runs installed, or it can only be added to the home screen by hand. */
  installSurroundings(env: { readonly installed: boolean; readonly byHand: boolean }) {
    this.installing = env.installed ? "installed" : env.byHand ? "byHand" : "unavailable"
  }

  /** The browser offers its install prompt (`beforeinstallprompt`): again after a refusal, too. */
  installOffered() {
    if (this.installing !== "installed") this.installing = "offered"
  }

  /** The install entry's tap: the browser's prompt opens, and can be used only once. */
  install(): Outcome {
    if (this.installing !== "offered") return NONE
    this.installing = "unavailable"
    return { kind: "send", request: { t: "install" } }
  }

  /** The game was installed from this page (`appinstalled`). */
  installed() {
    this.installing = "installed"
  }

  get installEntry(): InstallEntry {
    return INSTALL_ENTRY[this.installing]
  }

  /** A new version is downloaded and waits to take over. */
  newVersionWaiting() {
    if (this.newVersion === "none") this.newVersion = "waiting"
  }

  /** The menu is shown (back from a match) or hidden (a match starts). */
  menuShown(on: boolean) {
    this.onScreen = on
  }

  /** The update notice's tap: the new version takes over and the page reloads. Only from the menu, once. */
  loadNewVersion(): Outcome {
    if (this.updateNotice !== "shown") return NONE
    this.newVersion = "loading"
    return { kind: "send", request: { t: "update" } }
  }

  get updateNotice(): UpdateNotice {
    return this.onScreen ? UPDATE_NOTICE[this.newVersion] : "hidden"
  }

  private needName(): Outcome {
    this.current = "home"
    return refused("needName")
  }
}
