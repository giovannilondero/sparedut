/**
 * Muster prototype C, the tabs (ticket #77): on a phone the Muster is four tabs under the thumb
 * (teams, primary, chat, room) with the actions always above them, so every panel has the whole
 * screen. On its side the tabs become a rail on the left. On a desktop the tabs go and the four
 * panels stand side by side.
 */
import { actions, chat, hostTools, leaveButton, liveBar, picker, pt, roomCode, roomLine, run, teamChoice, teamList, title, type State, type Tab } from "./kit.ts"
import { t } from "../../i18n.ts"

const label = (tab: Tab) => ({ teams: pt().teams, primary: t().muster.primary, chat: t().muster.chat, room: pt().room })[tab]
const icon: Record<Tab, string> = { teams: "⚑", primary: "⚔", chat: "✎", room: "⌂" }

const draw = (s: State) => {
  const join = s.screen === "join"
  const panel = (tab: Tab, body: string) => `<section class="c-panel c-${tab}${s.tab === tab ? " shown" : ""}" aria-label="${label(tab)}"><h2 class="c-ph">${label(tab)}</h2>${body}</section>`
  const tabs = (["teams", "primary", "chat", "room"] as const)
    .map((tab) => `<button role="tab" aria-selected="${s.tab === tab}" data-set="tab=${tab}"><i>${icon[tab]}</i><span>${label(tab)}</span></button>`)
    .join("")
  return `<div class="c-shell">
    <header class="c-head"><h1 class="mu-title">${title(s)}</h1><div class="mu-line">${roomLine()}</div>${leaveButton("c-leave")}${join ? liveBar() : ""}</header>
    <div class="c-panels">
      ${panel("teams", `${teamChoice(s)}<div class="c-roster">${teamList(s, "benandanti")}${teamList(s, "malandanti")}</div>`)}
      ${panel("primary", picker(s, "cards"))}
      ${panel("chat", chat())}
      ${panel("room", `${roomCode()}${join ? "" : hostTools(s)}`)}
    </div>
    <footer class="c-foot">${actions(s)}</footer>
    <nav class="c-tabs" role="tablist">${tabs}</nav>
  </div>`
}

run(document.getElementById("app")!, draw)
