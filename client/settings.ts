/** Player settings, saved in the browser. */
import { ROOM_MODE_IDS, type BotLevel, type RoomModeId } from "../shared/folklore.ts"
import { ROOM_MAP_IDS, type RoomMapId } from "../shared/maps/index.ts"
import type { PrimaryId } from "../shared/weapons.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { STATION_IDS } from "../shared/training/index.ts"
import type { TrainingStart } from "../shared/training/start.ts"
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
}

/**
 * How far the player has got in the training, as the browser keeps it. Ticket #52 adds whether
 * the home screen's invitation was dismissed here; starting over resets only what is below.
 */
export interface TrainingProgress {
  /** How many stations, from the first, are unlocked: 1 to all of them. */
  readonly unlocked: number
  /** The training has been completed once: every station stays unlocked. */
  readonly completed: boolean
}

/** A training never started, and what starting over goes back to. */
export const FRESH_TRAINING: TrainingProgress = { unlocked: 1, completed: false }

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
  training: FRESH_TRAINING
}

export function loadSettings(): Settings {
  try {
    const s: Settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }
    // A value saved by an old version (or a removed map) falls back to the default.
    if (!ROOM_MAP_IDS.includes(s.lastMap)) s.lastMap = DEFAULTS.lastMap
    if (!ROOM_MODE_IDS.includes(s.lastMode)) s.lastMode = DEFAULTS.lastMode
    if (s.crouch !== "hold" && s.crouch !== "toggle") s.crouch = DEFAULTS.crouch
    if (typeof s.lastFf !== "boolean") s.lastFf = DEFAULTS.lastFf
    if (!validProgress(s.training)) s.training = DEFAULTS.training
    return s
  } catch {
    return { ...DEFAULTS }
  }
}

const validProgress = (p: unknown): p is TrainingProgress => {
  if (typeof p !== "object" || p === null) return false
  const { unlocked, completed } = p as Record<string, unknown>
  return Number.isInteger(unlocked) && (unlocked as number) >= 1 && (unlocked as number) <= STATION_IDS.length && typeof completed === "boolean"
}

/** Where a new training starts: the first station not completed, or station 1 once it has all been completed. */
export function trainingStart(p: TrainingProgress): TrainingStart {
  if (p.completed) return { unlocked: STATION_IDS.length, from: STATION_IDS[0] }
  return { unlocked: p.unlocked, from: STATION_IDS[p.unlocked - 1] }
}

/** The progress after a training event: a station completed unlocks the next, the training completed unlocks all. */
export function trainingProgressed(p: TrainingProgress, e: GameEvent): TrainingProgress {
  if (e.t !== "training" || e.a === "step") return p
  if (e.a === "complete") return { unlocked: STATION_IDS.length, completed: true }
  const unlocked = Math.min(STATION_IDS.length, Math.max(p.unlocked, STATION_IDS.indexOf(e.station) + 2))
  return unlocked === p.unlocked ? p : { ...p, unlocked }
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
