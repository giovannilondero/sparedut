/**
 * Next-primary prototype B, the death screen (issue #93): the choice where a player stops to wait,
 * the death screen, with a strip of the primaries under the respawn timer (number keys on a
 * desktop, a tap on touch); the same strip in the match menu, for a change asked for during a life.
 * Loud about it: the match menu sets the next primary beside the current one, the HUD carries it
 * for the whole life on the weapon panel, the death screen leads with it.
 */
import { PRIMARIES, type PrimaryId } from "../../../shared/weapons.ts"
import type { Device } from "../../device.ts"
import { t } from "../../i18n.ts"
import { choose, current, figuresHtml, figuresShort, lockedNote, pending, primName, primShort, pt, run, type State, type Variant } from "./kit.ts"

/** The primaries as a strip of chips: the one in hand, the next life, the rest. With `keys`, each its number. */
function strip(s: State, keys: boolean) {
  const now = current(s)
  const next = pending(s)
  const chip = (p: PrimaryId, i: number) => {
    const cls = p === now ? " now" : p === next ? " next" : ""
    const tag = p === now ? pt().inHand : p === next ? pt().nextLife : ""
    return `<button class="b-chip${cls}" role="radio" aria-checked="${p === (next ?? now)}" data-set="${choose(p, s)}">${keys ? `<kbd>${i + 1}</kbd>` : ""}<b>${primShort(p)}</b><small>${tag || figuresShort(p)}</small></button>`
  }
  return `<div class="b-strip" role="radiogroup" aria-label="${t().pause.primary}">${PRIMARIES.map(chip).join("")}</div>`
}

/** The next primary, large, with its class and the button that cancels it. */
const nextCard = (next: PrimaryId) =>
  `<div class="b-next"><span class="np-tag next">${pt().nextLife}</span><b>${primName(next)}</b><span class="pause-primary-figures">${figuresHtml(next)}</span><button class="np-cancel" data-set="screen=menu">${pt().cancel}</button></div>`

const variant: Variant = {
  menuPrimary: (s) => {
    const now = current(s)
    const next = pending(s)
    const nowCard = `<div class="b-now"><span class="np-tag">${pt().inHand}</span><div class="pause-primary-name">${primName(now)}</div><span class="pause-primary-figures">${figuresHtml(now)}</span></div>`
    if (s.single) return `<div class="muted">${t().pause.primary}</div>${lockedNote()}`
    return `<div class="muted">${t().pause.primary}</div>
      <div class="b-pair${next ? " on" : ""}">${nowCard}${next ? nextCard(next) : ""}</div>
      <p class="b-note">${next ? pt().keepUntil : pt().chooseOther}</p>
      ${strip(s, false)}`
  },
  decorate: (s, device: Device, hud) => {
    if (s.single) return
    const next = pending(s)
    if (s.screen === "death") {
      hud.classList.add("b-dead")
      const head = next ? `<div class="b-death-head">${pt().comeBackWith} <b>${primName(next)}</b></div>` : ""
      const ask = `<div class="b-death-ask">${pt().withWhat} <span>${device === "touch" ? pt().tap : pt().keys(PRIMARIES.length)}</span></div>`
      hud.querySelector("#death-timer")!.insertAdjacentHTML("afterend", `<div class="b-death np-more">${head}${ask}${strip(s, device !== "touch")}</div>`)
      return
    }
    if (!next) return
    const card = `<div class="b-life"><span class="np-tag next">${pt().nextLife}</span><b>${device === "touch" ? primShort(next) : primName(next)}</b><small>${figuresShort(next)}</small></div>`
    if (device === "touch") hud.querySelector("#topbar")!.insertAdjacentHTML("afterend", card)
    else hud.querySelector("#ammo")!.insertAdjacentHTML("afterbegin", card)
  }
}

run(document.getElementById("app")!, variant)
