/**
 * L'HUD in DOM: legge solo dati semplici che gli passa il loop di gioco.
 */
import { DEATH_LINES, KILL_VERBS, MODES, pick, SPECIAL_KILLS, STREAKS, TEAM_INFO, type ModeId } from "../shared/folklore.ts"
import type { Team } from "../shared/map.ts"
import type { BoardRow, RoomInfo, SnapSelf, Snapshot } from "../shared/protocol.ts"
import type { KillCause } from "../shared/sim/events.ts"
import { SGNAPE_BOMB, WEAPONS, type WeaponId } from "../shared/weapons.ts"

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const teamSpan = (name: string, team: Team | undefined) => `<b class="${team === "malandanti" ? "mal" : team === "benandanti" ? "ben" : ""}">${esc(name)}</b>`

export const fmtClock = (ticks: number) => {
  const s = Math.max(0, Math.ceil(ticks / 60))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export class Hud {
  private announceTimer = 0
  private chatTimer = 0

  show(on: boolean) {
    $("hud").classList.toggle("hidden", !on)
  }

  vitals(you: SnapSelf | null, slot: { owned: (id: WeaponId) => boolean }, localMag: number | null) {
    if (!you) return
    const hp = Math.max(0, you.hp)
    $("hp").textContent = String(hp)
    $("hp-bar").style.width = `${hp}%`
    $("hp").parentElement!.classList.toggle("low", hp < 30 && you.alive)
    $("armor").textContent = String(you.armor)
    $("armor-bar").style.width = `${you.armor}%`
    const a = you.arsenal
    const def = WEAPONS[a.current]
    $("weapon-name").textContent = def.name
    const ammo = a.ammo[a.current]
    $("mag").textContent = def.mode === "melee" ? "∞" : String(localMag ?? ammo.mag)
    $("reserve").textContent = def.mode === "melee" ? "" : String(ammo.reserve)
    $("reserve").previousElementSibling!.classList.toggle("hidden", def.mode === "melee")
    $("bombs").textContent = `${SGNAPE_BOMB.name}: ${"🍶".repeat(a.bombs) || "—"}`
    const slots: [string, WeaponId][] = [["1", a.primary], ["2", "mandi"], ["3", "lanciafrico"], ["4", "mescul"]]
    $("slots").innerHTML = slots
      .map(([k, id]) => `<span class="${id === a.current ? "on" : slot.owned(id) ? "" : "off"}">${k} ${WEAPONS[id].name.split(" ")[0]}</span>`)
      .join("")
    const buffs: string[] = []
    if (a.sgnape > 0) buffs.push(`🍶 Sgnape ${Math.ceil(a.sgnape / 60)}s`)
    if (you.shield > 0) buffs.push("✨ Protet")
    $("buffs").textContent = buffs.join(" · ")
    $("sgnape-fx").classList.toggle("on", a.sgnape > 0)
  }

  crosshair(spreadPx: number, visible: boolean) {
    const c = $("crosshair")
    c.style.setProperty("--gap", `${4 + spreadPx}px`)
    c.style.opacity = visible ? "1" : "0"
  }

  scope(on: boolean) {
    $("scope").classList.toggle("hidden", !on)
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

  top(snap: Snapshot, mode: ModeId, names: Map<string, string>) {
    $("score-ben").textContent = String(snap.score.benandanti)
    $("score-mal").textContent = String(snap.score.malandanti)
    const phase = snap.phase
    $("clock").textContent = phase.tag === "Live" ? fmtClock(phase.ends - snap.tick) : phase.tag === "Warmup" ? "—:—" : "FIN"
    $("mode-label").textContent = `${MODES[mode].name} · fin a ${MODES[mode].scoreLimit}`
    let obj = ""
    if (mode === "frico") {
      obj = (["benandanti", "malandanti"] as const)
        .map((t) => {
          const f = snap.flags[t]
          const s = f._tag === "base" ? "a cjase" : f._tag === "carried" ? `cjapât da ${esc(names.get(f.by) ?? "?")}` : `par tiere ${Math.ceil(f.ticks / 60)}s`
          return `<span class="${t === "benandanti" ? "ben" : "mal"}">🧀 ${s}</span>`
        })
        .join(" · ")
    } else if (mode === "culine") {
      const h = snap.hill
      const color = h.owner ? TEAM_INFO[h.owner].color : "#888"
      const label = h.contested ? "Contese!" : h.owner ? `Plaçute: ${TEAM_INFO[h.owner].name}` : "Plaçute libare"
      obj = `${label}<div class="hillbar"><i style="width:${((h.ticks % 60) / 60) * 100}%;background:${color}"></i></div>`
    }
    $("objective").innerHTML = obj
    $("banner").innerHTML =
      phase.tag === "Warmup" ? "Riscjaldament · l'host al fâs partî la partide dal menu (<kbd>Esc</kbd>)" : ""
  }

  killfeed(k: string | null, v: string, w: KillCause, head: boolean, names: Map<string, string>, teams: Map<string, Team>, me: string, seed: number) {
    const div = document.createElement("div")
    div.className = `kf${k === me || v === me ? " me" : ""}`
    const victim = teamSpan(names.get(v) ?? "?", teams.get(v))
    if (!k) {
      div.innerHTML = w === "fall" ? `${victim} <em>${SPECIAL_KILLS.fall}</em>` : `${victim} <em>${SPECIAL_KILLS.self}</em>`
    } else {
      const verb = w === "sgnape" ? pick(SPECIAL_KILLS.sgnape, seed) : w === "fall" ? "al à butât jù" : pick(KILL_VERBS[w], seed)
      const weapon = w === "sgnape" ? "🍶" : w === "fall" ? "" : WEAPONS[w].name
      div.innerHTML = `${teamSpan(names.get(k) ?? "?", teams.get(k))} <em>${verb}</em> ${victim}${head ? ` <em>${SPECIAL_KILLS.head}</em> 🎯` : ""} <span class="w">${weapon}</span>`
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
    const text = STREAKS[n]
    if (text) this.announce(text, `${name} · ${n} di fila`)
  }

  death(you: SnapSelf | null, names: Map<string, string>, seed: number) {
    const d = $("death")
    const dead = !!you && !you.alive
    d.classList.toggle("hidden", !dead)
    if (!dead || !you) return
    $("death-by").innerHTML = you.killer ? `Ti à fat fûr <b>${esc(names.get(you.killer) ?? "?")}</b>` : "Ti sês fat dal mâl di bessôl"
    $("death-line").textContent = pick(DEATH_LINES, seed)
    $("death-timer").textContent = you.respawn > 0 ? `Si torne in pîts tra ${Math.ceil(you.respawn / 60)}…` : "…"
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

  netinfo(text: string) {
    $("netinfo").textContent = text
  }

  clickToPlay(on: boolean) {
    $("clickplay").classList.toggle("hidden", !on)
  }
}

export function boardHtml(rows: readonly BoardRow[], me: string) {
  return (["benandanti", "malandanti"] as const)
    .map((team) => {
      const list = rows.filter((r) => r.team === team).sort((a, b) => b.score - a.score)
      const info = TEAM_INFO[team]
      return `<h3 style="color:${info.color}">${info.name} <small style="color:var(--muted);font-size:13px">· ${info.motto}</small></h3>
      <table><tr><th>Non</th><th>Pont</th><th>Copâts</th><th>Muarts</th><th>Ajût</th><th>Frics</th><th>Serie</th><th>Ping</th></tr>
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
        `<ul><li style="color:${TEAM_INFO[team].color};font-family:var(--serif)"><b>${TEAM_INFO[team].name}</b></li>${room.roster
          .filter((r) => r.team === team)
          .map((r) => `<li${r.id === me ? ' style="color:var(--gold)"' : ""}>${esc(r.name)}${r.bot ? " 🤖" : ""}${r.id === room.hostId ? " 👑" : ""}</li>`)
          .join("")}</ul>`
    )
    .join("")
}

export { esc }
