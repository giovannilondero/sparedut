/**
 * Prototype A, stepwise: a home screen of few big choices, the room list one level down,
 * and creation as a sequence of steps (mode, map, options, summary).
 */
import { MODE_IDS } from "../../../shared/folklore.ts"
import { MAP_IDS } from "../../../shared/maps/index.ts"
import { t } from "../../i18n.ts"
import {
  accessBlock, botsSelect, brand, codeJoin, ffCheck, langSwitch, levelCards, lookSwitch, mapCard, minutesSelect, missing, modeCard, nameField,
  oneTapButton, optionsLine, reachCards, roomList, roomsOf, run, tools, trainingEntry, type State
} from "./kit.ts"

const STEPS = 4

function home(s: State) {
  const st = t().static
  const find = t().menu.findRoom
  const count = roomsOf(s).length
  return `<div class="a-home">
    <div class="a-top">${langSwitch(s)}${lookSwitch(s)}</div>
    ${brand("a-brand")}
    ${nameField("a-name")}
    <div class="a-choices">
      ${oneTapButton(s)}
      <button class="big" data-set="screen=create&step=1"><span>${st.create}</span><small>${st.createSub}</small></button>
      <button class="big" data-set="screen=rooms"><span>${find.name} <i class="count">${count}</i></span><small>${find.sub}</small></button>
      ${trainingEntry()}
    </div>
    ${tools("tools a-tools")}
  </div>`
}

function rooms(s: State) {
  return `<div class="a-screen a-rooms">
    <header class="a-head"><button class="back" data-set="screen=home">${t().static.back}</button><h2>${t().menu.findRoom.name}</h2>${langSwitch(s, true)}</header>
    <div class="a-rooms-body">
      ${codeJoin("a-code stone")}
      <section class="a-list stone"><h3>${t().static.roomsTitle}</h3>${roomList(s, "screen=create&step=1")}</section>
    </div>
  </div>`
}

function stepBody(s: State) {
  const st = t().static
  const m = t().menu
  switch (s.step) {
    case 1:
      return `<div class="cards a-modes" role="radiogroup" aria-label="${m.steps.mode}">${MODE_IDS.map((id) => modeCard(s, id)).join("")}</div>`
    case 2:
      return `<div class="cards a-maps" role="radiogroup" aria-label="${st.mapLabel}">${MAP_IDS.map((id) => mapCard(s, id)).join("")}</div>`
    case 3:
      return `<div class="a-opts">
        <div class="field a-wide"><span>${st.reachLabel}</span>${reachCards(s)}</div>
        <div class="a-wide a-access">${accessBlock(s)}</div>
        ${minutesSelect()}${botsSelect()}
        <div class="field a-wide"><span>${st.levelLabel}</span>${levelCards(s)}</div>
        <div class="a-wide">${ffCheck()}</div>
      </div>`
    default: {
      const row = (label: string, value: string, step: number) =>
        `<div class="a-sum-row"><dt>${label}</dt><dd>${value}</dd><button data-set="step=${step}">${m.change}</button></div>`
      return `<dl class="a-sum stone">
        ${row(m.steps.mode, `<b>${t().modes[s.mode].name}</b><small>${t().modes[s.mode].sub}</small>`, 1)}
        ${row(st.mapLabel, `<b>${t().maps[s.map].name}</b><small>${t().maps[s.map].sub}</small>`, 2)}
        ${row(m.steps.options, `<b>${optionsLine(s)}</b>${s.reach === "offline" ? "" : `<small>${m.reachSub[s.reach]}</small>`}`, 3)}
      </dl>`
    }
  }
}

function create(s: State) {
  const st = t().static
  const m = t().menu
  const labels = [m.steps.mode, st.mapLabel, m.steps.options, m.steps.summary]
  const steps = labels
    .map((label, i) => {
      const n = i + 1
      const cls = n === s.step ? "now" : n < s.step ? "done" : ""
      return `<li class="${cls}"><button data-set="step=${n}"${n > s.step ? " disabled" : ""}${n === s.step ? ` aria-current="step"` : ""}><i>${n}</i><span>${label}</span></button></li>`
    })
    .join("")
  const prev = s.step > 1 ? `step=${s.step - 1}` : "screen=home"
  const why = s.step === STEPS ? missing(s) : ""
  const next =
    s.step < STEPS
      ? `<button class="primary" data-set="step=${s.step + 1}">${m.next} →</button>`
      : `<button class="primary a-go">${st.createGo}</button>`
  return `<div class="a-screen a-create">
    <header class="a-head"><button class="back" data-set="screen=home&step=1">${st.back}</button><h2>${st.create}</h2>${langSwitch(s, true)}</header>
    <ol class="a-steps">${steps}</ol>
    <section class="a-body" aria-label="${labels[s.step - 1]}">${stepBody(s)}</section>
    <footer class="a-foot"><p class="form-msg" role="alert">${why}</p><button data-set="${prev}">← ${s.step > 1 ? labels[s.step - 2] : st.back}</button>${next}</footer>
  </div>`
}

run(
  document.getElementById("app")!,
  (s) => (s.screen === "create" ? create(s) : s.screen === "rooms" ? rooms(s) : home(s)),
  (s) => (s.screen === "create" && s.step > 1 ? { step: s.step - 1 } : s.screen !== "home" ? { screen: "home", step: 1 } : null)
)
