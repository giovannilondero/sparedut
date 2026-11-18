/**
 * Muster prototype B, the field (ticket #77): the two teams stand on the flanks, Benandants left and
 * Malandants right, with the player's own choice between them. Changing side is a button under the
 * other flank. The chosen primary is shown big, the others as small tiles under it. On an upright
 * phone the flanks sit side by side at the top, the choice under them.
 */
import { actions, chat, chosen, hostTools, leaveButton, liveBar, picker, roomCode, roomLine, run, teamList, title, type State } from "./kit.ts"
import { t } from "../../i18n.ts"

const draw = (s: State) => {
  const join = s.screen === "join"
  return `<div class="b-field">
    <header class="b-head">
      <div class="b-title"><div><h1 class="mu-title">${title(s)}</h1><div class="mu-line">${roomLine()}</div></div>${leaveButton("b-leave")}</div>
      ${join ? liveBar() : roomCode()}
    </header>
    <div class="b-flank b-ben">${teamList(s, "benandanti", { switchable: true, compact: true })}</div>
    <main class="b-mid">
      ${chosen(s)}
      ${picker(s, "tiles")}
      <div class="b-mid-foot">${actions(s)}</div>
    </main>
    <div class="b-flank b-mal">${teamList(s, "malandanti", { switchable: true, compact: true })}</div>
    <aside class="b-side">
      ${join ? "" : hostTools(s)}
      <div class="b-chat"><h3 class="mu-h">${t().muster.chat}</h3>${chat()}</div>
    </aside>
  </div>`
}

run(document.getElementById("app")!, draw)
