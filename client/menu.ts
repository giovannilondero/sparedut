/**
 * Il menu principale: nome, partite, armeria, impostazioni, vocabolario.
 */
import { BOT_LEVEL_IDS, BOT_LEVELS, MODE_IDS, MODES, TEAM_INFO, TIPS, type BotLevel, type ModeId } from "../shared/folklore.ts"
import type { RoomSummary, Visibility } from "../shared/protocol.ts"
import { PRIMARIES, WEAPON_IDS, WEAPONS, type PrimaryId } from "../shared/weapons.ts"
import type { GameAudio } from "./contracts.ts"
import { esc } from "./hud.ts"
import type { Settings } from "./settings.ts"

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

export interface CreateOptions {
  readonly mode: ModeId
  readonly minutes: number
  readonly visibility: Visibility
  readonly bots: number
  readonly level: BotLevel
  readonly ff: boolean
}

export interface MenuHandlers {
  readonly create: (o: CreateOptions, quick?: boolean) => void
  readonly join: (code: string) => void
  readonly settingsChanged: () => void
}

const SCREENS = ["home", "create", "join", "armarie", "settings", "vocabolari"] as const
type ScreenName = (typeof SCREENS)[number]

const VOCABOLARI: [string, string][] = [
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
  ["Mandi!", "ciao, arrivederci: il saluto friulano per eccellenza"],
  ["Ce fastu?", "che fai? come va?"],
  ["Orpo!", "esclamazione di sorpresa"],
  ["Mostro!", "accipicchia! (in senso buono)"],
  ["Salût!", "salute! (si brinda)"],
  ["Ajût!", "aiuto!"],
  ["Tal cjâf", "in testa (colpo alla testa)"],
  ["Al à fat frico di…", "lo ha ridotto a frico: lo ha fatto fuori"],
  ["Agane · Sbilf", "fata delle acque · folletto dispettoso della Carnia"],
  ["Pan e vin", "il falò dell'Epifania: dal fumo si legge l'annata"],
  ["Messe dal Talar", "il 6 gennaio nel Duomo il sindaco offre un tallero d'argento al pievano: tradizione vera di Gemona"],
  ["Anastilosi", "ricostruzione pietra su pietra: così è rinato il Duomo dopo il terremoto del 1976. 'Prime lis fabrichis, po lis cjasis, po lis glesiis.'"]
]

export class Menu {
  private screen: ScreenName = "home"
  private mode: ModeId
  private tipIndex = Math.floor(Math.random() * TIPS.length)

  constructor(private readonly settings: Settings, private readonly audio: GameAudio, private readonly handlers: MenuHandlers) {
    this.mode = settings.lastMode
    for (const el of document.querySelectorAll<HTMLElement>("[data-go]")) {
      el.addEventListener("click", () => {
        audio.unlock()
        audio.play("ui_click")
        const go = el.dataset.go!
        if (go === "quick") this.quick()
        else this.go(go as ScreenName)
      })
    }
    document.addEventListener("mouseover", (e) => {
      if ((e.target as HTMLElement).closest?.("#menu button")) audio.play("ui_hover", { volume: 0.4 })
    })
    const name = $<HTMLInputElement>("name")
    name.value = settings.name
    name.addEventListener("input", () => {
      settings.name = name.value.trim()
      handlers.settingsChanged()
    })
    this.buildCreate()
    this.buildArmarie()
    this.buildSettings()
    $("vocabolari").innerHTML = VOCABOLARI.map(([w, d]) => `<p><b>${w}</b> — ${d}</p>`).join("")
    $("j-go").addEventListener("click", () => this.joinCode())
    $("j-code").addEventListener("keydown", (e) => e.key === "Enter" && this.joinCode())
    this.showTip()
    setInterval(() => this.showTip(), 9000)
  }

  private showTip() {
    const tip = $("tip")
    tip.style.opacity = "0"
    setTimeout(() => {
      tip.textContent = TIPS[this.tipIndex++ % TIPS.length]
      tip.style.opacity = "1"
    }, 400)
  }

  /** Allinea le caselle alle impostazioni cambiate da fuori (F3). */
  syncSettings() {
    $<HTMLInputElement>("s-info").checked = this.settings.showInfo
  }

  show(on: boolean) {
    $("menu").classList.toggle("hidden", !on)
    if (on) this.go("home")
  }

  status(text: string) {
    $("status").textContent = text
  }

  private needName(): boolean {
    if (this.settings.name) return false
    const input = $<HTMLInputElement>("name")
    this.go("home")
    input.focus()
    input.placeholder = "Prime il non! (Prima il nome)"
    return true
  }

  go(screen: ScreenName) {
    if (screen !== "home" && screen !== "settings" && screen !== "vocabolari" && screen !== "armarie" && this.needName()) return
    this.screen = screen
    for (const s of SCREENS) $(`menu-${s}`).classList.toggle("hidden", s !== screen)
    if (screen === "join") setTimeout(() => $("j-code").focus(), 50)
  }

  private quick() {
    if (this.needName()) return
    this.handlers.create({ mode: this.settings.lastMode, minutes: 10, visibility: "code", bots: this.settings.lastBots || 4, level: this.settings.lastLevel, ff: false }, true)
  }

  private joinCode() {
    const code = $<HTMLInputElement>("j-code").value.trim().toUpperCase()
    if (code.length === 4) this.handlers.join(code)
  }

