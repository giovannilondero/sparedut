/**
 * The training's match menu with no DOM: the station list, as the player sees it in each state of
 * the training, and its markup.
 */
import { expect, test } from "bun:test"
import { STRINGS } from "../client/i18n.ts"
import { stationEntries, stationListHtml } from "../client/training-menu.ts"
import { STATION_IDS } from "../shared/training/index.ts"

const states = (entries: ReturnType<typeof stationEntries>) => entries.map((e) => e.state)

test("on a first run: the stations before are completed, the current one is marked, the rest locked", () => {
  const entries = stationEntries({ tag: "station", station: "always", step: null, count: 0, target: 0, unlocked: 3 })
  expect(entries.map((e) => [e.station, e.n])).toEqual(STATION_IDS.map((s, i) => [s, i + 1]))
  expect(states(entries)).toEqual(["done", "done", "current", ...Array(STATION_IDS.length - 3).fill("locked")])
})

test("back at an earlier station: the furthest one reached is open, not completed", () => {
  const entries = stationEntries({ tag: "station", station: "look", step: "lookAround", count: 0, target: 1, unlocked: 4 })
  expect(states(entries).slice(0, 5)).toEqual(["current", "done", "done", "open", "locked"])
})

test("a completed training: every station completed and choosable, none current", () => {
  expect(new Set(states(stationEntries({ tag: "complete" })))).toEqual(new Set(["done"]))
})

test("only the stations that can be chosen are buttons that act; locked ones are disabled", () => {
  const html = stationListHtml(stationEntries({ tag: "station", station: "course", step: null, count: 0, target: 0, unlocked: 2 }), STRINGS.it)
  expect(html).toContain('data-station="look"')
  expect(html).toContain('data-station="course"')
  expect(html).not.toContain('data-station="always"')
  expect(html.match(/disabled/g)?.length).toBe(STATION_IDS.length - 2)
  expect(html).toContain("Sei qui")
})
