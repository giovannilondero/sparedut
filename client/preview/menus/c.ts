/**
 * Prototype C, list as home: the room list is the home screen; creating a room opens a side
 * panel over it (a bottom sheet on a phone held upright), with every choice as a list of rows.
 */
import { MODE_IDS } from "../../../shared/folklore.ts"
import { MAP_IDS } from "../../../shared/maps/index.ts"
import { REACHES } from "../../../shared/protocol.ts"
import { t } from "../../i18n.ts"
import {
  accessBlock, botsSelect, codeJoin, ffCheck, langSwitch, levelCards, lookSwitch, minutesSelect, missing, nameField, oneTapButton, passwordPrompt, roomList,
  roomsOf, run, trainingEntry, type State
} from "./kit.ts"

/** A choice as a row with a radio dot: the panel's single control for mode, map and reach. */
const radio = (on: boolean, set: string, title: string, sub: string) =>
  `<button class="c-radio${on ? " on" : ""}" data-set="${set}" role="radio" aria-checked="${on}"><i aria-hidden="true"></i><span><b>${title}</b><small>${sub}</small></span></button>`

function panel(s: State) {
  const st = t().static
  const m = t().menu
  const why = missing(s)
  return `<div class="c-scrim" data-set="open=0"></div>
  <aside class="c-panel" role="dialog" aria-modal="true" aria-labelledby="c-panel-title">
    <div class="c-grab" aria-hidden="true"></div>
    <header class="c-phead"><h2 id="c-panel-title">${st.create}</h2><button class="back" data-set="open=0">${st.back}</button></header>
    <div class="c-pbody">
      <fieldset><legend>${m.steps.mode}</legend><div class="c-radios" role="radiogroup">${MODE_IDS.map((id) => radio(id === s.mode, `mode=${id}`, t().modes[id].name, t().modes[id].sub)).join("")}</div></fieldset>
      <fieldset><legend>${st.mapLabel}</legend><div class="c-radios" role="radiogroup">${MAP_IDS.map((id) => radio(id === s.map, `map=${id}`, t().maps[id].name, t().maps[id].sub)).join("")}</div></fieldset>
      <fieldset><legend>${st.reachLabel}</legend><div class="c-radios" role="radiogroup">${REACHES.map((r) => radio(r === s.reach, `reach=${r}`, `<i class="chip ${r}">${m.reach[r]}</i>`, m.reachSub[r])).join("")}</div>
        <div class="c-access">${accessBlock(s)}</div></fieldset>
      <fieldset><legend>${m.steps.options}</legend><div class="c-pair">${minutesSelect()}${botsSelect()}</div>
        <div class="field"><span>${st.levelLabel}</span>${levelCards(s)}</div>${ffCheck()}</fieldset>
    </div>
    <footer class="c-pfoot">${why ? `<p class="form-msg" role="alert">${why}</p>` : ""}<button class="primary">${st.createGo}</button></footer>
  </aside>`
}

function home(s: State) {
  const st = t().static
  const count = roomsOf(s).length
  return `<div class="c-home">
    <header class="c-side">
      <span class="logo c-logo">Sparedût</span>
      <div class="c-switches">${langSwitch(s, true)}${lookSwitch(s, true)}</div>
      ${nameField("c-name")}
      <div class="c-actions">
        ${oneTapButton(s, "primary c-onetap")}
        <button class="c-create" data-set="open=1"><b>+</b> ${st.create}</button>
      </div>
      <nav class="c-nav">${trainingEntry("c-chip")}<button class="c-chip">${st.armarie}</button><button class="c-chip">${st.settings}</button><button class="c-chip">${st.vocab}</button></nav>
    </header>
    <main class="c-main">
      <div class="c-listhead"><h2>${st.roomsTitle} <i class="count">${count}</i></h2>${codeJoin("c-code inline")}</div>
      <div class="c-list">${roomList(s, "open=1")}</div>
    </main>
  </div>${s.open ? panel(s) : ""}${passwordPrompt(s, "c-pw")}`
}

run(
  document.getElementById("app")!,
  home,
  (s) => (s.open ? { open: false } : null)
)
