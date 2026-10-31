/** Player settings, saved in the browser. */
import type { BotLevel, ModeId } from "../shared/folklore.ts"
import type { MapId } from "../shared/map.ts"
import { MAP_IDS } from "../shared/maps/index.ts"
import type { PrimaryId } from "../shared/weapons.ts"
import type { Lang } from "./i18n.ts"

export interface Settings {
  name: string
  /** Interface language: Friulian or Italian. */
  lang: Lang
  sensitivity: number
  fov: number
  master: number
  music: number
  invertY: boolean
  primary: PrimaryId
  quality: "bassa" | "media" | "alta"
  /** Performance panel (F3). */
  showInfo: boolean
  /** Dynamic resolution: lowers the resolution when FPS drops. */
  autoRes: boolean
  lastMode: ModeId
  /** The last chosen map: it's also the menu background. */
  lastMap: MapId
  lastBots: number
  lastLevel: BotLevel
  lastMinutes: number
}

const KEY = "sparedut.settings"
const DEFAULTS: Settings = {
  name: "",
  lang: "fur",
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
  lastMap: "glemone",
  lastBots: 4,
  lastLevel: "pari",
  lastMinutes: 10
}

export function loadSettings(): Settings {
  try {
    const s: Settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }
    // A value saved by an old version (or a removed map) falls back to the default.
    if (!MAP_IDS.includes(s.lastMap)) s.lastMap = DEFAULTS.lastMap
    return s
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}
