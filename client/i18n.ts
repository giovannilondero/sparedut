/**
 * The languages: Friulian and Italian. Every visible text comes from here.
 *
 * Friulian is the base language: Italian must have the same shape
 * (`satisfies Strings`). Proper names (weapons, modes, feats) stay
 * in Friulian in both languages: they are the flavour of the game.
 * Quick chat phrases go to the other players as text, and stay in Friulian.
 */
import type { BotLevel, ModeId } from "../shared/folklore.ts"
import type { MapId, Team } from "../shared/map.ts"
import type { Access, ErrorCode, Reach } from "../shared/protocol.ts"
import type { PhaseView } from "../shared/sim/view.ts"
import type { StationId } from "../shared/training/index.ts"
import type { WeaponId } from "../shared/weapons.ts"
import type { Device } from "./device.ts"
import type { Notice } from "./offline-cache/too-old.ts"
import { CONTROL_TEXT, type ControlTexts } from "./training-text/controls.ts"
import { stepsIn, type StepsIn } from "./training-text/index.ts"

export type Lang = "fur" | "it"

type Fn<A extends unknown[] = [string]> = (...args: A) => string

/** Static HTML texts: `data-t="key"` (innerHTML) and `data-t-ph="key"` (placeholder). */
type StaticKey =
  | "title" | "nameLabel" | "namePh" | "oneTap" | "oneTapSub" | "create" | "createSub" | "join"
  | "roomsTitle" | "armarie" | "settings" | "vocab" | "minutesLabel" | "botsLabel" | "levelLabel" | "reachLabel"
  | "ff" | "back" | "createGo" | "joinGo" | "armarieTitle" | "sens" | "fov" | "volume" | "music" | "quality" | "qLow" | "qMid"
  | "qHigh" | "autoRes" | "showInfo" | "invert" | "keys" | "vocabTitle" | "connecting" | "chatPh" | "deathTitle" | "deathHint"
  | "language" | "modeLabel" | "mapLabel" | "optionsLabel" | "crouchMode" | "crouchHold" | "crouchToggle"
  | "accessLabel" | "accessOpen" | "accessPassword" | "passwordLabel" | "passwordTitle" | "training" | "trainingSub"

export interface Strings {
  readonly static: Record<StaticKey, string>
  /** The training's HUD and announcements. Step instructions are in `client/training-text/`, one file per station. */
  readonly training: {
    /** Station `n` of `total`, with its name: the head of the training's panel. */
    readonly station: Fn<[n: number, total: number, name: string]>
    /** Which step of the station the player is on, beside the station's step marks. */
    readonly step: Fn<[n: number, total: number]>
    readonly stations: Record<StationId, string>
    readonly steps: StepsIn
    /** Each control a step names, as each device that has it shows it (markup): `client/training-text/controls.ts`. */
    readonly controls: ControlTexts
    /** In place of a step's instruction when the active device has no control for it. */
    readonly unavailable: string
    /** A repeated step's count so far. */
    readonly count: Fn<[done: number, target: number]>
    /** The brief confirmation of a step done. */
    readonly stepDone: string
    readonly stationDone: string
    readonly complete: string
    readonly completeSub: string
    /** The match menu's line in place of the room's reach. */
    readonly menuLine: string
    /** The completion screen's way back home (the station list is `stationList`, the one-tap match the home screen's own). */
    readonly done: { readonly home: string }
    /** The match menu's station list and its actions (ticket #51). */
    readonly stationList: string
    readonly here: string
    /** On entering the training, the station that continues where the player left off. */
    readonly continueHere: string
    /** On entering the training, above the station list: choose where to start. */
    readonly chooseStation: string
    readonly locked: string
    readonly restart: string
    readonly startOver: string
    /** The second press that confirms starting over: the saved progress is lost. */
    readonly startOverSure: string
    /** The home screen's training entry (ticket #52): its completed mark and the invitation. */
    readonly entry: {
      readonly completed: string
      /** The invitation: the ribbon on the entry itself, and its close button's label. */
      readonly ribbon: string
      readonly close: string
    }
  }
  readonly teams: Record<Team, { readonly name: string; readonly motto: string }>
  readonly modes: Record<ModeId, { readonly name: string; readonly sub: string; readonly rules: string }>
  readonly maps: Record<MapId, { readonly name: string; readonly sub: string }>
  readonly levels: Record<BotLevel, { readonly name: string; readonly sub: string }>
  readonly weapons: Record<WeaponId, { readonly name: string; readonly short: string; readonly blurb: string }>
  readonly bomb: string
  readonly mine: string
  readonly quality: Record<"bassa" | "media" | "alta", string>
  readonly errors: Record<ErrorCode, string>
  /** The game is too old for the server (`client/offline-cache/too-old.ts`): updating itself, or why it cannot. */
  readonly tooOld: Record<Notice, string>
  /** The installable game in the menu: the install entry and the update notice. */
  readonly app: {
    readonly install: string
    /** How to add the game to the home screen where the browser has no install prompt (iPhone, iPad). */
    readonly byHand: string
    readonly update: string
    readonly updating: string
  }
  readonly menu: {
    readonly needName: string
    readonly roomsEmpty: string
    /** A room code that is not four letters, said under the code field. */
    readonly codeBad: string
    /** The chip on a room in the list. */
    readonly reach: Record<Reach, string>
    /** A full room in the list: shown, not selectable. */
    readonly full: string
    /** A room's phase in the list: in its Muster, in a match, showing a match's results. */
    readonly phase: Record<PhaseView["tag"], string>
    /** The mark on a room with a password in the list, read out by screen readers. */
    readonly passwordRoom: string
    /** The password prompt: which room asks for it. */
    readonly passwordFor: Fn
    /** A password the create form or the prompt refuses before sending it. */
    readonly passwordBad: string
    readonly botsNone: string
    /** Bots per team in a few words, for creation's options line. */
    readonly bots: Fn<[number]>
    /** Friendly fire on, in creation's options line. */
    readonly ffOn: string
    readonly minutes: Fn<[number]>
    readonly tag: { readonly primary: string; readonly power: string; readonly melee: string; readonly pistol: string }
    readonly stat: { readonly damage: string; readonly rate: string; readonly range: string; readonly mag: string; readonly health: string; readonly speed: string }
    readonly vocab: readonly (readonly [string, string])[]
    /** One line on who can see and join a room of that reach. */
    readonly reachSub: Record<Reach, string>
    /** The look selector's label (Cumò, Vêr). */
    readonly look: string
  }
  readonly net: {
    readonly connecting: string
    readonly connected: Fn
    readonly stranger: string
    readonly invite: Fn
    readonly inviteNeedName: Fn
    readonly retry: string
    readonly down: string
    readonly lost: string
    readonly lostRetry: string
    /** The host of an Offline room did not start in this browser. */
    readonly offlineFailed: string
    /** Vêr was chosen, but with no network and never downloaded: Cumò is shown instead. */
    readonly verOffline: string
  }
  readonly hud: {
    readonly over: string
    readonly modeLabel: Fn<[string, number]>
    readonly flagHome: string
    readonly flagCarried: Fn
    readonly flagDropped: Fn<[number]>
    readonly contested: string
    readonly hillOwned: Fn
    readonly hillFree: string
    readonly streak: Fn<[string, number]>
    readonly deathBy: Fn
    readonly deathSelf: string
    readonly respawnIn: Fn<[number]>
    readonly shield: string
    readonly board: readonly string[]
    readonly kill: Record<WeaponId | "sgnape" | "mine", readonly string[]> & {
      readonly storm: string
      readonly head: string
      readonly fall: string
      readonly self: string
      readonly pushed: string
    }
    readonly deathLines: readonly string[]
    readonly streaks: Record<number, string>
    /** Push the Cjar: the distance covered. */
    readonly cart: Fn<[number]>
    readonly cartPush: Fn<[number]>
    readonly cartStop: string
    readonly cartBack: string
    readonly cartIdle: string
    /** The Tampieste: how many are still standing. */
    readonly alive: Fn<[number]>
    readonly stormOutside: string
    readonly spectate: string
    readonly healed: Fn<[string, number]>
    /** The prompt to start playing, naming the active device's control. */
    readonly play: Readonly<Record<Device, string>>
    /** Turrets: the active device's control to mount, to dismount; the heat. */
    readonly turretUse: Readonly<Record<Device, string>>
    readonly turretLeave: Readonly<Record<Device, string>>
    /** The touch button that mounts a free turret, and the one that dismounts in its place. */
    readonly touchUse: string
    readonly touchLeave: string
    readonly turretHeat: string
    readonly turretHot: string
  }
  readonly game: {
    readonly sgnape: string
    readonly sgnapeSub: string
    readonly flag: { readonly takenMine: string; readonly taken: string; readonly dropped: string; readonly returned: string; readonly capturedMine: string; readonly captured: string }
    readonly flagSub: Fn<[string, string]>
    readonly hillTaken: Fn
    readonly start: string
    readonly startSub: string
    readonly cart: { readonly push: string; readonly stop: string; readonly back: string; readonly arrived: string }
    readonly cartSub: Fn<[boolean]>
    readonly stormStart: string
    readonly stormStartSub: string
    /** Translation of the quick phrases, if the language isn't Friulian. */
    readonly quickGloss: readonly string[] | null
    /** A map's door broken down: who broke it. */
    readonly doorBroken: Fn<[string]>
    readonly doorSub: string
    /** The gjaline's feathers in the eyes. */
    readonly plumis: string
  }
  readonly loadout: { readonly title: string; readonly note: string; readonly resume: string }
  readonly pause: {
    readonly code: string
    readonly copy: string
    readonly copied: string
    readonly reach: Record<Reach, string>
    readonly access: Record<Access, string>
    readonly start: string
    readonly restart: string
    readonly hostOnly: string
    /** The host tools' label. */
    readonly host: string
    /** The host's buttons that add or remove a bot in a team (its short name). */
    readonly addBot: Fn
    readonly removeBot: Fn
    readonly level: string
    readonly switchTeam: Fn
    readonly leave: string
  }
  readonly end: {
    readonly draw: string
    readonly win: string
    readonly lose: string
    readonly drawSub: string
    readonly winSub: Fn<[string, string]>
    /** The Tampieste: one person wins. */
    readonly lastStanding: Fn
    readonly lastStandingSub: string
    readonly mvp: Record<Team, string>
    readonly killer: string
    readonly streak: string
    readonly head: string
    readonly points: Fn<[number]>
    readonly kills: Fn<[number]>
    readonly row: Fn<[number]>
    readonly heads: Fn<[number]>
    readonly restartIn: Fn<[number]>
    readonly leave: string
    readonly again: string
  }
  /** The Muster: the room before a match, where players choose a team and a primary and the host starts. */
  readonly muster: {
    readonly title: string
    readonly primary: string
    readonly chat: string
    readonly chatPlaceholder: string
  }
  readonly perf: { readonly snaps: string; readonly players: string; readonly corrections: string; readonly hide: string; readonly menu: string; readonly dynRes: string }
  readonly tips: readonly string[]
}

