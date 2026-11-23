/**
 * Next-primary prototype A, the tiles (issue #93): the choice in the match menu only, on the
 * Muster's own tiles. The current primary keeps its place ("in hand"); another pressed is marked
 * "next life", pressed again or the current one pressed cancels. Quiet about it: in the HUD a small
 * mark beside the weapon, on the death screen one line under the timer.
 */
import type { PrimaryId } from "../../../shared/weapons.ts"
import { PRIMARIES } from "../../../shared/weapons.ts"
import { t } from "../../i18n.ts"
import { choose, classBars, current, figuresShort, lockedNote, pending, primName, primShort, pt, run, type State, type Variant } from "./kit.ts"

function tiles(s: State) {
  const now = current(s)
  const next = pending(s)
  const tile = (p: PrimaryId) => {
    const on = p === now
    const tag = on ? `<span class="np-tag">${pt().inHand}</span>` : p === next ? `<span class="np-tag next">${pt().nextLife}</span>` : `<span class="np-tag np-blank" aria-hidden="true">·</span>`
    const press = s.single ? " disabled" : ` data-set="${p === next ? "screen=menu" : choose(p, s)}"`
    return `<button class="weapon mu-tile a-tile${p === next ? " a-next" : ""}" role="radio" aria-checked="${on}"${on ? " data-checked" : ""}${press}>${tag}<b>${s.single && on ? "🔒 " : ""}${primName(p)}</b>${classBars(p)}<span class="a-nums">${figuresShort(p)}</span></button>`
  }
  return `<div class="mu-tiles a-tiles${s.single ? " locked" : ""}" role="radiogroup" aria-label="${t().pause.primary}">${PRIMARIES.map(tile).join("")}</div>`
}

const variant: Variant = {
  menuPrimary: (s) => {
    const next = pending(s)
    const note = s.single
      ? ""
      : next
        ? `<div class="a-note on"><span><b>${pt().nextLifeOf(primName(next))}</b> · ${pt().keepUntil}</span><button class="np-cancel" data-set="screen=menu">${pt().cancel}</button></div>`
        : `<p class="a-note">${pt().chooseOther}</p>`
    return `<div class="muted">${t().pause.primary}</div>${s.single ? lockedNote() : ""}${note}${tiles(s)}`
  },
  decorate: (s, device, hud) => {
    const next = pending(s)
    if (!next) return
    if (s.screen === "death") {
      hud.querySelector("#death-timer")!.insertAdjacentHTML("afterend", `<div class="a-death">${pt().comeBackWith} <b>${primName(next)}</b></div>`)
      return
    }
    const mark = `<span class="a-mark" title="${pt().nextLifeOf(primName(next))}">↻ ${primShort(next)}</span>`
    if (device === "touch") hud.querySelector("#touch")!.insertAdjacentHTML("beforeend", `<div class="a-badge">${mark}</div>`)
    else hud.querySelector("#slots")!.insertAdjacentHTML("beforeend", mark)
  }
}

run(document.getElementById("app")!, variant)
