/** Player settings, saved in the browser. */
import { ROOM_MODE_IDS, type BotLevel, type RoomModeId } from "../shared/folklore.ts"
import { ROOM_MAP_IDS, type RoomMapId } from "../shared/maps/index.ts"
import type { PrimaryId } from "../shared/weapons.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { STATION_IDS } from "../shared/training/index.ts"
import type { TrainingStart } from "../shared/training/start.ts"
import { z } from "zod"
import type { CrouchMode } from "./controls.ts"
import type { Lang } from "./i18n.ts"
import type { CreateOptions } from "./menu-model.ts"

export interface Settings {
  name: string
  /** Interface language: Friulian or Italian. */
  lang: Lang
  sensitivity: number
  fov: number
  master: number
  music: number
  invertY: boolean
  /** Crouch while the key is held, or a press to crouch and one to stand. */
  crouch: CrouchMode
  primary: PrimaryId
  quality: "bassa" | "media" | "alta"
  /** Performance panel (F3). */
  showInfo: boolean
  /** Dynamic resolution: lowers the resolution when FPS drops. */
  autoRes: boolean
  lastMode: RoomModeId
  /** The last chosen map: it's also the menu background. */
  lastMap: RoomMapId
  lastBots: number
  lastLevel: BotLevel
  lastMinutes: number
  /** Friendly fire in the last room created from the menu. The one-tap match never has it. */
  lastFf: boolean
  /** The training's progress: saved per completed station (`trainingProgressed`). */
  training: TrainingProgress
  /** The home screen's invitation to the training. Apart from `training`: starting over does not bring it back. */
  trainingInvitation: TrainingInvitation
}

/**
 * How far the player has got in the training, as the browser keeps it: what starting over resets.
 * Whether the invitation was dismissed is kept beside it (`Settings.trainingInvitation`).
 */
export interface TrainingProgress {
  /**
   * How many stations, from the first, are completed: 0 to all of them. The stations unlock in
   * order, so the next one is unlocked too; all of them completed is the training completed.
   */
  readonly done: number
}

/** A training never started, and what starting over goes back to. */
export const FRESH_TRAINING: TrainingProgress = { done: 0 }

/** The saved progress as this version writes it; anything else (an older shape, a broken value) is a first training. */
const TrainingProgressSchema = z.object({ done: z.number().int().min(0).max(STATION_IDS.length) })

/** The training has been completed once: every station stays unlocked. */
export const trainingCompleted = (p: TrainingProgress): boolean => p.done === STATION_IDS.length

/** How many stations, from the first, can be chosen: the completed ones and the next. */
const unlockedOf = (p: TrainingProgress): number => Math.min(STATION_IDS.length, p.done + 1)

/**
 * The home screen's invitation to the training: `open` on a first visit, until the player
 * `dismissed` it or `started` the training once. Either ends it for good.
 */
export const TRAINING_INVITATIONS = ["open", "dismissed", "started"] as const
export type TrainingInvitation = (typeof TRAINING_INVITATIONS)[number]
const TrainingInvitationSchema = z.enum(TRAINING_INVITATIONS)

const KEY = "sparedut.settings"
const DEFAULTS: Settings = {
  name: "",
  lang: "fur",
  sensitivity: 1,
  fov: 80,
  master: 0.8,
  music: 0.5,
  invertY: false,
  crouch: "hold",
  primary: "cramar",
  quality: "media",
  showInfo: false,
  autoRes: true,
  lastMode: "bataie",
  lastMap: "glemone",
  lastBots: 4,
  lastLevel: "pari",
  lastMinutes: 10,
  lastFf: false,
  training: FRESH_TRAINING,
  trainingInvitation: "open"
}

export function loadSettings(): Settings {
  try {
    const saved: Partial<Settings> = JSON.parse(localStorage.getItem(KEY) ?? "{}")
    const s: Settings = { ...DEFAULTS, ...saved }
    // A value saved by an old version (or a removed map) falls back to the default.
    if (!ROOM_MAP_IDS.includes(s.lastMap)) s.lastMap = DEFAULTS.lastMap
    if (!ROOM_MODE_IDS.includes(s.lastMode)) s.lastMode = DEFAULTS.lastMode
    if (s.crouch !== "hold" && s.crouch !== "toggle") s.crouch = DEFAULTS.crouch
    if (typeof s.lastFf !== "boolean") s.lastFf = DEFAULTS.lastFf
    s.training = TrainingProgressSchema.safeParse(saved.training).data ?? DEFAULTS.training
    // Saved before the invitation existed (or broken): a player who has progress has started the training.
    s.trainingInvitation = TrainingInvitationSchema.safeParse(saved.trainingInvitation).data ?? (s.training.done > 0 ? "started" : "open")
    return s
  } catch {
    return { ...DEFAULTS }
  }
}

/** Where a new training starts: the first station not completed, or station 1 once it has all been completed. */
export function trainingStart(p: TrainingProgress): TrainingStart {
  const unlocked = unlockedOf(p)
  const completed = trainingCompleted(p)
  return { unlocked, from: completed ? STATION_IDS[0] : STATION_IDS[unlocked - 1], completed }
}

/** The progress after a training event: a station completed unlocks the next, the training completed unlocks all. */
export function trainingProgressed(p: TrainingProgress, e: GameEvent): TrainingProgress {
  if (e.t !== "training" || e.a === "step") return p
  const done = e.a === "complete" ? STATION_IDS.length : Math.max(p.done, STATION_IDS.indexOf(e.station) + 1)
  return done === p.done ? p : { done }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

/**
 * The room the home screen's "play against the bots" button makes in one tap: Offline, with the
 * mode, map, duration, bots and bot skill chosen last, friendly fire off. It needs no game server.
 */
export function oneTapRoom(s: Pick<Settings, "lastMode" | "lastMap" | "lastMinutes" | "lastBots" | "lastLevel">): CreateOptions {
  return {
    mode: s.lastMode,
    map: s.lastMap,
    minutes: s.lastMinutes,
    reach: "offline",
    // The button promises bots: a room last made without them falls back to the default.
    bots: s.lastBots || DEFAULTS.lastBots,
    level: s.lastLevel,
    ff: false
  }
}
