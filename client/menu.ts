/**
 * The main menu: name, language, matches, armoury, settings, glossary.
 */
import { BOT_LEVEL_IDS, MODE_IDS, type BotLevel, type ModeId } from "../shared/folklore.ts"
import type { MapId } from "../shared/map.ts"
import { MAP_IDS } from "../shared/maps/index.ts"
import { Password, type Reach, type RoomAccess, type RoomSummary } from "../shared/protocol.ts"
import { PRIMARIES, WEAPON_IDS, WEAPONS, type PrimaryId } from "../shared/weapons.ts"
import type { GameAudio } from "./contracts.ts"
import { esc } from "./hud.ts"
import { onLangChange, setLang, t, type Lang } from "./i18n.ts"
import { oneTapRoom, type Settings } from "./settings.ts"

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

export interface CreateOptions {
  readonly mode: ModeId
  readonly map: MapId
  readonly minutes: number
  readonly reach: Reach
  /** Absent for Offline: a room in this browser has nobody to keep out. */
  readonly access?: RoomAccess
  readonly bots: number
  readonly level: BotLevel
  readonly ff: boolean
}

export interface MenuHandlers {
  /** `oneTap`: the home screen's button, whose match starts at once, without warm-up. */
  readonly create: (o: CreateOptions, oneTap?: boolean) => void
  /** `password` only once the player typed one (from the prompt or an invite link). */
  readonly join: (code: string, password?: string) => void
  /** The map chosen in the menu: it becomes the background. */
  readonly mapChanged: (id: MapId) => void
  readonly settingsChanged: () => void
}

const SCREENS = ["home", "create", "join", "password", "armarie", "settings", "vocabolari"] as const
type ScreenName = (typeof SCREENS)[number]
const MINUTES = [5, 10, 15, 20]

export class Menu {
  private screen: ScreenName = "home"
  private mode: ModeId
  private map: MapId
  private level: BotLevel
  private roomList: readonly RoomSummary[] = []
  /** The room the password prompt is for. */
  private passwordCode = ""
  private tipIndex = Math.floor(Math.random() * 100)

