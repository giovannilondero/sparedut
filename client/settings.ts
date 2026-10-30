/** Impostazioni del giocatore, salvate nel browser. */
import type { BotLevel, ModeId } from "../shared/folklore.ts"
import type { MapId } from "../shared/map.ts"
import { MAP_IDS } from "../shared/maps/index.ts"
import type { PrimaryId } from "../shared/weapons.ts"
import type { Lang } from "./i18n.ts"

export interface Settings {
  name: string
  /** Lingua dell'interfaccia: friulano o italiano. */
  lang: Lang
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
  /** L'ultima mappa scelta: è anche lo sfondo del menu. */
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
    // Un valore salvato da una versione vecchia (o una mappa tolta) torna al predefinito.
    if (!MAP_IDS.includes(s.lastMap)) s.lastMap = DEFAULTS.lastMap
    return s
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}
