/**
 * Choosing the station on entering the training, with no DOM: whether the station list opens
 * first, which station continues and which takes the focus, and the list's markup then.
 */
import { expect, test } from "bun:test"
import { STRINGS } from "../client/i18n.ts"
import { FRESH_TRAINING } from "../client/settings.ts"
import { entryChoice, listOnEntry, stationButtonId, stationEntries, stationListHtml } from "../client/training-menu.ts"
import type { TrainingView } from "../shared/sim/view.ts"
import { STATION_IDS } from "../shared/training/index.ts"

const ALL = STATION_IDS.length
/** The view on entering with stations 1-4 completed: at station 5, five unlocked. */
const AT_FIVE: TrainingView = { tag: "station", station: STATION_IDS[4], step: null, count: 0, target: 0, unlocked: 5, completed: false }
/** The view on entering a training completed once: at station 1, all unlocked. */
const COMPLETED: TrainingView = { tag: "station", station: STATION_IDS[0], step: null, count: 0, target: 0, unlocked: ALL, completed: true }

test("with no progress the training starts at once; with a station completed the list opens first", () => {
  expect(listOnEntry(FRESH_TRAINING)).toBe(false)
  expect(listOnEntry({ done: 1 })).toBe(true)
  expect(listOnEntry({ done: ALL })).toBe(true)
})

test("with progress, the first station not completed continues and takes the focus", () => {
  expect(entryChoice(AT_FIVE)).toEqual({ continues: STATION_IDS[4], focus: STATION_IDS[4] })
})

test("a training completed once has nothing to continue: the first station takes the focus", () => {
  expect(entryChoice(COMPLETED)).toEqual({ continues: null, focus: STATION_IDS[0] })
})

test("the list on entry: every unlocked station can be chosen, the one that continues says so, and each can take the focus by its id", () => {
  for (const [lang, s] of Object.entries(STRINGS)) {
    const html = stationListHtml(stationEntries(AT_FIVE), s, entryChoice(AT_FIVE).continues)
    for (const station of STATION_IDS.slice(0, 5)) {
      expect(html).toContain(`data-station="${station}"`)
      expect(html).toContain(`id="${stationButtonId(station)}"`)
    }
    expect(html).not.toContain(`data-station="${STATION_IDS[5]}"`)
    expect(html.split(s.training.continueHere).length - 1, lang).toBe(1)
    // Its "continue" is on station 5's button.
    const five = html.slice(html.indexOf(`id="${stationButtonId(STATION_IDS[4])}"`))
    expect(five.slice(0, five.indexOf("</button>"))).toContain(s.training.continueHere)
  }
})

test("completed once: all twelve choosable and marked done but the one the player stands at, and no continue", () => {
  const s = STRINGS.it
  const html = stationListHtml(stationEntries(COMPLETED), s, entryChoice(COMPLETED).continues)
  for (const station of STATION_IDS) expect(html).toContain(`data-station="${station}"`)
  expect(html).not.toContain("disabled")
  expect(html).not.toContain(s.training.continueHere)
  expect(stationEntries(COMPLETED).map((e) => e.state)).toEqual(["current", ...Array(ALL - 1).fill("done")])
})

test("the match menu's list during play shows no continue", () => {
  expect(stationListHtml(stationEntries(AT_FIVE), STRINGS.it)).not.toContain(STRINGS.it.training.continueHere)
})
