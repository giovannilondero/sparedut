/**
 * Prototype B, compact page: everything on the home screen at once (the room list included),
 * and creation as one page where mode and map are prominent and the rest is folded under "options".
 */
import { MODE_IDS } from "../../../shared/folklore.ts"
import { MAP_IDS } from "../../../shared/maps/index.ts"
import { t } from "../../i18n.ts"
import {
  accessBlock, botsSelect, codeJoin, ffCheck, langSwitch, levelCards, lookSwitch, mapCard, minutesSelect, missing, modeCard, nameField,
  oneTapButton, passwordPrompt, optionsLine, reachCards, roomList, run, tools, trainingEntry, type State
} from "./kit.ts"

function home(s: State) {
  const st = t().static
  return `<div class="b-home">
    <span class="logo b-logo">Sparedût</span>
    <div class="b-lang">${langSwitch(s, true)}</div>
    ${nameField("b-name")}
    ${oneTapButton(s, "big primary b-hero")}
    <div class="b-tiles">
      <button class="big b-tile" data-set="screen=create"><span>+ ${st.create}</span><small>${st.createSub}</small></button>
      <div class="b-tile b-codebox">${codeJoin()}</div>
      ${trainingEntry("big b-tile b-train")}
    </div>
    <div class="b-tools">${tools()}</div>
    <div class="b-look">${lookSwitch(s)}</div>
    <section class="b-list"><h3>${st.roomsTitle}</h3>${roomList(s, "screen=create")}</section>
  </div>`
}

function create(s: State) {
  const st = t().static
  const m = t().menu
  const options = s.open
    ? `<div class="b-opts" id="b-opts">
        ${minutesSelect()}${botsSelect()}
        <div class="field b-wide"><span>${st.levelLabel}</span>${levelCards(s)}</div>
        <div class="field b-wide"><span>${st.reachLabel}</span>${reachCards(s)}</div>
        <div class="b-wide b-access">${accessBlock(s)}</div>
        <div class="b-wide">${ffCheck()}</div>
      </div>`
    : ""
  const why = missing(s)
  return `<div class="b-create">
    <header class="b-chead"><button class="back" data-set="screen=home&open=0">${st.back}</button><h2>${st.create}</h2>${langSwitch(s, true)}</header>
    <div class="b-pick">
      <section class="b-sec"><h3>${m.steps.mode}</h3>
        <div class="b-grid b-modes" role="radiogroup" aria-label="${m.steps.mode}">${MODE_IDS.map((id) => modeCard(s, id, false)).join("")}</div>
        <p class="b-rules">${t().modes[s.mode].rules}</p>
      </section>
      <section class="b-sec"><h3>${st.mapLabel}</h3>
        <div class="b-grid b-maps" role="radiogroup" aria-label="${st.mapLabel}">${MAP_IDS.map((id) => mapCard(s, id)).join("")}</div>
      </section>
    </div>
    <div class="b-side">
      <button class="b-fold${s.open ? " open" : ""}" data-set="open=${s.open ? 0 : 1}" aria-expanded="${s.open}" aria-controls="b-opts">
        <span><b>${m.steps.options}</b><small>${optionsLine(s)}</small></span><i aria-hidden="true">▾</i>
      </button>
      ${options}
    </div>
    <footer class="b-go">${why ? `<p class="form-msg" role="alert">${why}</p>` : ""}<button class="primary">${st.createGo}</button></footer>
  </div>`
}

run(
  document.getElementById("app")!,
  (s) => (s.screen === "create" ? create(s) : home(s) + passwordPrompt(s)),
  (s) => (s.screen === "create" && s.open ? { open: false } : s.screen !== "home" ? { screen: "home" } : null)
)