const KEYS_FUR = [
  ["WASD", "môf"],
  ["Mouse", "cjale · <kbd>Çampe</kbd> spare · <kbd>Drete</kbd> mire"],
  ["Spazi", "salte"],
  ["Ctrl</kbd>/<kbd>C", "sbassiti"],
  ["Shift", "cor"],
  ["R", "torne a cjamâ"],
  ["1-4", "armis · <kbd>Q</kbd> chê di prime"],
  ["G", "bombis di sgnape"],
  ["F", "mine di Raibl"],
  ["Tab", "classifiche"],
  ["Invio", "chat · <kbd>V</kbd> frasis sveltis"],
  ["B", "armarie"],
  ["Esc", "menù de partide · indaûr"],
  ["F3", "prestazions"],
  ["🎮 DualShock", "stick çamp môf · stick dret cjale · <kbd>R2</kbd> spare · <kbd>L2</kbd> mire · <kbd>✕</kbd> salte · <kbd>◯</kbd> sbassiti · <kbd>L3</kbd> cor · <kbd>▢</kbd> torne a cjamâ · <kbd>△</kbd> arme dopo · crôs armis · <kbd>R3</kbd> mescul · <kbd>L1</kbd> bombe · <kbd>R1</kbd> mine · <kbd>Share</kbd> classifiche · <kbd>Touchpad</kbd> armarie · <kbd>Options</kbd> menù"]
]

const KEYS_IT = [
  ["WASD", "muoviti"],
  ["Mouse", "guarda · <kbd>Sx</kbd> spara · <kbd>Dx</kbd> mira"],
  ["Spazio", "salta"],
  ["Ctrl</kbd>/<kbd>C", "accucciati"],
  ["Shift", "corri"],
  ["R", "ricarica"],
  ["1-4", "armi · <kbd>Q</kbd> quella di prima"],
  ["G", "bombe di sgnape"],
  ["F", "mina di Raibl"],
  ["Tab", "classifica"],
  ["Invio", "chat · <kbd>V</kbd> frasi rapide"],
  ["B", "armeria"],
  ["Esc", "menu partita · indietro"],
  ["F3", "prestazioni"],
  ["🎮 DualShock", "stick sinistro muoviti · stick destro guarda · <kbd>R2</kbd> spara · <kbd>L2</kbd> mira · <kbd>✕</kbd> salta · <kbd>◯</kbd> accucciati · <kbd>L3</kbd> corri · <kbd>▢</kbd> ricarica · <kbd>△</kbd> arma dopo · croce armi · <kbd>R3</kbd> mescul · <kbd>L1</kbd> bomba · <kbd>R1</kbd> mina · <kbd>Share</kbd> classifica · <kbd>Touchpad</kbd> armeria · <kbd>Options</kbd> menu"]
]

const keysHtml = (rows: string[][]) => rows.map(([k, d]) => `<div><kbd>${k}</kbd> ${d}</div>`).join("")

/** The glossary is Friulian → Italian in both languages: that's what it's for. */
const VOCAB: readonly (readonly [string, string])[] = [
  ["Sparedût", "sparatoria, scaramuccia (gioco di parole su 'sparâ', sparare)"],
  ["Glemone", "Gemona, in friulano"],
  ["Dom", "il Duomo di Santa Maria Assunta"],
  ["Cjampanili", "campanile. Quello di Gemona è stato ricostruito dopo il 1976"],
  ["Benandants", "i benandanti: contadini nati con la camicia che combattevano di notte, in spirito, con fusti di finocchio"],
  ["Malandants", "i loro nemici, streghe e stregoni armati di canne di sorgo"],
  ["Fenoli · Sorc", "finocchio · sorgo"],
  ["Frico", "formaggio Montasio e patate in padella, croccante fuori e morbido dentro. Qui cura 40 punti"],
  ["Gubane", "dolce a spirale di noci e uvetta. Qui fa da corazza"],
  ["Sgnape", "grappa. Fa correre, e girare la testa"],
  ["Mescul", "il bastone per girare la polenta"],
  ["Cramâr", "venditore ambulante carnico che portava spezie oltralpe"],
  ["Plevan", "il pievano, il parroco della pieve"],
  ["Pre Checo", "don Francesco, parroco di fantasia con una doppietta molto benedetta"],
  ["Cjar di fen", "carro di fieno: qui ti lancia in alto"],
  ["Plaçute", "piazzetta"],
  ["Zovin · Pari di famee", "giovane · padre di famiglia"],
  ["Mandi!", "ciao, arrivederci: il saluto friulano per eccellenza"],
  ["Ce fastu?", "che fai? come va?"],
  ["Orpo!", "esclamazione di sorpresa"],
  ["Mostro!", "accipicchia! (in senso buono)"],
  ["Salût!", "salute! (si brinda)"],
  ["Ajût!", "aiuto!"],
  ["Indaûr", "indietro"],
  ["Tal cjâf", "in testa (colpo alla testa)"],
  ["Al à fat frico di…", "lo ha ridotto a frico: lo ha fatto fuori"],
  ["Agane · Sbilf", "fata delle acque · folletto dispettoso della Carnia"],
  ["Pan e vin", "il falò dell'Epifania: dal fumo si legge l'annata"],
  ["Messe dal Talar", "il 6 gennaio nel Duomo il sindaco offre un tallero d'argento al pievano: tradizione vera di Gemona"],
  ["Anastilosi", "ricostruzione pietra su pietra: così è rinato il Duomo dopo il terremoto del 1976. 'Prime lis fabrichis, po lis cjasis, po lis glesiis.'"]
]

const WEAPON_NAMES = {
  mescul: { name: "Mescul de Polente", short: "Mescul" },
  mandi: { name: "La Mandi", short: "Mandi" },
  cramar: { name: "Mitra dal Cramâr", short: "Mitra" },
  doplete: { name: "Dopiete di Pre Checo", short: "Dopiete" },
  cjampanili: { name: "Il Cjampanili", short: "Cjampanili" },
  mulin: { name: "Il Mulin", short: "Mulin" },
  miedi: { name: "Cassele dal Miedi", short: "Miedi" },
  gjalinis: { name: "Cjanon des Gjalinis", short: "Gjalinis" },
  lanciafrico: { name: "Lanciafrico", short: "Lanciafrico" },
  mitraie: { name: "Mitraie de Postazion", short: "Mitraie" },
  motosee: { name: "Motosee", short: "Motosee" }
} as const

