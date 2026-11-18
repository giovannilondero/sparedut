/**
 * The DOM HUD: it only reads plain data handed to it by the game loop.
 */
import { MODES, pick, TEAM_INFO, type ModeId } from "../shared/folklore.ts"
import type { Team } from "../shared/map.ts"
import { FLAG_BIT, type BoardRow, type RoomInfo, type SnapSelf, type Snapshot } from "../shared/protocol.ts"
import type { KillCause } from "../shared/sim/events.ts"
import { WEAPONS, type WeaponId } from "../shared/weapons.ts"
import { WARMUP_TICKS } from "../shared/sim/rules.ts"
import type { TrainingView } from "../shared/sim/view.ts"
import { STATION_IDS } from "../shared/training/index.ts"
import type { Device } from "./device.ts"
import { t } from "./i18n.ts"
import { menuControl, playPrompt, trainingPrompt, turretPrompt } from "./prompts.ts"
import { stepMarksHtml } from "./training-panel.ts"
import { buttonBit, TOUCH_BUTTONS, type Insets, type PickerEntry, type TouchLayout, type TouchView } from "./touch.ts"

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const teamSpan = (name: string, team: Team | undefined) => `<b class="${team === "malandanti" ? "mal" : team === "benandanti" ? "ben" : ""}">${esc(name)}</b>`