  rooms(list: readonly RoomSummary[]) {
    const ul = $("lan-list")
    if (!list.length) {
      ul.innerHTML = `<li class="muted">Nissune partide in rêt. Creane une!</li>`
      return
    }
    ul.innerHTML = list
      .map(
        (r) =>
          `<li><button data-code="${r.code}"><span><b>${esc(r.host)}</b> · ${MODES[r.mode].name}</span><span>${r.players}👤 ${r.bots}🤖 · ${r.code}</span></button></li>`
      )
      .join("")
    for (const b of ul.querySelectorAll<HTMLButtonElement>("button")) b.addEventListener("click", () => !this.needName() && this.handlers.join(b.dataset.code!))
  }

  private buildCreate() {
    const cards = $("mode-cards")
    const render = () => {
      cards.innerHTML = MODE_IDS.map(
        (id) => `<button class="card${id === this.mode ? " selected" : ""}" data-mode="${id}"><b>${MODES[id].name}</b><small>${MODES[id].sub}</small><small>${MODES[id].rules}</small></button>`
      ).join("")
      for (const b of cards.querySelectorAll<HTMLButtonElement>("button")) {
        b.addEventListener("click", () => {
          this.mode = b.dataset.mode as ModeId
          this.audio.play("ui_click")
          render()
        })
      }
    }
    render()
    const bots = $<HTMLSelectElement>("c-bots")
    bots.innerHTML = Array.from({ length: 8 }, (_, i) => `<option value="${i}">${i === 0 ? "Nissun (solo persone)" : i}</option>`).join("")
    bots.value = String(this.settings.lastBots)
    const level = $<HTMLSelectElement>("c-level")
    level.innerHTML = BOT_LEVEL_IDS.map((l) => `<option value="${l}">${BOT_LEVELS[l].name} — ${BOT_LEVELS[l].sub}</option>`).join("")
    level.value = this.settings.lastLevel
    $<HTMLSelectElement>("c-minutes").value = String(this.settings.lastMinutes)
    $("c-go").addEventListener("click", () => {
      const o: CreateOptions = {
        mode: this.mode,
        minutes: Number($<HTMLSelectElement>("c-minutes").value),
        visibility: $<HTMLSelectElement>("c-vis").value as Visibility,
        bots: Number(bots.value),
        level: level.value as BotLevel,
        ff: $<HTMLInputElement>("c-ff").checked
      }
      Object.assign(this.settings, { lastMode: o.mode, lastBots: o.bots, lastLevel: o.level, lastMinutes: o.minutes })
      this.handlers.settingsChanged()
      this.handlers.create(o)
    })
  }

  buildArmarie(target: HTMLElement = $("armarie"), onPick?: (p: PrimaryId) => void) {
    const max = { damage: 110, rate: 10, range: 400, mag: 30 }
    const render = () => {
      target.innerHTML = WEAPON_IDS.map((id) => {
        const w = WEAPONS[id]
        const primary = (PRIMARIES as readonly string[]).includes(id)
        const rate = 60 / w.cooldownTicks
        const bar = (label: string, v: number) => `<div class="stat">${label}<i style="width:${Math.min(100, v * 100)}%"></i></div>`
        const tag = primary ? "Arma principale · clic per sceglierla" : id === "lanciafrico" ? "Arma potente · si raccoglie" : id === "mescul" ? "Corpo a corpo · sempre con te" : "Pistola · sempre con te"
        return `<button class="weapon${id === this.settings.primary ? " selected" : ""}${primary ? "" : " locked"}" data-w="${id}">
          <span class="tag">${w.slot === 1 ? "1" : w.slot} · ${tag}</span><b>${w.name}</b><span class="blurb">${w.blurb}</span>
          ${bar("Danno", (w.damage * w.pellets) / max.damage)}${bar("Cadenza", rate / max.rate)}${bar("Portata", (w.range || 120) / max.range)}${bar("Caricatore", Math.max(w.magazine, 1) / max.mag)}
        </button>`
      }).join("")
      for (const b of target.querySelectorAll<HTMLButtonElement>("button.weapon:not(.locked)")) {
        b.addEventListener("click", () => {
          this.settings.primary = b.dataset.w as PrimaryId
          this.handlers.settingsChanged()
          this.audio.play("switch")
          onPick?.(this.settings.primary)
          render()
        })
      }
    }
    render()
  }

  private buildSettings() {
    const s = this.settings
    const bind = (id: string, key: "sensitivity" | "fov" | "master" | "music", fmt: (v: number) => string) => {
      const input = $<HTMLInputElement>(id)
      const label = $(`${id}-v`)
      input.value = String(s[key])
      label.textContent = fmt(s[key])
      input.addEventListener("input", () => {
        s[key] = Number(input.value)
        label.textContent = fmt(s[key])
        this.handlers.settingsChanged()
      })
    }
    bind("s-sens", "sensitivity", (v) => v.toFixed(2))
    bind("s-fov", "fov", (v) => `${v}°`)
    bind("s-master", "master", (v) => `${Math.round(v * 100)}%`)
    bind("s-music", "music", (v) => `${Math.round(v * 100)}%`)
    const q = $<HTMLSelectElement>("s-quality")
    q.value = s.quality
    q.addEventListener("change", () => {
      s.quality = q.value as Settings["quality"]
      this.handlers.settingsChanged()
    })
    for (const [id, key] of [["s-autores", "autoRes"], ["s-info", "showInfo"]] as const) {
      const box = $<HTMLInputElement>(id)
      box.checked = s[key]
      box.addEventListener("change", () => {
        s[key] = box.checked
        this.handlers.settingsChanged()
      })
    }
    const inv = $<HTMLInputElement>("s-invert")
    inv.checked = s.invertY
    inv.addEventListener("change", () => {
      s.invertY = inv.checked
      this.handlers.settingsChanged()
    })
  }
}

export { TEAM_INFO }
