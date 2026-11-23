/**
 * Next-primary prototype C, the armoury (issue #93): the training's armoury in every match. The
 * match menu shows the primary in hand and, once asked for, the next one beside it, with a button
 * to the armoury; the death screen opens it too (B on a desktop, a button on touch). The armoury
 * is the game's weapon cards, saying that a new primary arrives at the next respawn. Told as a
 * pair, "now → next", where the primary already shows: the weapon panel's slot, the touch weapon
 * button's name, the death screen with the two classes' figures.
 */
import { PRIMARIES, WEAPONS, type PrimaryId } from "../../../shared/weapons.ts"
import { t } from "../../i18n.ts"
import { classFigures } from "../../menu-model.ts"
import { choose, current, figuresHtml, lockedNote, pending, primName, primShort, pt, run, type Variant } from "./kit.ts"

/** A primary's card as the armoury draws it (`Menu.buildArmarie`): tag, name, line, class figures and the weapon's bars. */
function card(p: PrimaryId) {
  const s = t()
  const w = WEAPONS[p]
  const max = { damage: 110, rate: 10, range: 400, mag: 30 }
  const bar = (label: string, v: number) => `<span class="stat">${label}<i style="width:${Math.min(100, v * 100)}%"></i></span>`
  return `<span class="tag">${w.slot} · ${s.menu.tag.primary}</span><b>${s.weapons[p].name}</b><span class="blurb">${s.weapons[p].blurb}</span>
    <span class="stats">${figuresHtml(p)}${bar(s.menu.stat.damage, (w.damage * w.pellets) / max.damage)}${bar(s.menu.stat.rate, 60 / w.cooldownTicks / max.rate)}${bar(s.menu.stat.range, (w.range || 120) / max.range)}${bar(s.menu.stat.mag, Math.max(w.magazine, 1) / max.mag)}</span>`
}

/** One side of the pair: now, or the next life. */
const side = (p: PrimaryId, next: boolean) =>
  `<div class="c-side${next ? " next" : ""}"><span class="np-tag${next ? " next" : ""}">${next ? pt().nextLife : pt().now}</span><div class="pause-primary-name">${primName(p)}</div><span class="pause-primary-figures">${figuresHtml(p)}</span></div>`

const variant: Variant = {
  menuPrimary: (s) => {
    const now = current(s)
    const next = pending(s)
    if (s.single) return `<div class="muted">${t().pause.primary}</div>${lockedNote()}`
    return `<div class="muted">${t().pause.primary}</div>
      <div class="c-pair${next ? " on" : ""}">${side(now, false)}${next ? `<span class="c-arrow" aria-hidden="true">→</span>${side(next, true)}` : ""}</div>
      ${next ? `<div class="c-row"><span>${pt().keepUntil}</span><button class="np-cancel" data-set="screen=menu">${pt().cancel}</button></div>` : `<p class="c-note">${pt().menuNote}</p>`}`
  },
  menuActions: (s) => (s.single ? "" : `<button id="p-loadout" data-set="screen=armoury">${t().loadout.title}</button>`),
  armoury: (s) => {
    const now = current(s)
    const next = pending(s)
    const item = (p: PrimaryId) => {
      const mark = p === now ? `<span class="np-tag c-mark">${pt().inHand}</span>` : p === next ? `<span class="np-tag next c-mark">${pt().nextLife}</span>` : ""
      return `<button class="weapon c-card${p === next ? " c-next" : ""}" role="radio" aria-checked="${p === (next ?? now)}"${p === now ? " data-checked" : ""} data-set="${choose(p, s)}">${mark}${card(p)}</button>`
    }
    return {
      title: t().loadout.title,
      main: `<div class="overlay-body"><p class="muted">${pt().armouryNote}</p><div class="weapons"><div class="weapon-cards" role="radiogroup">${PRIMARIES.map(item).join("")}</div></div></div>
        <div class="row overlay-actions"><button class="primary" data-set="screen=${next ? "pending" : "menu"}">${t().loadout.resume}</button></div>`
    }
  },
  decorate: (s, device, hud) => {
    const now = current(s)
    const next = pending(s)
    if (s.single) return
    if (s.screen === "death") {
      if (next) {
        const [[hl, hNow], [sl, sNow]] = classFigures(t(), now)
        const [[, hNext], [, sNext]] = classFigures(t(), next)
        const pair = `<div class="c-death np-more"><div class="c-death-label">${pt().comeBackWith}</div>
          <div class="c-death-pair"><s>${primShort(now)}</s><span aria-hidden="true">→</span><b>${primName(next)}</b></div>
          <div class="c-death-figs">${hl} ${hNow} → <b>${hNext}</b> · ${sl} ${sNow} → <b>${sNext}</b></div></div>`
        hud.querySelector("#death-timer")!.insertAdjacentHTML("afterend", pair)
      }
      // The way to the armoury: the training's key hint on a desktop, a button on touch.
      if (device === "touch") hud.querySelector("#death")!.insertAdjacentHTML("beforeend", `<button class="c-open" data-set="screen=armoury">${pt().armouryOpen}</button>`)
      else hud.querySelector("#death-hint")!.classList.remove("hidden")
      return
    }
    if (!next) return
    // Alive: the pair where the primary already shows.
    if (device === "touch") hud.querySelector("#touch-weapon-name")!.innerHTML = `${primShort(now)} <span class="c-to">▸ ${primShort(next)}</span>`
    else hud.querySelector("#weapon-name")!.insertAdjacentHTML("beforeend", ` <span class="c-to" title="${pt().nextLifeOf(primName(next))}">▸ ${primName(next)}</span>`)
  }
}

run(document.getElementById("app")!, variant)
