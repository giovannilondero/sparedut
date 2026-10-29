/**
 * Folklore furlan: squadre, battute, consigli di caricamento, frasi rapide.
 * Testo di contenuto, condiviso fra server (nomi dei bot) e client (UI).
 */
import type { Team } from "./map.ts"
import type { WeaponId } from "./weapons.ts"

export interface TeamInfo {
  readonly name: string
  readonly short: string
  readonly color: string
  readonly weapon: string
  readonly motto: string
  readonly lore: string
}

export const TEAM_INFO = {
  benandanti: {
    name: "Benandanti",
    short: "BEN",
    color: "#7fd16b",
    weapon: "fusti di fenoli",
    motto: "Pal racolt e pe glesie!",
    lore:
      "Nati con la camicia, nelle notti delle Quattro Tempora escono in spirito e combattono con i fusti di finocchio per salvare il raccolto. Documentati davvero nei processi dell'Inquisizione di Aquileia (Ginzburg, 'I benandanti')."
  },
  malandanti: {
    name: "Malandanti",
    short: "MAL",
    color: "#d0435a",
    weapon: "cjanis di sorc",
    motto: "La tampieste e je nestre!",
    lore:
      "Streghe e stregoni armati di canne di sorgo. Vogliono grandine sui campi e frico bruciato nelle padelle. Si vantano di avere il campanile più bello: è il vostro."
  }
} as const satisfies Record<Team, TeamInfo>

export type ModeId = "bataie" | "frico" | "culine"

export interface ModeInfo {
  readonly id: ModeId
  readonly name: string
  readonly sub: string
  readonly rules: string
  /** Punteggio per vincere, predefinito. */
  readonly scoreLimit: number
}

export const MODES = {
  bataie: {
    id: "bataie",
    name: "Bataie di Gnot",
    sub: "Deathmatch a squadre",
    rules: "Ogni avversario abbattuto è un punto per la squadra. Come nelle notti delle Quattro Tempora, ma con più piombo.",
    scoreLimit: 40
  },
  frico: {
    id: "frico",
    name: "Cjape il Frico",
    sub: "Cattura la bandiera",
    rules: "Ruba la forma di frico dalla base nemica (altare del Duomo o loggia del Comun) e portala alla tua, mentre il tuo frico è al sicuro.",
    scoreLimit: 3
  },
  culine: {
    id: "culine",
    name: "Re de Plaçute",
    sub: "Re della collina",
    rules: "Tieni la plaçute di Vie Bini attorno alla fontana. Un punto al secondo per chi la controlla da solo.",
    scoreLimit: 120
  }
} as const satisfies Record<ModeId, ModeInfo>

export const MODE_IDS = Object.keys(MODES) as ModeId[]

/** "X <verbo> Y" nel kill feed, per arma. */
export const KILL_VERBS = {
  mescul: ["al à girât come la polente", "al à mescolât", "al à dât une mesculade a"],
  mandi: ["al à salutât par simpri", "al à dit Mandi a", "al à fat la riverence a"],
  cramar: ["al à vendût plomp a", "al à fat il zîr di Austrie cun", "al à smiliât"],
  doplete: ["al à benedît", "al à mandât a messe", "al à spedît in canoniche"],
  cjampanili: ["al à sunât lis cjampanis a", "al à cjalât di lontan", "al à fat l'Ave Marie a"],
  lanciafrico: ["al à fat frico di", "al à frit", "al à servît cul pan"]
} as const satisfies Record<WeaponId, readonly string[]>

export const SPECIAL_KILLS = {
  sgnape: ["al à fat beve masse sgnape a", "al à imbriagât", "al à fat il brindisi cun"],
  head: "tal cjâf",
  fall: "al è lât a mont",
  self: "si è fat frico di bessôl"
} as const

