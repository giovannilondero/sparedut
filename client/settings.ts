/** Impostazioni del giocatore, salvate nel browser. */
import type { BotLevel, ModeId } from "../shared/folklore.ts"
import type { PrimaryId } from "../shared/weapons.ts"

export interface Settings {
  name: string
  sensitivity: number
  fov: number
  master: number
  music: number
  invertY: boolean
  primary: PrimaryId
  quality: "bassa" | "media" | "alta"
  /** Pannello prestazioni (F3). */
  showInfo: boolean
  /** Risoluzione dinamica: abbassa la risoluzione quando gli FPS calano. */
  autoRes: boolean
  lastMode: ModeId
  lastBots: number
  lastLevel: BotLevel
  lastMinutes: number
}

const KEY = "sparedut.settings"
const DEFAULTS: Settings = {
  name: "",
  sensitivity: 1,
  fov: 80,
  master: 0.8,
  music: 0.5,
  invertY: false,
  primary: "cramar",
  quality: "media",
  showInfo: false,
  autoRes: true,
  lastMode: "bataie",
  lastBots: 4,
  lastLevel: "pari",
  lastMinutes: 10
}

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}