/** The labels on the touch "use" button, mounting and dismounting: the turret prompts on touch name them. */
const FUR_TOUCH = { use: "Mitraie", leave: "Lasse" } as const
const IT_TOUCH = { use: "Mitragliatrice", leave: "Lascia" } as const

const fur: Strings = {
  static: {
    title: "Sparedût — Bataie tal Dom di Glemone",
    nameLabel: "Il to non",
    namePh: "Toni di Glemone",
    oneTap: "Zuie cuintri i bot",
    oneTapSub: "Offline cuintri il computer, ancje cence server",
    training: "Impare a zuiâ",
    trainingSub: "La Dutrine a la Sagre dal Frico, ancje cence server",
    create: "Cree une partide",
    createSub: "Offline, te rêt locâl o in linie",
    join: "Jentre cul codiç",
    roomsTitle: "Partidis viertis <small>(prime la tô rêt, po in linie)</small>",
    armarie: "Armarie",
    settings: "Impostazions",
    vocab: "Vocabolari",
    minutesLabel: "Durade",
    botsLabel: "Bot par scuadre",
    levelLabel: "Bravure dai bot",
    reachLabel: "Puartade",
    accessLabel: "Acès",
    accessOpen: "Viert",
    accessPassword: "Cun password",
    passwordLabel: "Password <small>(di 1 a 32 caratars)</small>",
    passwordTitle: "Al covente la password",
    ff: "Fûc amì (i compagns si fasin mâl)",
    back: "Indaûr <kbd>Esc</kbd>",
    createGo: "Cree e jentre",
    joinGo: "Jentre",
    armarieTitle: "Armarie <small>· sielç l'arme principâl</small>",
    sens: "Sensibilitât dal mouse",
    fov: "Cjamp visîf",
    volume: "Volum",
    music: "Musiche",
    quality: "Cualitât grafiche",
    qLow: "Basse (il portatil dal nono)",
    qMid: "Medie",
    qHigh: "Alte (ombrenis bielis)",
    autoRes: "Risoluzion dinamiche (e sbasse la risoluzion se i FPS a calin)",
    showInfo: "Mostre lis informazions su lis prestazions (FPS, ping…) · ancje cul tast <kbd>F3</kbd>",
    invert: "Invertìs l'ass verticâl",
    crouchMode: "Sbassâsi",
    crouchHold: "tignint fracât il tast",
    crouchToggle: "fracant une volte (torne a fracâ par jevâ sù)",
    keys: keysHtml(KEYS_FUR),
    vocabTitle: "Vocabolari furlan-talian",
    connecting: "Conession…",
    chatPh: "Scrîf… (Invio par mandâ)",
    deathTitle: "Ti àn fat frico!",
    deathHint: "Frache <kbd>B</kbd> par cambiâ l'arme principâl",
    language: "Lenghe",
    modeLabel: "Modalitât",
    mapLabel: "Mape",
    optionsLabel: "Opzions"
  },
  training: {
    station: (n, total, name) => `Stazion ${n} di ${total} · ${name}`,
    step: (n, total) => `Pas ${n} di ${total}`,
    stations: {
      look: "Cjale e cjamine",
      course: "Il percors",
      always: "Simpri cun te",
      switch: "Gambiâ arme",
      stalls: "Lis bancjarelis",
      armoury: "La armarie",
      throw: "Bombis e minis",
      pickups: "Robe di cjapâ sù",
      turret: "La torete e il Lanciafrico",
      medic: "Il miedi",
      modes: "Lis modalitâts",
      skirmish: "La scaramucie"
    },
    steps: stepsIn("fur"),
    controls: CONTROL_TEXT.fur,
    unavailable: "No si pues fâ cun chest dispositîf",
    count: (done, target) => `${done} di ${target}`,
    stepDone: "Fat!",
    stationDone: "Stazion finide",
    complete: "Dutrine finide!",
    completeSub: "Cumò tu sâs dut: va a zuiâ",
    menuLine: "Dutrine · Offline, dome tu",
    done: { home: "Torne al inizi" },
    stationList: "Lis stazions",
    here: "Tu sês culì",
    continueHere: "Va indenant",
    chooseStation: "Sielç la stazion di dulà tacâ",
    locked: "Ancjemò sierade",
    restart: "Torne a tacâ la stazion",
    startOver: "Torne a tacâ dal principi",
    startOverSure: "Sigûr? Tu pierdis dut ce che tu âs fat",
    entry: {
      completed: "✓ Finide",
      ribbon: "Gnûf? Tache di chi",
      close: "No sta invidâmi plui"
    }
  },
  teams: {
    benandanti: { name: "Benandants", motto: "Pal racolt e pe glesie!" },
    malandanti: { name: "Malandants", motto: "La tampieste e je nestre!" }
  },
  modes: {
    bataie: {
      name: "Bataie di Gnot",
      sub: "Bataie a scuadris",
      rules: "Ogni aversari bufât al è un pont pe scuadre. Come tes gnots dai Cuatri Timps, ma cun plui plomp."
    },
    frico: {
      name: "Cjape il Frico",
      sub: "Cjape la bandiere",
      rules: "Robe la forme di frico de base nemie (l'altâr dal Dom o la loze dal Comun) e puartile te tô, intant che il to frico al è al sigûr."
    },
    culine: {
      name: "Re de Plaçute",
      sub: "Re de culine",
      rules: "Ten la plaçute di Vie Bini ator de fontane. Un pont al secont par cui che le ten di bessôl."
    },
    cjar: {
      name: "Spinç il Cjar",
      sub: "Sburte il cjar",
      rules: "I Benandants a sburtin il cjar fin insom de strade: al va indenant se un Benandant i sta dongje e nissun Malandant. I Malandants lu fermin fin che al finìs il timp. Lassât di bessôl, al torne indaûr."
    },
    tampieste: {
      name: "La Tampieste",
      sub: "Ducj cuintri ducj",
      rules: "Nissune scuadre, une vite sole. La tampieste e strenç: fûr dal cercli la grampe e fâs mâl. L'ultin in pîts al vinç."
    },
    dutrine: {
      name: "Dutrine",
      sub: "La sagre che e insegne a zuiâ",
      rules: "Une stazion daûr di chê altre: fâs ogni pas che al ti vegn domandât e la strade si vierç."
    }
  },
  maps: {
    glemone: { name: "Glemone", sub: "Il Dom, Vie Bini e la place dal Comun" },
    osoppo: { name: "Fuart di Osôf", sub: "La fortece sul cuel, bastions e galariis" },
    trincee: { name: "Trinceis dal Pal Piçul", sub: "La Grande Vuere tes Alps Cjargnelis" },
    venzone: { name: "Vençon", sub: "Il borc dentri lis muris e il Dom di Sant Andree" },
    predil: { name: "Cave dal Predil", sub: "La miniere di Raibl, binaris e carei" },
    maran: { name: "Lagune di Maran", sub: "Di gnot, sot de lune: la riserve, il bosc e il casot dai fenicotars" },
    sagre: { name: "Sagre dal Frico", sub: "La fieste dal paîs: lis bancjarelis in file e la place" }
  },
  levels: {
    zovin: { name: "Zovin", sub: "Facil: apene tornât di Udin" },
    pari: { name: "Pari di famee", sub: "Medi: al à fat il militâr" },
    plevan: { name: "Plevan", sub: "Dificil: al viôt dut di sù dal cjampanili" }
  },
  weapons: {
    mescul: { ...WEAPON_NAMES.mescul, blurb: "Il baston par messedâ la polente. Al messede ancje lis musis." },
    mandi: { ...WEAPON_NAMES.mandi, blurb: "Pistole semiautomatiche. E salude e po e spare, in chest ordin." },
    cramar: { ...WEAPON_NAMES.cramar, blurb: "I cramârs a vendevin spezie in Austrie. Chest al vent plomp." },
    doplete: { ...WEAPON_NAMES.doplete, blurb: "La dopiete dal plevan. E benedìs a curte distance." },
    cjampanili: { ...WEAPON_NAMES.cjampanili, blurb: "Fusil di precision. Alt, dret e tornât a fâ piere su piere." },
    mulin: { ...WEAPON_NAMES.mulin, blurb: "Al masane plomp come il mulin la blave. Prime al à di cjapâ zîr, e al pese tant che un sac di farine." },
    miedi: {
      ...WEAPON_NAMES.miedi,
      blurb: "Un sbrufadôr di sgnape e cjamomile: al tache i compagns e al bruse i nemîs. Cui che lu puarte al è il miedi: ator di lui si guarìs."
    },
    gjalinis: {
      ...WEAPON_NAMES.gjalinis,
      blurb: "Un tubo di oton leât sul braç che al spare gjalinis. Lis gjalinis a svolin, a cirin il nemì di bessolis e i sclopin intor intune nule di plumis: par un pôc nol viôt plui nuie."
    },
    lanciafrico: {
      ...WEAPON_NAMES.lanciafrico,
      blurb: "Al tire formis di frico bulintis che a sbalcin e a sclopin. Arme potente: si cjape sù in Vie Bini."
    },
    mitraie: {
      ...WEAPON_NAMES.mitraie,
      blurb: "No si puarte: e je su lis toretis. Colps infinits e svelts, ma se no tu molis il grilet si scjalde e si ferme."
    },
    motosee: {
      ...WEAPON_NAMES.motosee,
      blurb: "A rivin chei di Paulâr. Ten strent il grilet: dopo une sgasade e tae ce che al è denant, a un braç di distance. No à bisugne di munizions, e si le sint di lontan."
    }
  },
  bomb: "Bombis di Sgnape",
  mine: "Minis di Raibl",
  quality: { bassa: "basse", media: "medie", alta: "alte" },
  errors: {
    invalid: "Messaç no valit.",
    version: "Version diferente dal server: torne a cjariâ la pagjine.",
    notFound: "Nissune partide cun chest codiç. Controle, o domande al host.",
    lanOnly: "Cheste partide e je dome pe rêt locâl di cui che le à creade.",
    full: "Partide plene: o sin za in sedis, come a une sagre.",
    busy: "Masse partidis viertis sul server: torne a provâ ca di un pôc.",
    passwordRequired: "Cheste partide e domande une password.",
    wrongPassword: "Password sbaliade. Torne a provâ.",
    tooManyAttempts: "Masse password sbaliadis: spiete un pôc e torne a provâ."
  },
  tooOld: {
    updating: "Il server al à une version plui gnove dal zûc: le stoi cjamant jù, po la pagjine si torne a cjamâ di bessole.",
    noWorker: "Version diferente dal server: torne a cjariâ la pagjine.",
    noUpdate: "Il server al à une version plui gnove, ma no rivi a cjamâle jù. Lis partidis offline a van istès.",
    stillRefused: "Il server nol acete ancjemò cheste version. Lis partidis offline a van istès: torne a provâ plui tart."
  },
  app: {
    install: "Instale il zûc",
    byHand: "Par vê il zûc su la schermade di inizi: tocje Condividi e po «Aggiungi alla schermata Home».",
    update: "E je pronte une version gnove dal zûc: tocje par cjariâle.",
    updating: "O cjarii la version gnove…"
  },
  menu: {
    needName: "Prime il non!",
    roomsEmpty: "Nissune partide viarte. Creine une!",
    codeBad: "Il codiç al à 4 letaris.",
    reach: { offline: "Offline", lan: "LAN", online: "In linie" },
    full: "Plene",
    phase: { Muster: "Adunade", Live: "In partide", Over: "Partide finide" },
    passwordRoom: "Cun password",
    passwordFor: (code) => `La partide ${code} e domande une password.`,
    passwordBad: "La password e à di vê di 1 a 32 caratars.",
    botsNone: "Nissun (dome personis)",
    bots: (n) => (n === 0 ? "Cence bot" : `${n} bot`),
    ffOn: "Fûc amì",
    minutes: (n) => `${n} minûts`,
    tag: {
      primary: "Arme principâl · clic par sielzile",
      power: "Arme potente · si cjape sù",
      melee: "Cuarp a cuarp · simpri cun te",
      pistol: "Pistole · simpri cun te"
    },
    stat: { damage: "Dam", rate: "Cjadence", range: "Puartade", mag: "Cjamadôr", health: "Salût", speed: "Velocitât" },
    vocab: VOCAB,
    reachSub: {
      offline: "Dome tu cuintri i bot, in chest navigadôr",
      lan: "Dome cui che al è te tô stesse rêt",
      online: "Ducj a puedin viodile e jentrâ"
    },
    look: "Aspiet"
  },
  net: {
    connecting: "Conession al server…",
    connected: (name) => `Conetût · Mandi, ${name}!`,
    stranger: "forest",
    invite: (code) => `Invît a la partide ${code}…`,
    inviteNeedName: (code) => `Scrîf il to non e jentre cul codiç ${code}`,
    retry: "Server no rivât. O torni a provâ…",
    down: "Il server nol rispuint. Isal impiât? (pnpm dev)",
    lost: "Conession pierdude. Mandi!",
    lostRetry: "Conession pierdude: o torni a provâ…",
    offlineFailed: "No rivi a inviâ la partide offline: torne a cjamâ la pagjine.",
    verOffline: "Vêr nol è ancjemò stât discjamât e no tu âs rêt: intant tu viodis Cumò."
  },
  hud: {
    over: "FIN",
    modeLabel: (name, n) => `${name} · fin a ${n}`,
    flagHome: "a cjase",
    flagCarried: (who) => `cjapât di ${who}`,
    flagDropped: (s) => `par tiere ${s}s`,
    contested: "Contindude!",
    hillOwned: (team) => `Plaçute: ${team}`,
    hillFree: "Plaçute libare",
    streak: (name, n) => `${name} · ${n} di file`,
    deathBy: (name) => `Ti à fat fûr <b>${name}</b>`,
    deathSelf: "Tu ti sês fat mâl di bessôl",
    respawnIn: (s) => `Si torne in pîts tra ${s}…`,
    shield: "✨ Protezût",
    board: ["Non", "Arme", "Ponts", "Copâts", "Muarts", "Ajûts", "Frics", "Serie", "Ping"],
    kill: {
      mescul: ["al à messedât come la polente", "al à mesculât", "al à dât une mesculade a"],
      mandi: ["al à saludât par simpri", "al à dit Mandi a", "al à fat la riverence a"],
      cramar: ["al à vendût plomp a", "al à fat il zîr de Austrie cun", "al à smicjât"],
      doplete: ["al à benedît", "al à mandât a messe", "al à spedît in canoniche"],
      cjampanili: ["al à sunât lis cjampanis a", "al à cjalât di lontan", "al à dit l'Ave Marie a"],
      lanciafrico: ["al à fat frico di", "al à frizût", "al à servît cul pan"],
      mulin: ["al à masanât", "al à fat farine di", "al à metût sot la muele"],
      miedi: ["al à dât la medisine sbaliade a", "al à curât par simpri", "al à prescrit il ripôs eterni a"],
      sgnape: ["al à fat bevi masse sgnape a", "al à cjocât", "al à fat il brindis cun"],
      mine: ["al à fat saltâ par aria", "al à spedît in galarie", "al à fat cjatâ il plomp di Raibl a"],
      gjalinis: ["al à fat spenâ", "al à metût tal pulinâr", "al à fat cocodè cun"],
      mitraie: ["al à cusît a machine", "al à tignût a bade di lontan", "al à fat la puntade a"],
      motosee: ["al à seât", "al à fat lens di", "al à taiât a fetis"],
      storm: "al è restât te tampieste",
      head: "tal cjâf",
      fall: "al è lât a mont",
      self: "si è fat frico di bessôl",
      pushed: "al à butât jù"
    },
    deathLines: [
      "Ti àn fat frico.",
      "Tu sês lât a mont. Torne sù.",
      "San Cristoful al protêç i viandants, no i campers.",
      "Il cjampanili lu àn tornât a fâ piere su piere. Tu tu tornis in pîts in 3 seconts.",
      "La Cineteche dal Friûl e à za archiviât chest replay.",
      "Messe dal Talar: il sindic al regale un talar al plevan. Tu tu âs regalât un pont.",
      "Gnot dai Cuatri Timps: vuê il racolt al è lôr.",
      "Une bocjade di sgnape e si torne in pîts.",
      "Ti sêstu distrat pensant ai cjarsons?",
      "Lis aganis de fontane a ridin di te.",
      "Un sbilf ti à leât lis stringhis.",
      "Tire il flât. Salût!"
    ],
    streaks: {
      3: "TRIS DI FRICO!",
      5: "BENANDANT DAL AN!",
      7: "CJAMPANIS A FESTE!",
      10: "PATRIARCJE DI AQUILEE!",
      15: "LEGJENDE DI GLEMONE!"
    },
    cart: (pct) => `🛒 Cjar: ${pct}%`,
    cartPush: (n) => `al va indenant (${n} ch'a sburtin)`,
    cartStop: "Contindût!",
    cartBack: "al torne indaûr…",
    cartIdle: "fer",
    alive: (n) => `🌩️ In pîts: ${n}`,
    stormOutside: "Fûr de tampieste! Torne dentri dal cercli",
    spectate: "Une vite sole: tu cjalis fin a la fin de partide.",
    healed: (who, n) => `+${n} a ${who}`,
    play: {
      keyboard: "<div>Fâs clic par zuiâ</div><small>o frache un boton dal controller · Esc pal menù de partide</small>",
      pad: "<div>Frache un boton par zuiâ</div><small>Options pal menù de partide</small>",
      touch: "<div>Tocje par zuiâ</div><small>o frache un boton dal controller</small>"
    },
    turretUse: { keyboard: "<kbd>E</kbd> Mitraie", pad: "<kbd>⬇</kbd> Mitraie", touch: `Tocje <kbd>${FUR_TOUCH.use}</kbd>` },
    turretLeave: {
      keyboard: "<kbd>E</kbd> / <kbd>Spazi</kbd> lasse la mitraie",
      pad: "<kbd>⬇</kbd> / <kbd>✕</kbd> lasse la mitraie",
      touch: `Tocje <kbd>${FUR_TOUCH.leave}</kbd> par lassâ la mitraie`
    },
    touchUse: FUR_TOUCH.use,
    touchLeave: FUR_TOUCH.leave,
    turretHeat: "Calôr",
    turretHot: "SCJALDADE!"
  },
  game: {
    sgnape: "Salût!",
    sgnapeSub: "La sgnape ti fâs cori",
    flag: {
      takenMine: "Nus àn robât il frico!",
      taken: "Il frico al è stât cjapât!",
      dropped: "Il frico al è par tiere!",
      returned: "Il frico al è tornât a cjase",
      capturedMine: "Nus àn fat il pont!",
      captured: "PONT! Frico puartât a cjase!"
    },
    flagSub: (who, team) => `${who} · frico dai ${team}`,
    hillTaken: (team) => `${team} in plaçute!`,
    start: "Al tache la bataie!",
    startSub: "Lis cjampanis dal Dom a sunin",
    cart: { push: "Il cjar al va indenant!", stop: "Il cjar al è fer: contindût!", back: "Il cjar al torne indaûr!", arrived: "Il cjar al è rivât!" },
    cartSub: (ben) => (ben ? "Sburtilu fin insom" : "Fermilu prime che al rivi"),
    stormStart: "E rive la tampieste!",
    stormStartSub: "Ducj cuintri ducj · une vite sole",
    quickGloss: null,
    doorBroken: (who) => `${who} al à sfondât la puarte dal casot!`,
    doorSub: "Dentri e je fieste: i fenicotars a balin",
    plumis: "Plumis tai vôi!"
  },
  loadout: {
    title: "Armarie",
    note: "La gnove arme principâl e rive subite, cu lis sôs munizions.",
    resume: "Torne a zuiâ"
  },
  pause: {
    code: "Codiç de partide",
    copy: "Copie il link di invît",
    copied: "Copiât! Mandi a ducj",
    reach: { offline: "Offline · dome tu cuintri i bot", lan: "LAN · dome te stesse rêt", online: "In linie · par ducj" },
    access: { open: "Viert", password: "Cun password" },
    start: "Fâs partî la partide",
    restart: "Finìs la partide e torne ae Adunade",
    hostOnly: "L'host (👑) al fâs partî la partide.",
    host: "Host:",
    addBot: (team) => `+ bot ${team}`,
    removeBot: (team) => `− bot ${team}`,
    level: "Bravure",
    switchTeam: (team) => `Passe cui ${team}`,
    leave: "Va fûr · Mandi!"
  },
  end: {
    draw: "Pari e patte!",
    win: "Vitorie!",
    lose: "Pierdût…",
    drawSub: "Nissun al à vinçût: si fâs un altri zîr",
    winSub: (team, motto) => `A vincin i ${team} · ${motto}`,
    lastStanding: (name) => `Al vinç ${name}`,
    lastStandingSub: "L'ultin in pîts te tampieste",
    mvp: { benandanti: "Benandant dal An", malandanti: "Malandant dal An" },
    killer: "Sclopetari",
    streak: "Cjampanis a feste",
    head: "Voli di falcon",
    points: (n) => `${n} ponts`,
    kills: (n) => `${n} copâts`,
    row: (n) => `${n} di file`,
    heads: (n) => `${n} tal cjâf`,
    restartIn: (s) => `Si torne ae Adunade tra ${s} seconts…`,
    leave: "Va fûr",
    again: "Subit ae Adunade"
  },
  muster: {
    title: "Adunade",
    primary: "Arme principâl",
    chat: "Cjacaris",
    chatPlaceholder: "Scrîf ai altris e frache Invio"
  },
  perf: { snaps: "istantanis", players: "zuiadôrs", corrections: "corezions", hide: "F3 par platâ", menu: "menù", dynRes: "ris. dinamiche" },
  tips: [
    "Il cjar di fen ai pîts dal cjampanili ti sbalce sù fin sul balcon dai tiradôrs.",
    "Il Lanciafrico al torne fûr in Vie Bini ogni 45 seconts: cui che lu cjape al comande la plaçute.",
    "Un frico intîr al dà indaûr 40 ponts di salût. Doi, e tu sês a puest fin a Pasche.",
    "La gubane e fâs di corace: e cjape sù metât dai colps. Come la none.",
    "La sgnape ti fâs cori plui svelt par 10 seconts. La viste e bale: al è normâl.",
    "Mirâ (boton diestri) al strenç la rose dai colps. La Dopiete di Pre Checo e reste instès gjenerose.",
    "Tal Dom lis colonis de navade a son il miôr ripar de mape.",
    "Glemone, par furlan. Gemona, par talian. Cimòne, se tu sês di Udin e tu âs voie di barufâ.",
    "Glemone e je stade distrute dal taramot dal 1976 e tornade a fâ 'dulà ch'e jere e cemût ch'e jere': il Dom cu l'anastilosi, piere su piere. Achì si zuie, ma cun rispiet.",
    "Il San Cristoful su la façade dal Dom al è alt cuasi 7 metris (1331). No sta sbarâi: al protêç i viandants.",
    "I puartis di Vie Bini a son dal Tresinte: a riparin de ploie e dai tiradôrs.",
    "Pan e vin: se il fum dal falò al va a soreli jevât, bon racolt. Se al va a soreli a mont, cjape il sac e va pal mont.",
    "Tast Q: tu tornis a l'arme di prime. Tast G: bombis di sgnape. Tast V: frasis sveltis.",
    "Cjape il Frico: se ti àn robât il frico, cope cui che lu puarte e tocjilu par puartâlu a cjase.",
    "I bot Plevan no falin mai. Come il plevan cuant che al conte lis ufiertis.",
    "Esc ti puarte indaûr in ducj i menùs.",
    "Cul Shift si cor, ma l'arme e reste bassade: par sparâ tu âs di molâ la corse.",
    "Il Mulin al à di cjapâ zîr prime di sparâ: ten fracât e po al plûf plomp.",
    "Il miedi al cure i compagns cul sbrufadôr e, dome stant dongje, ancje un pôc di bessôl.",
    "Tast F: mine di Raibl. Si plante tal teren e e salte cuant che un nemì i passe dongje.",
    "Cave dal Predil, o Raibl: une des minieris di plomp e zinc plui grandis de Europe, sierade tal 1991.",
    "Il Fuart di Osôf nol è mai stât cjapât: Napoleon lu à volût, i austriacs lu àn sedeât tal 1848.",
    "Vençon e je stade tornade a fâ piere su piere dopo dal taramot, come il Dom di Glemone.",
    "Tast E dongje di une torete: tu montis su la mitraie. No sta tignî fracât masse: si scjalde e si ferme.",
    "Il Cjanon des Gjalinis: no sta mirâ masse preciš, la gjaline e cjate il nemì di bessole.",
    "Lagune di Maran: tal casot di osservazion e je une fieste. Par jentrâ, une pedade te puarte (o une gjaline).",
    "Te riserve des Focis dal Stele i fenicotars a son di cjase dut l'an. Chei dal casot a balin dome la sabide."
  ]
}