/** Sotto il "sei morto". */
export const DEATH_LINES = [
  "Ti àn fat frico.",
  "Sei andato a mont. Torna su.",
  "San Cristoforo protegge i viandanti, non i campers.",
  "Il campanile l'hanno ricostruito pietra su pietra. Tu rinasci in 3 secondi.",
  "La Cineteca del Friuli ha già archiviato questo replay.",
  "Messa del Tallero: il sindaco regala un tallero al pievano. Tu hai regalato un punto.",
  "Gnot di Quatri Timps: oggi il raccolto è loro.",
  "Une bocje di sgnape e si torne in pîts.",
  "Ti sei distratto pensando ai cjarsons?",
  "L'aganis della fontana ridono di te.",
  "Un sbilf ti ha legato le stringhe.",
  "Respira. Salût!"
]

/** Consigli nel caricamento e nel menu. */
export const TIPS = [
  "Il cjar di fen ai piedi del campanile ti lancia sul ballatoio dei cecchini.",
  "Il Lanciafrico ricompare in Vie Bini ogni 45 secondi: chi lo prende comanda la plaçute.",
  "Un frico intero ridà 40 punti salute. Due, e sei a posto fino a Pasqua.",
  "La gubana fa da corazza: assorbe metà dei colpi. Come la nonna.",
  "La sgnape ti fa correre più forte per 10 secondi. La visuale ondeggia: è normale.",
  "Mirare (tasto destro) stringe la rosa dei colpi. La Dopiete di Pre Checo resta comunque generosa.",
  "Nel Duomo le colonne della navata sono il miglior riparo della mappa.",
  "Glemone, in furlan. Gemona, in talian. Cimòne, se sei di Udine e vuoi litigare.",
  "Gemona fu distrutta dal terremoto del 1976 e ricostruita 'dov'era e com'era': il Duomo con l'anastilosi, pietra su pietra. Qui si gioca, ma con rispetto.",
  "Il San Cristoforo sulla facciata del Duomo è alto quasi 7 metri (1331). Non sparargli: protegge i viandanti.",
  "I portici di Vie Bini sono trecenteschi: coprono dalla pioggia e dai cecchini.",
  "Pan e vin: se il fumo del falò va a est, raccolto buono. Se va a ovest, prendi il sacco e vai per il mondo.",
  "Tasto Q: torni all'arma di prima. Tasto G: bombe di sgnape. Tasto F: parli col nemico (non ascolta).",
  "Cjape il Frico: se il tuo frico è stato rubato, ammazza il portatore e toccalo per riportarlo a casa.",
  "I bot di difficoltà 'Plevan' non sbagliano mai. Come il plevan quando conta le offerte."
]

/** Frasi rapide (tasti 5-9 tenendo premuto T, o il menu chat). */
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
  "Cjale il campanili!"
]

export const BOT_NAMES = {
  benandanti: ["Toni Fenoli", "Bepi dal Racolt", "Gjigji Cjamese", "Marie Benandante", "Pieri Gubane", "Nine Cjarsons", "Tite Glemone", "Mene Fogolâr"],
  malandanti: ["Strie Sorc", "Checo Tampieste", "Bete Grisule", "Malandant Zuan", "Gnese Brovade", "Lussie Sbilf", "Vigji Muset", "Rose Cramâr"]
} as const satisfies Record<Team, readonly string[]>

export const BOT_LEVELS = {
  zovin: { name: "Zovin", sub: "Facile: apena tornât di Udin" },
  pari: { name: "Pari di famee", sub: "Medio: ha fatto il militare" },
  plevan: { name: "Plevan", sub: "Difficile: vede tutto dall'alto del campanile" }
} as const

export type BotLevel = keyof typeof BOT_LEVELS
export const BOT_LEVEL_IDS = Object.keys(BOT_LEVELS) as BotLevel[]

/** Annunci di serie di uccisioni. */
export const STREAKS: Record<number, string> = {
  3: "TRIS DI FRICO!",
  5: "BENANDANT DAL AN!",
  7: "CJAMPANE A FESTE!",
  10: "PATRIARCJE DI AQUILEE!",
  15: "LEGJENDE DI GLEMONE!"
}

export const pick = <T>(list: readonly T[], seed: number): T => list[Math.abs(Math.floor(seed)) % list.length]
