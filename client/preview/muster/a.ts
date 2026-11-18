/**
 * Muster prototype A, the sheet (ticket #77): the game's match dialog grown into the Muster. One
 * column read top to bottom (room, teams, your choice, host, chat), the actions pinned under it.
 * On a wide, short screen the column splits in two: who is there on the left, your choice on the right.
 */
import { actions, chat, hostTools, liveBar, picker, roomCode, roomLine, run, teamChoice, teamList, title, type State } from "./kit.ts"
import { t } from "../../i18n.ts"

const draw = (s: State) => {
  const join = s.screen === "join"
  return `<section class="a-sheet overlay-like">
    <header class="a-head"><h1 class="mu-title">${title(s)}</h1><div class="mu-line">${roomLine()}</div></header>
    <div class="a-body">
      <div class="a-who">
        ${join ? liveBar() : roomCode()}
        <div class="a-roster">${teamList(s, "benandanti")}${teamList(s, "malandanti")}</div>
        ${join ? "" : hostTools(s)}
        <h3 class="mu-h">${t().muster.chat}</h3>${chat()}
      </div>
      <div class="a-mine">
        ${teamChoice(s)}
        <h3 class="mu-h">${t().muster.primary}</h3>${picker(s, "rows")}
      </div>
    </div>
    <footer class="a-foot">${actions(s)}</footer>
  </section>`
}

run(document.getElementById("app")!, draw)
