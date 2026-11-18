import { expect, test } from "bun:test"
import { afterEscape, endFocus, focusOnOpen, menuPrimary, musterCountdown, musterFocus, musterScreen, musterTeams, startsAtOnce } from "../client/match-menus.ts"

test("Esc closes the in-match menus one step at a time", () => {
  expect(afterEscape("pause", "none")).toBe("none")
  expect(afterEscape("settings", "none")).toBe("pause")
  // The loadout goes back where it was opened from: the match menu, or straight to the match.
  expect(afterEscape("loadout", "pause")).toBe("pause")
  expect(afterEscape("loadout", "none")).toBe("none")
  expect(afterEscape("none", "none")).toBe("none")
})

test("opening the match menu puts focus on resume; coming back from a menu puts it on that menu's button", () => {
  expect(focusOnOpen("pause", "none")).toBe("p-resume")
  expect(focusOnOpen("pause", "settings")).toBe("p-settings")
  expect(focusOnOpen("pause", "loadout")).toBe("p-loadout")
  // Reopened while already open (a roster change): resume, as a fresh open.
  expect(focusOnOpen("pause", "pause")).toBe("p-resume")
})

test("the loadout and the settings start on their first control", () => {
  expect(focusOnOpen("loadout", "pause")).toBeNull()
  expect(focusOnOpen("settings", "pause")).toBeNull()
})

test("the end screen starts on another match for the host, on leaving for everyone else", () => {
  expect(endFocus(true)).toBe("e-again")
  expect(endFocus(false)).toBe("e-leave")
})

const room = (over: Partial<Parameters<typeof musterTeams>[0]> = {}): Parameters<typeof musterTeams>[0] => ({
  hostId: "p1",
  roster: [
    { id: "p1", name: "Toni", team: "benandanti", primary: "mulin", ready: false, bot: false, away: false, onMap: true },
    { id: "bot-1", name: "Bepi", team: "malandanti", primary: "cramar", ready: true, bot: true, away: false, onMap: true },
    { id: "p2", name: "Mariute", team: "malandanti", primary: "miedi", ready: false, bot: false, away: false, onMap: true }
  ],
  ...over
})

test("the Muster shows both teams, each member with their primary, from the room's roster", () => {
  expect(musterTeams(room())).toEqual({
    benandanti: [{ id: "p1", name: "Toni", primary: "mulin", ready: false, bot: false, host: true }],
    malandanti: [
      { id: "bot-1", name: "Bepi", primary: "cramar", ready: true, bot: true, host: false },
      { id: "p2", name: "Mariute", primary: "miedi", ready: false, bot: false, host: false }
    ]
  })
})

test("a change of team or primary in the roster shows in the Muster", () => {
  const moved = room({ roster: room().roster.map((r) => (r.id === "p2" ? { ...r, team: "benandanti", primary: "doplete" } : r)) })
  expect(musterTeams(moved).benandanti.map((m) => [m.name, m.primary])).toEqual([["Toni", "mulin"], ["Mariute", "doplete"]])
})

test("an Offline room's Muster opens with start focused: one press begins the match", () => {
  expect(musterFocus({ host: true, reach: "offline" })).toBe("m-start")
})

test("in a LAN or Online room the Muster opens on its first control, for the host too, so a stray press does not start", () => {
  expect(musterFocus({ host: true, reach: "lan" })).toBeNull()
  expect(musterFocus({ host: true, reach: "online" })).toBeNull()
  expect(musterFocus({ host: false, reach: "online" })).toBeNull()
})

const waiting = (mode: "bataie" | "tampieste" = "bataie") => ({
  ...room({ roster: room().roster.map((r) => (r.id === "p2" ? { ...r, onMap: false } : r)) }),
  mode
})

test("in the Muster everybody sees the Muster screen", () => {
  expect(musterScreen({ ...room(), mode: "bataie" }, "p1", "Muster")).toEqual({ tag: "muster" })
  expect(musterScreen(waiting(), "p2", "Muster")).toEqual({ tag: "muster" })
})

test("a member who joined a match already on sees the Muster screen with confirm until they enter; the others see the match", () => {
  expect(musterScreen(waiting(), "p2", "Live")).toEqual({ tag: "joining", nextMatch: false })
  expect(musterScreen(waiting(), "p1", "Live")).toEqual({ tag: "closed" })
  // Entered: the roster puts them on the map, and the screen closes.
  expect(musterScreen({ ...room(), mode: "bataie" }, "p2", "Live")).toEqual({ tag: "closed" })
})

test("joining a Tampieste already on, the screen says they play from the next match", () => {
  expect(musterScreen(waiting("tampieste"), "p2", "Live")).toEqual({ tag: "joining", nextMatch: true })
})

test("during the results the end screen shows, for a member who has not entered too", () => {
  expect(musterScreen(waiting(), "p2", "Over")).toEqual({ tag: "closed" })
})

test("a member's ready mark in the roster shows in the Muster, and so does taking it back", () => {
  const ready = room({ roster: room().roster.map((r) => (r.id === "p2" ? { ...r, ready: true } : r)) })
  expect(musterTeams(ready).malandanti.find((m) => m.id === "p2")?.ready).toBe(true)
  expect(musterTeams(room()).malandanti.find((m) => m.id === "p2")?.ready).toBe(false)
})

test("the Muster's countdown in whole seconds left, and none while no countdown runs", () => {
  expect(musterCountdown({ tag: "Muster", starts: null }, 100)).toBeNull()
  expect(musterCountdown({ tag: "Muster", starts: 700 }, 100)).toBe(10)
  // A second just begun still shows: 9.5 s left read as 10, never 0 before the start.
  expect(musterCountdown({ tag: "Muster", starts: 700 }, 130)).toBe(10)
  expect(musterCountdown({ tag: "Muster", starts: 700 }, 699)).toBe(1)
  expect(musterCountdown({ tag: "Live", ends: 9000 }, 100)).toBeNull()
})

test("the host's start goes live at once when every other human member is ready, bots counting as ready", () => {
  expect(startsAtOnce(room(), "p1")).toBe(false)
  const ready = room({ roster: room().roster.map((r) => (r.id === "p2" ? { ...r, ready: true } : r)) })
  expect(startsAtOnce(ready, "p1")).toBe(true)
  // Alone with the bots, as in an Offline room: always at once.
  expect(startsAtOnce(room({ roster: room().roster.filter((r) => r.id !== "p2") }), "p1")).toBe(true)
})

test("the match menu offers the armoury only in a training; in a match it shows the primary, fixed until the Muster", () => {
  expect(menuPrimary({ ...room(), mode: "bataie" }, "p1")).toEqual({ tag: "fixed", primary: "mulin" })
  expect(menuPrimary({ ...room(), mode: "tampieste" }, "p2")).toEqual({ tag: "fixed", primary: "miedi" })
  expect(menuPrimary({ ...room(), mode: "dutrine" }, "p1")).toEqual({ tag: "armoury" })
  // Somebody not in the roster gets nothing, never the armoury.
  expect(menuPrimary({ ...room(), mode: "bataie" }, "p9")).toEqual({ tag: "none" })
})
