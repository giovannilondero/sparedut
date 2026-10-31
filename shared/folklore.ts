/**
 * Friulian folklore: teams, modes, bot skill, quick chat.
 * Only language-neutral data here, shared by server and client: readable text
 * (names, rules, quips, tips) lives in `client/i18n.ts`.
 */
import type { Team } from "./map.ts"

export const TEAM_INFO = {
  benandanti: { short: "BEN", color: "#7fd16b" },
  malandanti: { short: "MAL", color: "#d0435a" }
} as const satisfies Record<Team, { readonly short: string; readonly color: string }>

export type ModeId = "bataie" | "frico" | "culine" | "cjar" | "tampieste"

export const MODES = {
  /** Team deathmatch. */
  bataie: { id: "bataie", scoreLimit: 40 },
  /** Capture the flag (the frico). */
  frico: { id: "frico", scoreLimit: 3 },
  /** King of the hill, in Vie Bini. */
  culine: { id: "culine", scoreLimit: 120 },
  /** Payload: the Benandanti push the cjar to the end; the score is the percentage of the way. */
  cjar: { id: "cjar", scoreLimit: 100 },
  /** Free-for-all, one life, the storm closes in: last one standing wins. */
  tampieste: { id: "tampieste", scoreLimit: 1 }
} as const satisfies Record<ModeId, { readonly id: ModeId; readonly scoreLimit: number }>

export const MODE_IDS = Object.keys(MODES) as ModeId[]

/**
 * Quick chat (V key): sent as chat text, so it stays in Friulian for
 * everyone. The client shows a translation if the language is different.
 */
export const QUICK_CHAT = [
  "Mandi!",
  "Ce fastu?",
  "Orpo!",
  "Mostro, ce colp!",
  "Dai mo!",
  "Ajût! Vignît ca!",
  "Il frico al è nestri!",
  "Salût e frico!",
  "Va ben, va ben...",
  "Cjale il cjampanili!"
]

export const BOT_NAMES = {
  benandanti: ["Toni Fenoli", "Bepi dal Racolt", "Gjigji Cjamese", "Marie Benandante", "Pieri Gubane", "Nine Cjarsons", "Tite Glemone", "Mene Fogolâr"],
  malandanti: ["Strie Sorc", "Checo Tampieste", "Bete Grisule", "Malandant Zuan", "Gnese Brovade", "Lussie Sbilf", "Vigji Muset", "Rose Cramâr"]
} as const satisfies Record<Team, readonly string[]>

/** Bot skill: zovin (easy), pari di famee (medium), plevan (hard). */
export type BotLevel = "zovin" | "pari" | "plevan"
export const BOT_LEVEL_IDS: BotLevel[] = ["zovin", "pari", "plevan"]

/** Kill streaks worth announcing. */
export const STREAK_AT: ReadonlySet<number> = new Set([3, 5, 7, 10, 15])

export const pick = <T>(list: readonly T[], seed: number): T => list[Math.abs(Math.floor(seed)) % list.length]