  constructor(private readonly settings: Settings, private readonly audio: GameAudio, private readonly handlers: MenuHandlers) {
    this.mode = settings.lastMode
    this.map = settings.lastMap
    this.level = settings.lastLevel
    for (const el of document.querySelectorAll<HTMLElement>("[data-go]")) {
      el.addEventListener("click", () => {
        audio.unlock()
        audio.play("ui_click")
        const go = el.dataset.go!
        if (go === "quick") this.quick()
        else this.go(go as ScreenName)
      })
    }
    for (const el of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
      el.addEventListener("click", () => {
        audio.play("ui_click")
        settings.lang = el.dataset.lang as Lang
        setLang(settings.lang)
        handlers.settingsChanged()
      })
    }
    document.addEventListener("mouseover", (e) => {
      if ((e.target as HTMLElement).closest?.("#menu button")) audio.play("ui_hover", { volume: 0.4 })
    })
    // Esc: from submenus, go back to the main screen.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || $("menu").classList.contains("hidden")) return
      if (this.screen !== "home") {
        e.preventDefault()
        audio.play("ui_click")
        this.go("home")
      } else if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
    })
    const name = $<HTMLInputElement>("name")
    name.value = settings.name
    name.addEventListener("input", () => {
      settings.name = name.value.trim()
      handlers.settingsChanged()
    })
    this.bindCreate()
    this.bindSettings()
    $("j-go").addEventListener("click", () => this.joinCode())
    $("j-code").addEventListener("keydown", (e) => e.key === "Enter" && this.joinCode())
    $("pw-go").addEventListener("click", () => this.joinWithPassword())
    $("pw-input").addEventListener("keydown", (e) => e.key === "Enter" && this.joinWithPassword())
    onLangChange(() => this.renderTexts())
    setLang(settings.lang)
    setInterval(() => this.showTip(), 9000)
  }

  /** Everything the menu writes from JS, in the active language. */
  private renderTexts() {
    for (const el of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
      el.classList.toggle("selected", el.dataset.lang === this.settings.lang)
      el.setAttribute("aria-pressed", String(el.dataset.lang === this.settings.lang))
    }
    this.renderCreate()
    this.buildArmarie()
    $("vocabolari").innerHTML = t().menu.vocab.map(([w, d]) => `<p><b>${w}</b> — ${d}</p>`).join("")
    this.rooms(this.roomList)
    $("tip").textContent = t().tips[this.tipIndex % t().tips.length]
  }

  private showTip() {
    const tip = $("tip")
    tip.style.opacity = "0"
    setTimeout(() => {
      const tips = t().tips
      tip.textContent = tips[++this.tipIndex % tips.length]
      tip.style.opacity = "1"
    }, 400)
  }

  /** Syncs the checkboxes with settings changed from outside (F3). */
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
    input.placeholder = t().menu.needName
    return true
  }

  go(screen: ScreenName) {
    if ((screen === "create" || screen === "join" || screen === "password") && this.needName()) return
    this.screen = screen
    for (const s of SCREENS) $(`menu-${s}`).classList.toggle("hidden", s !== screen)
    if (screen === "join") setTimeout(() => $("j-code").focus(), 50)
    if (screen === "password") setTimeout(() => $("pw-input").focus(), 50)
  }

  /** Asks for a password room's password; `message` says why the last one did not work. */
  askPassword(code: string, message = "") {
    if (this.passwordCode !== code) $<HTMLInputElement>("pw-input").value = ""
    this.passwordCode = code
    $("pw-for").textContent = t().menu.passwordFor(code)
    $("pw-msg").textContent = message
    $("menu").classList.remove("hidden")
    this.go("password")
    $<HTMLInputElement>("pw-input").select()
  }

  private joinWithPassword() {
    const password = Password.safeParse($<HTMLInputElement>("pw-input").value)
    if (!password.success) {
      $("pw-msg").textContent = t().menu.passwordBad
      return
    }
    $("pw-msg").textContent = ""
    this.handlers.join(this.passwordCode, password.data)
  }

  /** The home screen's "play against the bots": an Offline match in one tap. */
  private quick() {
    if (this.needName()) return
    this.handlers.create(oneTapRoom(this.settings), true)
  }

  private joinCode() {
    const code = $<HTMLInputElement>("j-code").value.trim().toUpperCase()
    if (code.length === 4) this.handlers.join(code)
  }

  rooms(list: readonly RoomSummary[]) {
    this.roomList = list
    const ul = $("lan-list")
    const s = t()
    if (!list.length) {
      ul.innerHTML = `<li class="muted">${s.menu.roomsEmpty}</li>`
      return
    }
    ul.innerHTML = list
      .map((r) => {
        const full = r.players >= r.max
        const lock = r.access === "password" ? ` <i class="lock" role="img" aria-label="${s.menu.locked}" title="${s.menu.locked}">🔒</i>` : ""
        return `<li><button data-code="${r.code}" data-access="${r.access ?? ""}"${full ? " disabled" : ""}><span><i class="chip ${r.reach}">${s.menu.reach[r.reach]}</i>${lock} <b>${esc(r.host)}</b> · ${s.modes[r.mode].name} · ${s.maps[r.map].name}</span><span>${full ? `${s.menu.full} · ` : ""}${r.players}/${r.max}👤 ${r.bots}🤖 · ${r.code}</span></button></li>`
      })
      .join("")
    for (const b of ul.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")) {
      b.addEventListener("click", () => {
        if (this.needName()) return
        if (b.dataset.access === "password") this.askPassword(b.dataset.code!)
        else this.handlers.join(b.dataset.code!)
      })
    }
  }

  // ---------------------------------------------------------------- create match

  /** Listeners only once: the cards are redrawn on every choice and every language change. */
  private bindCreate() {
    $("mode-cards").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-mode]")
      if (!b) return
      this.mode = b.dataset.mode as ModeId
      this.audio.play("ui_click")
      this.renderCreate()
    })
    $("map-cards").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-map]")
      if (!b) return
      this.map = b.dataset.map as MapId
      this.audio.play("ui_click")
      this.settings.lastMap = this.map
      this.handlers.settingsChanged()
      this.handlers.mapChanged(this.map)
      this.renderCreate()
    })
    $("c-level").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-level]")
      if (!b) return
      this.level = b.dataset.level as BotLevel
      this.audio.play("ui_click")
      this.renderCreate()
    })
    // An Offline room lives in this browser: what only the server offers (access, password) hides.
    const reach = $<HTMLSelectElement>("c-reach")
    const showReach = () => ($("menu-create").dataset.reach = reach.value)
    reach.addEventListener("change", showReach)
    showReach()
    const access = $<HTMLSelectElement>("c-access")
    access.addEventListener("change", () => {
      $("c-password-field").hidden = access.value !== "password"
      $("c-msg").textContent = ""
      if (access.value === "password") $("c-password").focus()
    })
    $("c-go").addEventListener("click", () => {
      const reach = $<HTMLSelectElement>("c-reach").value as Reach
      let roomAccess: RoomAccess = { kind: "open" }
      if (reach !== "offline" && access.value === "password") {
        const password = Password.safeParse($<HTMLInputElement>("c-password").value)
        if (!password.success) {
          $("c-msg").textContent = t().menu.passwordBad
          $("c-password").focus()
          return
        }
        roomAccess = { kind: "password", password: password.data }
      }
      $("c-msg").textContent = ""
      const o: CreateOptions = {
        mode: this.mode,
        map: this.map,
        minutes: Number($<HTMLSelectElement>("c-minutes").value),
        reach,
        ...(reach === "offline" ? {} : { access: roomAccess }),
        bots: Number($<HTMLSelectElement>("c-bots").value),
        level: this.level,
        ff: $<HTMLInputElement>("c-ff").checked
      }
      Object.assign(this.settings, { lastMode: o.mode, lastMap: o.map, lastBots: o.bots, lastLevel: o.level, lastMinutes: o.minutes })
      this.handlers.settingsChanged()
      this.handlers.create(o)
    })
  }

  private renderCreate() {
    const s = t()
    $("mode-cards").innerHTML = MODE_IDS.map(
      (id) =>
        `<button class="card${id === this.mode ? " selected" : ""}" data-mode="${id}" aria-pressed="${id === this.mode}"><b>${s.modes[id].name}</b><small>${s.modes[id].sub}</small><small>${s.modes[id].rules}</small></button>`
    ).join("")
    $("map-cards").innerHTML = MAP_IDS.map(
      (id) =>
        `<button class="card${id === this.map ? " selected" : ""}" data-map="${id}" aria-pressed="${id === this.map}"><b>${s.maps[id].name}</b><small>${s.maps[id].sub}</small></button>`
    ).join("")
    $("c-level").innerHTML = BOT_LEVEL_IDS.map(
      (l) =>
        `<button class="card${l === this.level ? " selected" : ""}" data-level="${l}" role="radio" aria-checked="${l === this.level}"><b>${s.levels[l].name}</b><small>${s.levels[l].sub}</small></button>`
    ).join("")
    // The selects are rewritten keeping the chosen value.
    const minutes = $<HTMLSelectElement>("c-minutes")
    const keepMinutes = minutes.value || String(this.settings.lastMinutes)
    minutes.innerHTML = MINUTES.map((m) => `<option value="${m}">${s.menu.minutes(m)}</option>`).join("")
    minutes.value = keepMinutes
    const bots = $<HTMLSelectElement>("c-bots")
    const keepBots = bots.value || String(this.settings.lastBots)
    bots.innerHTML = Array.from({ length: 8 }, (_, i) => `<option value="${i}">${i === 0 ? s.menu.botsNone : i}</option>`).join("")
    bots.value = keepBots
  }

  // ---------------------------------------------------------------- armoury

  buildArmarie(target: HTMLElement = $("armarie"), onPick?: (p: PrimaryId) => void) {
    const max = { damage: 110, rate: 10, range: 400, mag: 30 }
    const render = () => {
      const s = t()
      // The mitraie can't be carried: it stays on the turrets.
      target.innerHTML = WEAPON_IDS.filter((id) => id !== "mitraie").map((id) => {
        const w = WEAPONS[id]
        const text = s.weapons[id]
        const primary = (PRIMARIES as readonly string[]).includes(id)
        const rate = 60 / w.cooldownTicks
        const bar = (label: string, v: number) => `<div class="stat">${label}<i style="width:${Math.min(100, v * 100)}%"></i></div>`
        const tag = primary ? s.menu.tag.primary : id === "lanciafrico" ? s.menu.tag.power : id === "mescul" ? s.menu.tag.melee : s.menu.tag.pistol
        return `<button class="weapon${id === this.settings.primary ? " selected" : ""}${primary ? "" : " locked"}" data-w="${id}">
          <span class="tag">${w.slot} · ${tag}</span><b>${text.name}</b><span class="blurb">${text.blurb}</span>
          ${bar(s.menu.stat.damage, (w.damage * w.pellets) / max.damage)}${bar(s.menu.stat.rate, rate / max.rate)}${bar(s.menu.stat.range, (w.range || 120) / max.range)}${bar(s.menu.stat.mag, Math.max(w.magazine, 1) / max.mag)}
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

  // ---------------------------------------------------------------- settings

  private bindSettings() {
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
    const crouch = $<HTMLSelectElement>("s-crouch")
    crouch.value = s.crouch
    crouch.addEventListener("change", () => {
      s.crouch = crouch.value as Settings["crouch"]
      this.handlers.settingsChanged()
    })
    for (const [id, key] of [["s-autores", "autoRes"], ["s-info", "showInfo"], ["s-invert", "invertY"]] as const) {
      const box = $<HTMLInputElement>(id)
      box.checked = s[key]
      box.addEventListener("change", () => {
        s[key] = box.checked
        this.handlers.settingsChanged()
      })
    }
  }
}
