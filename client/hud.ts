/**
 * L'HUD in DOM: legge solo dati semplici che gli passa il loop di gioco.
 */
import { MODES, pick, TEAM_INFO, type ModeId } from "../shared/folklore.ts"
import type { Team } from "../shared/map.ts"
import { FLAG_BIT, type BoardRow, type RoomInfo, type SnapSelf, type Snapshot } from "../shared/protocol.ts"
import type { KillCause } from "../shared/sim/events.ts"
import { WEAPONS, type WeaponId } from "../shared/weapons.ts"
import { WARMUP_TICKS } from "../shared/sim/rules.ts"
import { t } from "./i18n.ts"

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const teamSpan = (name: string, team: Team | undefined) => `<b class="${team === "malandanti" ? "mal" : team === "benandanti" ? "ben" : ""}">${esc(name)}</b>`

export const fmtClock = (ticks: number) => {
  const s = Math.max(0, Math.ceil(ticks / 60))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export class Hud {
  private announceTimer = 0
  /** Nella Tampieste in corso chi muore non rinasce: il pannello della morte lo dice. */
  spectating = false
  private chatTimer = 0
  /** Ultimo valore scritto per elemento e proprietà: il DOM si tocca solo se cambia. */
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

  show(on: boolean) {
    this.toggle("hud", "hidden", !on)
  }

  /** `turret`: sono alla torretta, l'arma in mano è la mitraie (colpi infiniti). */
  vitals(you: SnapSelf | null, slot: { owned: (id: WeaponId) => boolean }, localMag: number | null, turret = false) {
    if (!you) return
    const hp = Math.max(0, you.hp)
    this.text("hp", String(hp))
    this.style("hp-bar", "width", `${hp}%`)
    this.toggleOn($("hp").parentElement!, "hp-low", "low", hp < 30 && you.alive)
    this.text("armor", String(you.armor))
    this.style("armor-bar", "width", `${you.armor}%`)
    const a = you.arsenal
    const def = WEAPONS[a.current]
    const endless = def.mode === "melee" || turret
    this.text("weapon-name", t().weapons[turret ? "mitraie" : a.current].name)
    const ammo = a.ammo[a.current]
    this.text("mag", endless ? "∞" : String(localMag ?? ammo.mag))
    this.text("reserve", endless ? "" : String(ammo.reserve))
    this.toggleOn($("reserve").previousElementSibling!, "slash", "hidden", endless)
    this.text("bombs", `${t().bomb}: ${"🍶".repeat(a.bombs) || "—"} · ${t().mine}: ${"💣".repeat(a.mines) || "—"}`)
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

  /** Alla torretta: il calore della mitraie. Vicino a una libera: il tasto per usarla. */
  turret(gun: { readonly heat: number; readonly jammed: boolean } | null, prompt: boolean) {
    this.toggle("turret-hud", "hidden", !gun)
    this.toggle("turret-prompt", "hidden", !prompt && !gun)
    this.html("turret-prompt", gun ? t().hud.turretLeave : t().hud.turretUse)
    if (!gun) return
    this.style("turret-heat", "width", `${Math.round(gun.heat * 100)}%`)
    this.toggle("turret-hud", "jammed", gun.jammed)
    this.toggle("turret-hud", "warm", gun.heat > 0.7)
    this.text("turret-label", gun.jammed ? t().hud.turretHot : t().hud.turretHeat)
  }

  /** Piume negli occhi (la gjaline): la vista si copre per `seconds` e poi si libera piano. */
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

  /** `outside`: sono vivo e fuori dal cerchio della Tampieste. */
  top(snap: Snapshot, mode: ModeId, names: Map<string, string>, outside = false) {
    const s = t()
    const alone = mode === "tampieste"
    const alive = snap.players.filter((p) => p.f & FLAG_BIT.alive).length
    // Nella Tampieste non ci sono squadre: al posto dei punti, quanti sono in piedi.
    this.text("name-ben", alone ? s.hud.alive(alive) : s.teams.benandanti.name)
    this.text("name-mal", alone ? "" : s.teams.malandanti.name)
    this.text("score-ben", alone ? "" : mode === "cjar" ? `${snap.score.benandanti}%` : String(snap.score.benandanti))
    this.text("score-mal", alone ? "" : String(snap.score.malandanti))
    const phase = snap.phase
    this.text("clock", phase.tag === "Live" ? fmtClock(phase.ends - snap.tick) : phase.tag === "Warmup" ? fmtClock(WARMUP_TICKS - snap.tick) : s.hud.over)
    this.text("mode-label", alone ? `${s.modes[mode].name} · ${s.modes[mode].sub}` : s.hud.modeLabel(s.modes[mode].name, MODES[mode].scoreLimit))
    let obj = ""
    if (mode === "frico") {
      obj = (["benandanti", "malandanti"] as const)
        .map((team) => {
          const f = snap.flags[team]
          const state = f._tag === "base" ? s.hud.flagHome : f._tag === "carried" ? s.hud.flagCarried(esc(names.get(f.by) ?? "?")) : s.hud.flagDropped(Math.ceil(f.ticks / 60))
          return `<span class="${team === "benandanti" ? "ben" : "mal"}">🧀 ${state}</span>`
        })
        .join(" · ")
    } else if (mode === "culine") {
      const h = snap.hill
      const color = h.owner ? TEAM_INFO[h.owner].color : "#888"
      const label = h.contested ? s.hud.contested : h.owner ? s.hud.hillOwned(s.teams[h.owner].name) : s.hud.hillFree
      obj = `${label}<div class="hillbar"><i style="width:${((h.ticks % 60) / 60) * 100}%;background:${color}"></i></div>`
    } else if (mode === "cjar" && snap.cart) {
      const c = snap.cart
      const pct = Math.floor(c.progress * 100)
      const state = c.contested ? s.hud.cartStop : c.pushers > 0 ? s.hud.cartPush(c.pushers) : c.back ? s.hud.cartBack : s.hud.cartIdle
      const color = c.contested ? "#ffb347" : TEAM_INFO.benandanti.color
      obj = `${s.hud.cart(pct)} · ${state}<div class="hillbar"><i style="width:${pct}%;background:${color}"></i></div>`
    }
    this.html("objective", obj)
    this.html(
      "banner",
      phase.tag === "Warmup" ? s.hud.warmup(fmtClock(WARMUP_TICKS - snap.tick)) : outside ? `<b class="storm">${s.hud.stormOutside}</b>` : ""
    )
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


  clickToPlay(on: boolean) {
    this.toggle("clickplay", "hidden", !on)
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