const it: Strings = {
  static: {
    title: "Sparedût — Battaglia nel Duomo di Gemona",
    nameLabel: "Il tuo nome",
    namePh: "Toni di Gemona",
    oneTap: "Gioca contro i bot",
    oneTapSub: "Offline contro il computer, anche senza server",
    training: "Impara a giocare",
    trainingSub: "La Dutrine alla Sagre dal Frico, anche senza server",
    create: "Crea una partita",
    createSub: "Offline, in rete locale o online",
    join: "Entra con codice",
    roomsTitle: "Partite aperte <small>(prima la tua rete, poi online)</small>",
    armarie: "Armeria",
    settings: "Impostazioni",
    vocab: "Vocabolario",
    minutesLabel: "Durata",
    botsLabel: "Bot per squadra",
    levelLabel: "Bravura dei bot",
    reachLabel: "Portata",
    accessLabel: "Accesso",
    accessOpen: "Aperto",
    accessPassword: "Con password",
    passwordLabel: "Password <small>(da 1 a 32 caratteri)</small>",
    passwordTitle: "Serve la password",
    ff: "Fuoco amico (i compagni si fanno male)",
    back: "Indietro <kbd>Esc</kbd>",
    createGo: "Crea ed entra",
    joinGo: "Entra",
    armarieTitle: "Armeria <small>· scegli l'arma principale</small>",
    sens: "Sensibilità del mouse",
    fov: "Campo visivo",
    volume: "Volume",
    music: "Musica",
    quality: "Qualità grafica",
    qLow: "Bassa (il portatile del nonno)",
    qMid: "Media",
    qHigh: "Alta (ombre belle)",
    autoRes: "Risoluzione dinamica (abbassa la risoluzione se gli FPS calano)",
    showInfo: "Mostra info prestazioni (FPS, ping…) · anche col tasto <kbd>F3</kbd>",
    invert: "Inverti asse verticale",
    crouchMode: "Accucciarsi",
    crouchHold: "tenendo premuto il tasto",
    crouchToggle: "premendo una volta (ripremi per alzarti)",
    keys: keysHtml(KEYS_IT),
    vocabTitle: "Vocabolario friulano-italiano",
    connecting: "Connessione…",
    chatPh: "Scrivi… (Invio per mandare)",
    deathTitle: "Ti hanno fatto frico!",
    deathHint: "Premi <kbd>B</kbd> per cambiare arma principale",
    language: "Lingua",
    modeLabel: "Modalità",
    mapLabel: "Mappa",
    optionsLabel: "Opzioni"
  },
  training: {
    station: (n, total, name) => `Stazione ${n} di ${total} · ${name}`,
    step: (n, total) => `Passo ${n} di ${total}`,
    stations: {
      look: "Guarda e cammina",
      course: "Il percorso",
      always: "Sempre con te",
      switch: "Cambiare arma",
      stalls: "Le bancarelle",
      armoury: "L'armeria",
      throw: "Bombe e mine",
      pickups: "Cose da raccogliere",
      turret: "La torretta e il Lanciafrico",
      medic: "Il medico",
      modes: "Le modalità",
      skirmish: "La scaramuccia"
    },
    steps: stepsIn("it"),
    controls: CONTROL_TEXT.it,
    unavailable: "Non si può fare con questo dispositivo",
    count: (done, target) => `${done} di ${target}`,
    stepDone: "Fatto!",
    stationDone: "Stazione completata",
    complete: "Dutrine completata!",
    completeSub: "Ora sai tutto: vai a giocare",
    menuLine: "Dutrine · Offline, solo tu",
    done: { home: "Torna all'inizio" },
    stationList: "Le stazioni",
    here: "Sei qui",
    continueHere: "Continua",
    chooseStation: "Scegli la stazione da cui partire",
    locked: "Ancora chiusa",
    restart: "Ricomincia la stazione",
    startOver: "Ricomincia da capo",
    startOverSure: "Sicuro? Perdi tutti i progressi",
    entry: {
      completed: "✓ Completata",
      ribbon: "Nuovo? Comincia da qui",
      close: "Non invitarmi più"
    }
  },
  teams: {
    benandanti: { name: "Benandanti", motto: "Per il raccolto e per la chiesa!" },
    malandanti: { name: "Malandanti", motto: "La grandine è nostra!" }
  },
  modes: {
    bataie: {
      name: "Bataie di Gnot",
      sub: "Deathmatch a squadre",
      rules: "Ogni avversario abbattuto è un punto per la squadra. Come nelle notti delle Quattro Tempora, ma con più piombo."
    },
    frico: {
      name: "Cjape il Frico",
      sub: "Cattura la bandiera",
      rules: "Ruba la forma di frico dalla base nemica (l'altare del Duomo o la loggia del Comune) e portala alla tua, mentre il tuo frico è al sicuro."
    },
    culine: {
      name: "Re de Plaçute",
      sub: "Re della collina",
      rules: "Tieni la piazzetta di Via Bini attorno alla fontana. Un punto al secondo per chi la controlla da solo."
    },
    cjar: {
      name: "Spinç il Cjar",
      sub: "Spingi il carro",
      rules: "I Benandanti spingono il carro fino in fondo alla strada: avanza se un Benandante gli sta vicino e nessun Malandante. I Malandanti lo fermano finché scade il tempo. Lasciato solo, torna indietro."
    },
    tampieste: {
      name: "La Tampieste",
      sub: "Tutti contro tutti",
      rules: "Niente squadre, una vita sola. La tempesta si stringe: fuori dal cerchio la grandine fa male. L'ultimo in piedi vince."
    },
    dutrine: {
      name: "Dutrine",
      sub: "La sagra che insegna a giocare",
      rules: "Una stazione dopo l'altra: fai ogni passo che ti viene chiesto e la strada si apre."
    }
  },
  maps: {
    glemone: { name: "Glemone", sub: "Il Duomo, Via Bini e la piazza del Municipio" },
    osoppo: { name: "Fuart di Osôf", sub: "Il Forte di Osoppo sul colle: bastioni e gallerie" },
    trincee: { name: "Trinceis dal Pal Piçul", sub: "La Grande Guerra sulle Alpi Carniche" },
    venzone: { name: "Vençon", sub: "Il borgo murato di Venzone e il Duomo di Sant'Andrea" },
    predil: { name: "Cave dal Predil", sub: "La miniera di Raibl: binari e carrelli" },
    maran: { name: "Laguna di Marano", sub: "Di notte, sotto la luna: la riserva, il bosco e il capanno dei fenicotteri" },
    sagre: { name: "Sagre dal Frico", sub: "La festa del paese: le bancarelle in fila e la piazza" }
  },
  levels: {
    zovin: { name: "Zovin", sub: "Facile: appena tornato da Udine" },
    pari: { name: "Pari di famee", sub: "Medio: ha fatto il militare" },
    plevan: { name: "Plevan", sub: "Difficile: vede tutto dall'alto del campanile" }
  },
  weapons: {
    mescul: { ...WEAPON_NAMES.mescul, blurb: "Il bastone per girare la polenta. Gira anche le facce." },
    mandi: { ...WEAPON_NAMES.mandi, blurb: "Pistola semiautomatica. Saluta e spara, in quest'ordine." },
    cramar: { ...WEAPON_NAMES.cramar, blurb: "I cramârs vendevano spezie in Austria. Questo vende piombo." },
    doplete: { ...WEAPON_NAMES.doplete, blurb: "La doppietta del parroco. Benedice a corto raggio." },
    cjampanili: { ...WEAPON_NAMES.cjampanili, blurb: "Fucile di precisione. Alto, dritto e rifatto pietra su pietra." },
    mulin: { ...WEAPON_NAMES.mulin, blurb: "Macina piombo come il mulino il granturco. Prima deve prendere giri, e pesa come un sacco di farina." },
    miedi: {
      ...WEAPON_NAMES.miedi,
      blurb: "Uno spruzzatore di grappa e camomilla: rimette in sesto i compagni e brucia i nemici. Chi lo porta è il medico: intorno a lui si guarisce."
    },
    gjalinis: {
      ...WEAPON_NAMES.gjalinis,
      blurb: "Un tubo d'ottone legato al braccio che spara galline. Le galline volano, cercano il nemico da sole e gli scoppiano addosso in una nuvola di piume: per un po' non vede più niente."
    },
    lanciafrico: {
      ...WEAPON_NAMES.lanciafrico,
      blurb: "Spara forme di frico bollenti che rimbalzano e scoppiano. Arma potente: si raccoglie in Via Bini."
    },
    mitraie: {
      ...WEAPON_NAMES.mitraie,
      blurb: "Non si porta: sta sulle torrette. Colpi infiniti e veloci, ma se non molli il grilletto si scalda e si ferma."
    },
    motosee: {
      ...WEAPON_NAMES.motosee,
      blurb: "«A rivin chei di Paulâr»: arrivano quelli di Paularo. Tieni premuto il grilletto: dopo una sgasata taglia quello che ha davanti, a un braccio di distanza. Non ha bisogno di munizioni, e la si sente da lontano."
    }
  },
  bomb: "Bombe di Sgnape",
  mine: "Mine di Raibl",
  quality: { bassa: "bassa", media: "media", alta: "alta" },
  errors: {
    invalid: "Messaggio non valido.",
    version: "Versione diversa dal server: ricarica la pagina.",
    notFound: "Nessuna partita con questo codice. Controlla, o chiedi all'host.",
    lanOnly: "Questa partita è solo per la rete locale di chi l'ha creata.",
    full: "Partita piena: siamo già in sedici, come a una sagra.",
    busy: "Troppe partite aperte sul server: riprova tra poco.",
    passwordRequired: "Questa partita chiede una password.",
    wrongPassword: "Password sbagliata. Riprova.",
    tooManyAttempts: "Troppe password sbagliate: aspetta un attimo e riprova."
  },
  tooOld: {
    updating: "Il server ha una versione più nuova del gioco: la sto scaricando, poi la pagina si ricarica da sola.",
    noWorker: "Versione diversa dal server: ricarica la pagina.",
    noUpdate: "Il server ha una versione più nuova, ma non riesco a scaricarla. Le partite offline funzionano comunque.",
    stillRefused: "Il server non accetta ancora questa versione. Le partite offline funzionano comunque: riprova più tardi."
  },
  app: {
    install: "Installa il gioco",
    byHand: "Per avere il gioco nella schermata Home: tocca Condividi e poi «Aggiungi alla schermata Home».",
    update: "È pronta una nuova versione del gioco: tocca per caricarla.",
    updating: "Carico la nuova versione…"
  },
  menu: {
    needName: "Prima il nome!",
    roomsEmpty: "Nessuna partita aperta. Creane una!",
    codeBad: "Il codice ha 4 lettere.",
    reach: { offline: "Offline", lan: "LAN", online: "Online" },
    full: "Piena",
    phase: { Muster: "Adunata", Live: "In partita", Over: "Partita finita" },
    passwordRoom: "Con password",
    passwordFor: (code) => `La partita ${code} chiede una password.`,
    passwordBad: "La password deve avere da 1 a 32 caratteri.",
    botsNone: "Nessuno (solo persone)",
    bots: (n) => (n === 0 ? "Senza bot" : `${n} bot`),
    ffOn: "Fuoco amico",
    minutes: (n) => `${n} minuti`,
    tag: {
      primary: "Arma principale · clic per sceglierla",
      power: "Arma potente · si raccoglie",
      melee: "Corpo a corpo · sempre con te",
      pistol: "Pistola · sempre con te"
    },
    stat: { damage: "Danno", rate: "Cadenza", range: "Portata", mag: "Caricatore", health: "Salute", speed: "Velocità" },
    vocab: VOCAB,
    reachSub: {
      offline: "Solo tu contro i bot, in questo browser",
      lan: "Solo chi è sulla tua stessa rete",
      online: "Tutti possono vederla ed entrare"
    },
    look: "Aspetto"
  },
  net: {
    connecting: "Connessione al server…",
    connected: (name) => `Connesso · Mandi, ${name}!`,
    stranger: "forestiero",
    invite: (code) => `Invito alla partita ${code}…`,
    inviteNeedName: (code) => `Scrivi il tuo nome ed entra col codice ${code}`,
    retry: "Server non raggiunto. Riprovo…",
    down: "Il server non risponde. È acceso? (pnpm dev)",
    lost: "Connessione persa. Mandi!",
    lostRetry: "Connessione persa: riprovo…",
    offlineFailed: "Non riesco ad avviare la partita offline: ricarica la pagina.",
    verOffline: "Vêr non è ancora stato scaricato e non c'è rete: intanto vedi Cumò."
  },
  hud: {
    over: "FINE",
    modeLabel: (name, n) => `${name} · si vince a ${n}`,
    flagHome: "alla base",
    flagCarried: (who) => `preso da ${who}`,
    flagDropped: (s) => `a terra ${s}s`,
    contested: "Contesa!",
    hillOwned: (team) => `Piazzetta: ${team}`,
    hillFree: "Piazzetta libera",
    streak: (name, n) => `${name} · ${n} di fila`,
    deathBy: (name) => `Ti ha fatto fuori <b>${name}</b>`,
    deathSelf: "Ti sei fatto male da solo",
    respawnIn: (s) => `Si torna in piedi tra ${s}…`,
    shield: "✨ Protetto",
    board: ["Nome", "Arma", "Punti", "Uccisioni", "Morti", "Assist", "Catture", "Serie", "Ping"],
    kill: {
      mescul: ["ha girato come la polenta", "ha rimestato", "ha dato una mestolata a"],
      mandi: ["ha salutato per sempre", "ha detto Mandi a", "ha fatto la riverenza a"],
      cramar: ["ha venduto piombo a", "ha fatto il giro d'Austria con", "ha sbriciolato"],
      doplete: ["ha benedetto", "ha mandato a messa", "ha spedito in canonica"],
      cjampanili: ["ha suonato le campane a", "ha guardato da lontano", "ha recitato l'Ave Maria a"],
      lanciafrico: ["ha fatto frico di", "ha fritto", "ha servito col pane"],
      mulin: ["ha macinato", "ha fatto farina di", "ha messo sotto la macina"],
      miedi: ["ha dato la medicina sbagliata a", "ha curato per sempre", "ha prescritto il riposo eterno a"],
      sgnape: ["ha fatto bere troppa grappa a", "ha ubriacato", "ha brindato con"],
      mine: ["ha fatto saltare in aria", "ha spedito in galleria", "ha fatto trovare il piombo di Raibl a"],
      gjalinis: ["ha spennato", "ha messo nel pollaio", "ha fatto coccodè con"],
      mitraie: ["ha cucito a macchina", "ha tenuto a bada da lontano", "ha fatto l'orlo a"],
      motosee: ["ha segato", "ha fatto legna di", "ha tagliato a fette"],
      storm: "è rimasto nella tempesta",
      head: "in testa",
      fall: "è caduto di sotto",
      self: "si è fatto frico da solo",
      pushed: "ha buttato giù"
    },
    deathLines: [
      "Ti hanno fatto frico.",
      "Sei andato giù. Torna su.",
      "San Cristoforo protegge i viandanti, non i campers.",
      "Il campanile l'hanno ricostruito pietra su pietra. Tu rinasci in 3 secondi.",
      "La Cineteca del Friuli ha già archiviato questo replay.",
      "Messa del Tallero: il sindaco regala un tallero al pievano. Tu hai regalato un punto.",
      "Notte delle Quattro Tempora: oggi il raccolto è loro.",
      "Un sorso di grappa e si torna in piedi.",
      "Ti sei distratto pensando ai cjarsons?",
      "Le aganis della fontana ridono di te.",
      "Uno sbilf ti ha legato le stringhe.",
      "Respira. Salute!"
    ],
    streaks: {
      3: "TRIS DI FRICO!",
      5: "BENANDANTE DELL'ANNO!",
      7: "CAMPANE A FESTA!",
      10: "PATRIARCA DI AQUILEIA!",
      15: "LEGGENDA DI GEMONA!"
    },
    cart: (pct) => `🛒 Carro: ${pct}%`,
    cartPush: (n) => `avanza (${n} a spingere)`,
    cartStop: "Conteso!",
    cartBack: "torna indietro…",
    cartIdle: "fermo",
    alive: (n) => `🌩️ In piedi: ${n}`,
    stormOutside: "Fuori dalla tempesta! Torna dentro il cerchio",
    spectate: "Una vita sola: guardi fino alla fine della partita.",
    healed: (who, n) => `+${n} a ${who}`,
    play: {
      keyboard: "<div>Clicca per giocare</div><small>o premi un tasto del controller · Esc per il menu della partita</small>",
      pad: "<div>Premi un tasto per giocare</div><small>Options per il menu della partita</small>",
      touch: "<div>Tocca per giocare</div><small>o premi un tasto del controller</small>"
    },
    turretUse: { keyboard: "<kbd>E</kbd> Mitragliatrice", pad: "<kbd>⬇</kbd> Mitragliatrice", touch: `Tocca <kbd>${IT_TOUCH.use}</kbd>` },
    turretLeave: {
      keyboard: "<kbd>E</kbd> / <kbd>Spazio</kbd> lascia la mitragliatrice",
      pad: "<kbd>⬇</kbd> / <kbd>✕</kbd> lascia la mitragliatrice",
      touch: `Tocca <kbd>${IT_TOUCH.leave}</kbd> per lasciare la mitragliatrice`
    },
    touchUse: IT_TOUCH.use,
    touchLeave: IT_TOUCH.leave,
    turretHeat: "Calore",
    turretHot: "SURRISCALDATA!"
  },
  game: {
    sgnape: "Salute!",
    sgnapeSub: "La grappa ti fa correre",
    flag: {
      takenMine: "Ci hanno rubato il frico!",
      taken: "Il frico è stato preso!",
      dropped: "Il frico è a terra!",
      returned: "Il frico è tornato alla base",
      capturedMine: "Ci hanno fatto punto!",
      captured: "PUNTO! Frico portato a casa!"
    },
    flagSub: (who, team) => `${who} · frico dei ${team}`,
    hillTaken: (team) => `${team} in piazzetta!`,
    start: "Inizia la battaglia!",
    startSub: "Suonano le campane del Duomo",
    cart: { push: "Il carro avanza!", stop: "Il carro è fermo: conteso!", back: "Il carro torna indietro!", arrived: "Il carro è arrivato!" },
    cartSub: (ben) => (ben ? "Spingilo fino in fondo" : "Fermalo prima che arrivi"),
    stormStart: "Arriva la tempesta!",
    stormStartSub: "Tutti contro tutti · una vita sola",
    quickGloss: [
      "Ciao!",
      "Come va?",
      "Accidenti!",
      "Accipicchia, che colpo!",
      "Dai!",
      "Aiuto! Venite qua!",
      "Il frico è nostro!",
      "Salute e frico!",
      "Va bene, va bene...",
      "Guarda il campanile!",
      "Arrivano quelli di Paularo"
    ],
    doorBroken: (who) => `${who} ha sfondato la porta del capanno!`,
    doorSub: "Dentro c'è festa: i fenicotteri ballano",
    plumis: "Piume negli occhi!"
  },
  loadout: {
    title: "Armeria",
    note: "La nuova arma principale arriva subito, con le sue munizioni.",
    resume: "Torna a giocare"
  },
  pause: {
    code: "Codice partita",
    copy: "Copia il link d'invito",
    copied: "Copiato! Mandi a tutti",
    reach: { offline: "Offline · solo tu contro i bot", lan: "LAN · solo sulla stessa rete", online: "Online · per tutti" },
    access: { open: "Aperto", password: "Con password" },
    start: "Fai partire la partita",
    restart: "Chiudi la partita e torna all'Adunata",
    hostOnly: "L'host (👑) fa partire la partita.",
    host: "Host:",
    addBot: (team) => `+ bot ${team}`,
    removeBot: (team) => `− bot ${team}`,
    level: "Bravura",
    switchTeam: (team) => `Passa con i ${team}`,
    leave: "Esci · Mandi!"
  },
  end: {
    draw: "Pareggio!",
    win: "Vittoria!",
    lose: "Sconfitta…",
    drawSub: "Nessuno ha vinto: si fa un altro giro",
    winSub: (team, motto) => `Vincono i ${team} · ${motto}`,
    lastStanding: (name) => `Vince ${name}`,
    lastStandingSub: "L'ultimo in piedi nella tempesta",
    mvp: { benandanti: "Benandante dell'anno", malandanti: "Malandante dell'anno" },
    killer: "Pistolero",
    streak: "Campane a festa",
    head: "Occhio di falco",
    points: (n) => `${n} punti`,
    kills: (n) => `${n} uccisioni`,
    row: (n) => `${n} di fila`,
    heads: (n) => `${n} in testa`,
    restartIn: (s) => `Si torna all'Adunata tra ${s} secondi…`,
    leave: "Esci",
    again: "Subito all'Adunata"
  },
  muster: {
    title: "Adunata",
    primary: "Arma principale",
    chat: "Chiacchiere",
    chatPlaceholder: "Scrivi agli altri e premi Invio"
  },
  perf: { snaps: "istantanee", players: "giocatori", corrections: "correzioni", hide: "F3 per nascondere", menu: "menu", dynRes: "ris. dinamica" },
  tips: [
    "Il carro di fieno ai piedi del campanile ti lancia sul ballatoio dei cecchini.",
    "Il Lanciafrico ricompare in Via Bini ogni 45 secondi: chi lo prende comanda la piazzetta.",
    "Un frico intero ridà 40 punti salute. Due, e sei a posto fino a Pasqua.",
    "La gubana fa da corazza: assorbe metà dei colpi. Come la nonna.",
    "La grappa ti fa correre più forte per 10 secondi. La visuale ondeggia: è normale.",
    "Mirare (tasto destro) stringe la rosa dei colpi. La Dopiete di Pre Checo resta comunque generosa.",
    "Nel Duomo le colonne della navata sono il miglior riparo della mappa.",
    "Glemone, in friulano. Gemona, in italiano. Cimòne, se sei di Udine e vuoi litigare.",
    "Gemona fu distrutta dal terremoto del 1976 e ricostruita 'dov'era e com'era': il Duomo con l'anastilosi, pietra su pietra. Qui si gioca, ma con rispetto.",
    "Il San Cristoforo sulla facciata del Duomo è alto quasi 7 metri (1331). Non sparargli: protegge i viandanti.",
    "I portici di Via Bini sono trecenteschi: coprono dalla pioggia e dai cecchini.",
    "Pan e vin: se il fumo del falò va a est, raccolto buono. Se va a ovest, prendi il sacco e vai per il mondo.",
    "Tasto Q: torni all'arma di prima. Tasto G: bombe di sgnape. Tasto V: frasi rapide.",
    "Cjape il Frico: se ti hanno rubato il frico, abbatti chi lo porta e toccalo per riportarlo a casa.",
    "I bot Plevan non sbagliano mai. Come il pievano quando conta le offerte.",
    "Esc ti riporta indietro in tutti i menu.",
    "Con Shift si corre, ma l'arma resta abbassata: per sparare devi smettere di correre.",
    "Il Mulin deve prendere giri prima di sparare: tieni premuto e poi piove piombo.",
    "Il medico cura i compagni con lo spruzzatore e, solo stando vicino, anche un po' da sé.",
    "Tasto F: mina di Raibl. Si pianta nel terreno e salta quando un nemico le passa vicino.",
    "Cave del Predil, o Raibl: una delle più grandi miniere di piombo e zinco d'Europa, chiusa nel 1991.",
    "Il Forte di Osoppo non è mai stato preso: lo volle Napoleone, gli austriaci lo assediarono nel 1848.",
    "Venzone è stata ricostruita pietra su pietra dopo il terremoto, come il Duomo di Gemona.",
    "Tasto E vicino a una torretta: monti sulla mitragliatrice. Non tenere premuto troppo: si scalda e si ferma.",
    "Il Cannone delle Galline: non serve mirare troppo preciso, la gallina trova il nemico da sola.",
    "Laguna di Marano: nel capanno di osservazione c'è una festa. Per entrare, un calcio alla porta (o una gallina).",
    "Nella riserva delle Foci dello Stella i fenicotteri ci sono tutto l'anno. Quelli del capanno ballano solo il sabato."
  ]
}

export const STRINGS: Readonly<Record<Lang, Strings>> = { fur, it }

let current: Lang = "fur"
const listeners = new Set<() => void>()

/** The dictionary of the active language. */
export const t = (): Strings => STRINGS[current]
export const lang = () => current

export function setLang(next: Lang) {
  current = next
  document.documentElement.lang = next === "fur" ? "fur" : "it"
  applyStatic()
  for (const fn of listeners) fn()
}

/** Call again when the language changes (to rebuild the pieces built in JS). */
export const onLangChange = (fn: () => void) => listeners.add(fn)

/** Translates the static HTML: `data-t` fills the content, `data-t-ph` the placeholder. */
export function applyStatic(root: ParentNode = document) {
  const s = t().static
  document.title = s.title
  for (const el of root.querySelectorAll<HTMLElement>("[data-t]")) el.innerHTML = s[el.dataset.t as StaticKey]
  for (const el of root.querySelectorAll<HTMLInputElement>("[data-t-ph]")) el.placeholder = s[el.dataset.tPh as StaticKey]
}
