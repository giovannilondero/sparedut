/**
 * The scoreboard's markup, from the board rows: no DOM.
 */
import { expect, test } from "bun:test"
import { boardHtml } from "../client/hud.ts"
import { t } from "../client/i18n.ts"
import type { BoardRow } from "../shared/protocol.ts"

const row = (over: Partial<BoardRow>): BoardRow => ({ id: "a", name: "Toni", team: "benandanti", bot: false, primary: "cramar", kills: 0, deaths: 0, assists: 0, caps: 0, score: 0, best: 0, headshots: 0, damage: 0, ping: 20, ...over })

test("each player's primary is on the board by its full name, and by its short one for a narrow screen", () => {
  const html = boardHtml([row({ primary: "doplete" }), row({ id: "b", name: "Bepi", team: "malandanti", bot: true, primary: "gjalinis" })], "a")
  for (const id of ["doplete", "gjalinis"] as const) {
    expect(html).toContain(`<span class="long">${t().weapons[id].name}</span>`)
    expect(html).toContain(`<span class="short">${t().weapons[id].short}</span>`)
  }
})