export const fmtClock = (ticks: number) => {
  const s = Math.max(0, Math.ceil(ticks / 60))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export class Hud {
  private announceTimer = 0
  /** During an ongoing Tampieste the dead don't respawn: the death panel says so. */
  spectating = false
  private chatTimer = 0
  /** Last value written per element and property: the DOM is touched only on change. */
  private written = new Map<string, string | boolean>()

  private text(id: string, value: string) {
    if (this.written.get(`${id}:t`) === value) return
    this.written.set(`${id}:t`, value)
    $(id).textContent = value
  }

  private html(id: string, value: string) {
    if (this.written.get(`${id}:h`) === value) return
    this.written.set(`${id}:h`, value)
    $(id).innerHTML = value
  }

  private style(id: string, prop: string, value: string) {
    if (this.written.get(`${id}:s:${prop}`) === value) return
    this.written.set(`${id}:s:${prop}`, value)
    $(id).style.setProperty(prop, value)
  }

  /** A custom property on the page's root, for elements outside the HUD too. */
  private pageStyle(prop: string, value: string) {
    if (this.written.get(`page:s:${prop}`) === value) return
    this.written.set(`page:s:${prop}`, value)
    document.documentElement.style.setProperty(prop, value)
  }

  private data(id: string, key: string, value: string) {
    if (this.written.get(`${id}:d:${key}`) === value) return
    this.written.set(`${id}:d:${key}`, value)
    $(id).dataset[key] = value
  }

  private toggleOn(el: Element, key: string, cls: string, on: boolean) {
    if (this.written.get(`${key}:c:${cls}`) === on) return
    this.written.set(`${key}:c:${cls}`, on)
    el.classList.toggle(cls, on)
  }

  private toggle(id: string, cls: string, on: boolean) {
    if (this.written.get(`${id}:c:${cls}`) === on) return
    this.written.set(`${id}:c:${cls}`, on)
    $(id).classList.toggle(cls, on)
  }

  /** What the training panel last showed: it is written again only when one of these changes. */
  private trainingShown: { strings: unknown; station: string; step: string | null; count: number; device: Device | null } = { strings: null, station: "", step: null, count: -1, device: null }
  private trainingDoneTimer = 0

  /**
   * The training's panel: the station and its number out of the total, its steps as marks (done,
   * current, to do), the current step's instruction naming its control, and its count when it has
   * one. Hidden outside a training.
   */
  training(view: TrainingView | null, device: Device) {
    this.toggle("training", "hidden", view === null)
    if (view === null) return
    const s = t()
    const station = view.tag === "station" ? view.station : ""
    const step = view.tag === "station" ? view.step : null
    const count = view.tag === "station" ? view.count : -1
    const shown = this.trainingShown
    if (shown.strings === s && shown.station === station && shown.step === step && shown.count === count && shown.device === device) return
    this.trainingShown = { strings: s, station, step, count, device }
    if (view.tag === "complete") {
      this.text("training-station", s.training.complete)
      this.html("training-steps", "")
      this.html("training-step", "")
      return
    }
    this.text("training-station", s.training.station(STATION_IDS.indexOf(view.station) + 1, STATION_IDS.length, s.training.stations[view.station]))
    this.html("training-steps", stepMarksHtml(view, s))
    this.html("training-step", trainingPrompt(s, view, device))
  }

  /** The brief confirmation that a step was done. */
  trainingDone() {
    const el = $("training-done")
    el.textContent = `✓ ${t().training.stepDone}`
    el.classList.remove("pop")
    void el.offsetWidth
    el.classList.add("pop")
    clearTimeout(this.trainingDoneTimer)
    this.trainingDoneTimer = window.setTimeout(() => (el.textContent = ""), 1600)
  }

  show(on: boolean) {
    this.toggle("hud", "hidden", !on)
  }

  /** `turret`: I'm on the turret, the weapon in hand is the mitraie (infinite ammo). */
  vitals(you: SnapSelf | null, slot: { owned: (id: WeaponId) => boolean }, localMag: number | null, turret = false) {
    if (!you) return
    const hp = Math.max(0, you.hp)
    this.text("hp", String(hp))
    this.style("hp-bar", "width", `${hp}%`)
    this.toggleOn($("hp").parentElement!, "hp-low", "low", hp < 30 && you.alive)
    this.text("armor", String(you.armor))
    this.style("armor-bar", "width", `${you.armor}%`)
    // The touch HUD draws the two as rings around their icons.
    this.style("vitals", "--hp", String(hp))
    this.style("vitals", "--armor", String(you.armor))
    const a = you.arsenal
    const def = WEAPONS[a.current]
    const endless = def.mode === "melee" || turret
    this.inHand = turret ? "mitraie" : a.current
    this.text("weapon-name", t().weapons[this.inHand].name)
    const ammo = a.ammo[a.current]
    const mag = endless ? "∞" : String(localMag ?? ammo.mag)
    this.text("mag", mag)
    this.text("reserve", endless ? "" : String(ammo.reserve))
    this.toggleOn($("reserve").previousElementSibling!, "slash", "hidden", endless)
    this.text("bombs", `${t().bomb}: ${"🍶".repeat(a.bombs) || "—"} · ${t().mine}: ${"💣".repeat(a.mines) || "—"}`)
    // On touch the weapon's control carries the rounds and the name, the bomb and mine buttons how many are left.
    this.text("touch-weapon-name", t().weapons[this.inHand].name)
    this.text("touch-mag", mag)
    this.text("touch-reserve", endless ? "" : `/ ${ammo.reserve}`)
    this.data("touch-bomb", "n", String(a.bombs))
    this.data("touch-mine", "n", String(a.mines))
    const slots: [string, WeaponId][] = [["1", a.primary], ["2", "mandi"], ["3", "lanciafrico"], ["4", "mescul"]]
    this.html("slots", slots
      .map(([k, id]) => `<span class="${id === a.current ? "on" : slot.owned(id) ? "" : "off"}">${k} ${t().weapons[id].short}</span>`)
      .join(""))
    const buffs: string[] = []
    if (a.sgnape > 0) buffs.push(`🍶 Sgnape ${Math.ceil(a.sgnape / 60)}s`)
    if (you.shield > 0) buffs.push(t().hud.shield)
    this.text("buffs", buffs.join(" · "))
    this.toggle("sgnape-fx", "on", a.sgnape > 0)
  }

  /** On the turret: the mitraie's heat. Near a free one: the active device's control to use it. */
  turret(gun: { readonly heat: number; readonly jammed: boolean } | null, prompt: boolean, device: Device) {
    this.toggle("turret-hud", "hidden", !gun)
    this.toggle("turret-prompt", "hidden", !prompt && !gun)
    this.html("turret-prompt", turretPrompt(t(), device, !!gun))
    if (!gun) return
    this.style("turret-heat", "width", `${Math.round(gun.heat * 100)}%`)
    this.toggle("turret-hud", "jammed", gun.jammed)
    this.toggle("turret-hud", "warm", gun.heat > 0.7)
    this.text("turret-label", gun.jammed ? t().hud.turretHot : t().hud.turretHeat)
  }

  /** Feathers in the eyes (the gjaline): vision is covered for `seconds` and then slowly clears. */
  feathers(seconds: number) {
    const el = $("plumis")
    el.innerHTML = Array.from({ length: 34 }, (_, i) => {
      const x = (i * 37) % 100
      const y = (i * 53) % 100
      const r = (i * 71) % 360
      const s = 2.2 + ((i * 13) % 10) / 3
      return `<i style="left:${x}%;top:${y}%;--r:${r}deg;font-size:${s}em;animation-delay:${((i % 7) * 0.05).toFixed(2)}s">🪶</i>`
    }).join("")
    el.style.setProperty("--blind", `${seconds.toFixed(2)}s`)
    el.classList.remove("on")
    void el.offsetWidth
    el.classList.add("on")
  }

  crosshair(spreadPx: number, visible: boolean) {
    this.style("crosshair", "--gap", `${Math.round(4 + spreadPx)}px`)
    this.style("crosshair", "opacity", visible ? "1" : "0")
  }

  scope(on: boolean) {
    this.toggle("scope", "hidden", !on)
  }

  hitmarker(kind: "hit" | "head" | "kill") {
    const h = $("hitmarker")
    h.className = ""
    void h.offsetWidth
    h.className = `show ${kind === "hit" ? "" : kind}`
  }

  damage(angle: number | null) {
    const f = $("damage-flash")
    f.classList.remove("on")
    void f.offsetWidth
    f.classList.add("on")
    if (angle !== null) {
      const i = document.createElement("i")
      i.style.transform = `rotate(${angle}rad)`
      $("dmg-dirs").append(i)
      setTimeout(() => i.remove(), 1000)
    }
  }

  /** `outside`: I'm alive and outside the Tampieste circle. `device`: the active one, whose controls the banner names. */
  top(snap: Snapshot, mode: ModeId, names: Map<string, string>, device: Device, outside = false) {
    const s = t()
    if (snap.training) {
      // A training has no score and no clock: its panel says where the trainee is.
      this.text("name-ben", "")
      this.text("name-mal", "")
      this.text("score-ben", "")
      this.text("score-mal", "")
      this.text("clock", "")
      this.text("mode-label", `${s.modes[mode].name} · ${s.modes[mode].sub}`)
      this.html("objective", this.objectiveLine(snap, names))
      // The storm's step (#49): outside the ring, the same warning as in La Tampieste.
      this.html("banner", outside ? `<b class="storm">${s.hud.stormOutside}</b>` : "")
      return
    }
    const alone = mode === "tampieste"
    const alive = snap.players.filter((p) => p.f & FLAG_BIT.alive).length
    // In the Tampieste there are no teams: instead of the score, how many are still standing.
    this.text("name-ben", alone ? s.hud.alive(alive) : s.teams.benandanti.name)
    this.text("name-mal", alone ? "" : s.teams.malandanti.name)
    this.text("score-ben", alone ? "" : mode === "cjar" ? `${snap.score.benandanti}%` : String(snap.score.benandanti))
    this.text("score-mal", alone ? "" : String(snap.score.malandanti))
    const phase = snap.phase
    this.text("clock", phase.tag === "Live" ? fmtClock(phase.ends - snap.tick) : phase.tag === "Warmup" ? fmtClock(WARMUP_TICKS - snap.tick) : s.hud.over)
    this.text("mode-label", alone ? `${s.modes[mode].name} · ${s.modes[mode].sub}` : s.hud.modeLabel(s.modes[mode].name, MODES[mode].scoreLimit))
    this.html("objective", this.objectiveLine(snap, names))
    this.html(
      "banner",
      phase.tag === "Warmup" ? s.hud.warmup(fmtClock(WARMUP_TICKS - snap.tick), menuControl(device)) : outside ? `<b class="storm">${s.hud.stormOutside}</b>` : ""
    )
  }

  /** The state of the objective in force (`snap.objective`), and nothing for any other: in a regular room it is its mode's, in a training the current step's. */
  private objectiveLine(snap: Snapshot, names: Map<string, string>) {
    const s = t()
    let obj = ""
    if (snap.objective === "frico") {
      obj = (["benandanti", "malandanti"] as const)
        .map((team) => {
          const f = snap.flags[team]
          const state = f._tag === "base" ? s.hud.flagHome : f._tag === "carried" ? s.hud.flagCarried(esc(names.get(f.by) ?? "?")) : s.hud.flagDropped(Math.ceil(f.ticks / 60))
          return `<span class="${team === "benandanti" ? "ben" : "mal"}">🧀 ${state}</span>`
        })
        .join(" · ")
    } else if (snap.objective === "placute") {
      const h = snap.hill
      const color = h.owner ? TEAM_INFO[h.owner].color : "#888"
      const label = h.contested ? s.hud.contested : h.owner ? s.hud.hillOwned(s.teams[h.owner].name) : s.hud.hillFree
      obj = `${label}<div class="hillbar"><i style="width:${((h.ticks % 60) / 60) * 100}%;background:${color}"></i></div>`
    } else if (snap.objective === "cjar" && snap.cart) {
      const c = snap.cart
      const pct = Math.floor(c.progress * 100)
      const state = c.contested ? s.hud.cartStop : c.pushers > 0 ? s.hud.cartPush(c.pushers) : c.back ? s.hud.cartBack : s.hud.cartIdle
      const color = c.contested ? "#ffb347" : TEAM_INFO.benandanti.color
      obj = `${s.hud.cart(pct)} · ${state}<div class="hillbar"><i style="width:${pct}%;background:${color}"></i></div>`
    }
    return obj
  }

  killfeed(k: string | null, v: string, w: KillCause, head: boolean, names: Map<string, string>, teams: Map<string, Team>, me: string, seed: number) {
    const div = document.createElement("div")
    div.className = `kf${k === me || v === me ? " me" : ""}`
    const kill = t().hud.kill
    const victim = teamSpan(names.get(v) ?? "?", teams.get(v))
    if (!k) {
      div.innerHTML = `${victim} <em>${w === "fall" ? kill.fall : w === "tampieste" ? kill.storm : kill.self}</em>`
    } else {
      const verb = w === "fall" || w === "tampieste" ? kill.pushed : pick(kill[w], seed)
      const weapon = w === "sgnape" ? "🍶" : w === "mine" ? "💣" : w === "fall" || w === "tampieste" ? "" : t().weapons[w].name
      div.innerHTML = `${teamSpan(names.get(k) ?? "?", teams.get(k))} <em>${verb}</em> ${victim}${head ? ` <em>${kill.head}</em> 🎯` : ""} <span class="w">${weapon}</span>`
    }
    const feed = $("killfeed")
    feed.append(div)
    while (feed.children.length > 6) feed.firstElementChild?.remove()
    setTimeout(() => div.remove(), 7000)
  }

  announce(text: string, sub = "") {
    const a = $("announce")
    a.innerHTML = `${esc(text)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}`
    a.classList.remove("pop")
    void a.offsetWidth
    a.classList.add("pop")
    clearTimeout(this.announceTimer)
    this.announceTimer = window.setTimeout(() => (a.innerHTML = ""), 2700)
  }

  streak(name: string, n: number) {
    const text = t().hud.streaks[n]
    if (text) this.announce(text, t().hud.streak(name, n))
  }

  death(you: SnapSelf | null, names: Map<string, string>, seed: number) {
    const dead = !!you && !you.alive
    this.toggle("death", "hidden", !dead)
    if (!dead || !you) return
    const s = t().hud
    this.html("death-by", you.killer ? s.deathBy(esc(names.get(you.killer) ?? "?")) : s.deathSelf)
    this.text("death-line", pick(s.deathLines, seed))
    this.text("death-timer", this.spectating ? s.spectate : you.respawn > 0 ? s.respawnIn(Math.ceil(you.respawn / 60)) : "…")
  }

  chat(name: string, team: Team | null, text: string) {
    const log = $("chat-log")
    const div = document.createElement("div")
    div.innerHTML = `${team ? teamSpan(name, team) : `<b>${esc(name)}</b>`}: ${esc(text)}`
    log.append(div)
    while (log.children.length > 8) log.firstElementChild?.remove()
    setTimeout(() => div.classList.add("old"), 9000)
    clearTimeout(this.chatTimer)
  }

  board(rows: readonly BoardRow[], me: string, visible: boolean) {
    const b = $("board")
    b.classList.toggle("hidden", !visible)
    if (!visible) return
    b.innerHTML = boardHtml(rows, me)
  }


  /** The prompt to start playing, naming the active device's control: "tap", "click" or a controller's button. */
  clickToPlay(on: boolean, device: Device) {
    this.toggle("clickplay", "hidden", !on)
    if (on) this.html("clickplay", playPrompt(t(), device))
  }

  /**
   * The HUD's layout: around the touch controls while touch is the active device, the desktop one
   * otherwise. The page's `data-device` says the same to the menus' CSS (key hints, touch gestures).
   */
  layFor(device: Device) {
    this.toggle("hud", "touch", device === "touch")
    if (this.written.get("page:device") === device) return
    this.written.set("page:device", device)
    document.documentElement.dataset.device = device
  }

  /** The screen's safe-area insets (notch, home indicator), as CSS resolves them: read on resize, never per frame. */
  safeInsets(): Insets {
    const s = getComputedStyle($("safe-area"))
    return { top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 }
  }

  /** The touch controls are shown only while touch is the active device and nothing covers the match. */
  touchShown(on: boolean) {
    this.toggle("touch", "hidden", !on)
  }

  /** Places the touch controls for the canvas's current size (on start and on every resize or rotation). */
  placeTouch(layout: TouchLayout) {
    const s = layout.stick
    this.style("touch", "--stick-r", `${s.radius}px`)
    this.style("touch", "--rest-x", `${s.rest.x}px`)
    this.style("touch", "--rest-y", `${s.rest.y}px`)
    this.style("touch", "--fire-x", `${layout.fire.x}px`)
    this.style("touch", "--fire-y", `${layout.fire.y}px`)
    this.style("touch", "--fire-r", `${layout.fire.r}px`)
    const left = layout.leftFire
    this.style("touch", "--lfire-x", `${left.x}px`)
    this.style("touch", "--lfire-y", `${left.y}px`)
    this.style("touch", "--lfire-r", `${left.r}px`)
    for (const b of TOUCH_BUTTONS) {
      const c = layout.buttons[b]
      this.style(`touch-${b}`, "--x", `${c.x}px`)
      this.style(`touch-${b}`, "--y", `${c.y}px`)
      this.style(`touch-${b}`, "--r", `${c.r}px`)
    }
    // The HUD's area clear of the controls, for the touch HUD's CSS and the performance panel outside it; the orientation.
    const f = layout.free
    this.pageStyle("--free-l", `${f.left}px`)
    this.pageStyle("--free-t", `${f.top}px`)
    this.pageStyle("--free-w", `${f.width}px`)
    this.pageStyle("--free-h", `${f.height}px`)
    this.toggle("hud", "portrait", layout.portrait)
    // The corner buttons' row, which the score shares in portrait: its height, its gap to the free area, the width left beside the buttons.
    const { menu, phrases } = layout.buttons
    this.style("hud", "--row-h", `${2 * menu.r}px`)
    this.style("hud", "--row-gap", `${f.top - (menu.y + menu.r)}px`)
    this.style("hud", "--row-w", `${f.left + f.width - (phrases.x + phrases.r) - (f.top - (menu.y + menu.r))}px`)
    // The vitals, from the free area's corner (they share its box).
    const v = layout.vitals
    this.style("vitals", "--x", `${v.left - f.left}px`)
    this.style("vitals", "--y", `${v.top - f.top}px`)
    this.style("vitals", "--w", `${v.width}px`)
    this.style("vitals", "--h", `${v.height}px`)
    const w = layout.weapon
    this.style("touch", "--wx", `${w.left}px`)
    this.style("touch", "--wy", `${w.top}px`)
    this.style("touch", "--ww", `${w.width}px`)
    this.style("touch", "--wh", `${w.height}px`)
    this.touchLayout = layout
    this.drawnPicker = undefined
  }

  /** The weapon the vitals last showed in hand: the picker marks it. */
  private inHand: WeaponId | null = null

  /** What the touch buttons last showed: compared as plain values, so a finger's move redraws nothing else. */
  private touchLayout: TouchLayout | null = null
  private drawnPressed = -1
  private drawnToggles = -1
  private drawnUse: TouchView["use"] | undefined = undefined
  private drawnPicker: readonly PickerEntry[] | null | undefined = undefined

  /**
   * Draws the stick as held and the knob under the thumb, and fire as held.
   * Called on touch events only; it writes transforms and classes, never layout.
   */
  drawTouch(view: TouchView) {
    const stick = $("touch-stick")
    const knob = $("touch-knob")
    const v = view.stick
    stick.classList.toggle("held", v.held)
    knob.style.transform = v.held ? `translate(${v.kx}px, ${v.ky}px)` : ""
    $("touch-fire").classList.toggle("held", view.fire)
    $("touch-fire-left").classList.toggle("held", view.fire)
    if (view.pressed !== this.drawnPressed) {
      this.drawnPressed = view.pressed
      for (const b of TOUCH_BUTTONS) $(`touch-${b}`).classList.toggle("held", (view.pressed & buttonBit(b)) !== 0)
    }
    const toggles = (view.aim ? 1 : 0) | (view.crouch ? 2 : 0) | (view.board ? 4 : 0)
    if (toggles !== this.drawnToggles) {
      this.drawnToggles = toggles
      $("touch-aim").classList.toggle("on", view.aim)
      $("touch-crouch").classList.toggle("on", view.crouch)
      $("touch-board").classList.toggle("on", view.board)
    }
    if (view.use !== this.drawnUse) {
      this.drawnUse = view.use
      const use = $("touch-use")
      use.classList.toggle("hidden", !view.use)
      use.textContent = view.use === "dismount" ? t().hud.touchLeave : t().hud.touchUse
    }
    if (view.picker !== this.drawnPicker) {
      this.drawnPicker = view.picker
      const picker = $("touch-picker")
      picker.classList.toggle("hidden", !view.picker)
      const rects = this.touchLayout?.picker ?? []
      picker.innerHTML = (view.picker ?? [])
        .map((e, i) => {
          const r = rects[i]
          const name = t().weapons[e.id].name
          return r ? `<div class="${e.id === this.inHand ? "on" : ""}" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px">${esc(name)}</div>` : ""
        })
        .join("")
    }
  }
}

export function boardHtml(rows: readonly BoardRow[], me: string) {
  return (["benandanti", "malandanti"] as const)
    .map((team) => {
      const list = rows.filter((r) => r.team === team).sort((a, b) => b.score - a.score)
      const info = t().teams[team]
      return `<h3 style="color:${TEAM_INFO[team].color}">${info.name} <small style="color:var(--muted);font-size:13px">· ${info.motto}</small></h3>
      <table><tr>${t().hud.board.map((h) => `<th>${h}</th>`).join("")}</tr>
      ${list
        .map(
          (r) =>
            `<tr class="${r.id === me ? "me" : ""}"><td>${esc(r.name)}${r.bot ? " 🤖" : ""}</td><td>${r.score}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.assists}</td><td>${r.caps}</td><td>${r.best}</td><td>${r.bot ? "—" : r.ping}</td></tr>`
        )
        .join("")}</table>`
    })
    .join("")
}

export function rosterHtml(room: RoomInfo, me: string) {
  return (["benandanti", "malandanti"] as const)
    .map(
      (team) =>
        `<ul><li style="color:${TEAM_INFO[team].color};font-family:var(--serif)"><b>${t().teams[team].name}</b></li>${room.roster
          .filter((r) => r.team === team)
          .map((r) => `<li${r.id === me ? ' style="color:var(--gold)"' : ""}>${esc(r.name)}${r.bot ? " 🤖" : ""}${r.id === room.hostId ? " 👑" : ""}</li>`)
          .join("")}</ul>`
    )
    .join("")
}

export { esc }
