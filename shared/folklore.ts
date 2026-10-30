/**
 * Folklore furlan: squadre, modalità, bravura dei bot, frasi rapide.
 * Qui solo i dati senza lingua, condivisi fra server e client: i testi che si
 * leggono (nomi, regole, battute, consigli) stanno in `client/i18n.ts`.
 */
import type { Team } from "./map.ts"

export const TEAM_INFO = {
  benandanti: { short: "BEN", color: "#7fd16b" },
  malandanti: { short: "MAL", color: "#d0435a" }
} as const satisfies Record<Team, { readonly short: string; readonly color: string }>

export type ModeId = "bataie" | "frico" | "culine" | "cjar" | "tampieste"

export const MODES = {
  /** Deathmatch a squadre. */
  bataie: { id: "bataie", scoreLimit: 40 },
  /** Cattura la bandiera (il frico). */
  frico: { id: "frico", scoreLimit: 3 },
  /** Re della collina, in Vie Bini. */
  culine: { id: "culine", scoreLimit: 120 },
  /** Carrello: i Benandanti spingono il cjar fino in fondo, i punti sono la percentuale di strada. */
  cjar: { id: "cjar", scoreLimit: 100 },
  /** Tutti contro tutti, una vita sola, la tempesta stringe: vince l'ultimo in piedi. */
  tampieste: { id: "tampieste", scoreLimit: 1 }
} as const satisfies Record<ModeId, { readonly id: ModeId; readonly scoreLimit: number }>

export const MODE_IDS = Object.keys(MODES) as ModeId[]

/**
 * Frasi rapide (tasto V): viaggiano come testo di chat, quindi restano in
 * friulano per tutti. Il client ne mostra la traduzione se la lingua è un'altra.
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

/** Bravura dei bot: zovin (facile), pari di famee (medio), plevan (difficile). */
export type BotLevel = "zovin" | "pari" | "plevan"
export const BOT_LEVEL_IDS: BotLevel[] = ["zovin", "pari", "plevan"]

/** Serie di uccisioni che meritano un annuncio. */
export const STREAK_AT: ReadonlySet<number> = new Set([3, 5, 7, 10, 15])

export const pick = <T>(list: readonly T[], seed: number): T => list[Math.abs(Math.floor(seed)) % list.length]
