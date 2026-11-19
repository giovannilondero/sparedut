import { expect, test } from "bun:test"
import { afterEscape, botButtons, botMessage, endFocus, focusOnOpen, menuPrimary, musterCountdown, musterFocus, musterScreen, nextFocus, primaryPicker, singleOf, singleValue, startsAtOnce } from "../client/match-menus.ts"
import type { RoomInfo } from "../shared/protocol.ts"

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

const room = (over: Partial<Pick<RoomInfo, "hostId" | "roster">> = {}): Pick<RoomInfo, "hostId" | "roster"> => ({
  hostId: "p1",
  roster: [
    { id: "p1", name: "Toni", team: "benandanti", primary: "mulin", ready: false, bot: false, away: false, place: "inMatch" },
    { id: "bot-1", name: "Bepi", team: "malandanti", primary: "cramar", ready: true, bot: true, away: false, place: "inMatch" },
    { id: "p2", name: "Mariute", team: "malandanti", primary: "miedi", ready: false, bot: false, away: false, place: "inMatch" }
  ],
  ...over
})

test("an Offline room's Muster opens with start focused: one press begins the match", () => {
  expect(musterFocus({ host: true, reach: "offline" })).toBe("m-start")
})

test("in a LAN or Online room the Muster opens on its first control, for the host too, so a stray press does not start", () => {
  expect(musterFocus({ host: true, reach: "lan" })).toBeNull()
  expect(musterFocus({ host: true, reach: "online" })).toBeNull()
  expect(musterFocus({ host: false, reach: "online" })).toBeNull()
})

test("the host's single-weapon control in the Muster goes from the room's setting to its value and back", () => {
  expect(singleOf(singleValue(null))).toBeNull()
  expect(singleValue("cjampanili")).toBe("cjampanili")
  expect(singleOf(singleValue("mulin"))).toBe("mulin")
  // Anything that is not a primary is off: never a weapon every class carries.
  expect(singleOf("mescul")).toBeNull()
})

test("the Muster's primary picker is free on the player's own primary, and locked on the host's choice under single weapon", () => {
  expect(primaryPicker({ single: null }, "mulin")).toEqual({ _tag: "free", chosen: "mulin" })
  expect(primaryPicker({ single: "cjampanili" }, "mulin")).toEqual({ _tag: "locked", chosen: "cjampanili" })
})

const waiting = (mode: "bataie" | "tampieste" = "bataie") => ({
  ...room({ roster: room().roster.map((r) => (r.id === "p2" ? { ...r, place: "waiting" } : r)) }),
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

// A field of controls: start and ready side by side under three tiles in a row.
const box = (x: number, y: number, w = 100, h = 40) => ({ x, y, width: w, height: h })
const field = [box(0, 0), box(110, 0), box(220, 0), box(0, 60, 200), box(210, 60)]

test("the pad's d-pad moves focus to the nearest control in its direction", () => {
  expect(nextFocus(field[0], field, "right")).toBe(1)
  expect(nextFocus(field[1], field, "left")).toBe(0)
  // Down from the middle tile: the control under it, not the one nearest by distance alone.
  expect(nextFocus(field[2], field, "down")).toBe(4)
  expect(nextFocus(field[3], field, "up")).toBe(0)
})

test("at the edge of the screen the d-pad leaves focus where it is", () => {
  expect(nextFocus(field[2], field, "right")).toBe(-1)
  expect(nextFocus(field[0], field, "up")).toBe(-1)
})

test("the host's bot buttons: a + and a − for each team, and in a mode with no teams one of each, naming no team", () => {
  expect(botButtons({ mode: "bataie" })).toEqual([
    { delta: 1, team: "benandanti" },
    { delta: -1, team: "benandanti" },
    { delta: 1, team: "malandanti" },
    { delta: -1, team: "malandanti" }
  ])
  expect(botButtons({ mode: "tampieste" })).toEqual([
    { delta: 1, team: null },
    { delta: -1, team: null }
  ])
})

test("a bot button sends its team; one naming no team adds a bot to the side with fewer members and removes the last bot added", () => {
  expect(botMessage(room(), { delta: 1, team: "malandanti" })).toEqual({ t: "bot", team: "malandanti", delta: 1 })
  // One Benandant against two Malandants, the bot among them.
  expect(botMessage(room(), { delta: 1, team: null })).toEqual({ t: "bot", team: "benandanti", delta: 1 })
  expect(botMessage(room(), { delta: -1, team: null })).toEqual({ t: "bot", team: "malandanti", delta: -1 })
  const more = room({ roster: [...room().roster, { id: "bot-2", name: "Nart", team: "benandanti", primary: "cramar", ready: true, bot: true, away: false, place: "inMatch" }] })
  expect(botMessage(more, { delta: -1, team: null })).toEqual({ t: "bot", team: "benandanti", delta: -1 })
})
