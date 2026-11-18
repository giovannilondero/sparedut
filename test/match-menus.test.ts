import { expect, test } from "bun:test"
import { afterEscape, endFocus, focusOnOpen } from "../client/match-menus.ts"

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

test("the end screen starts on another round for the host, on leaving for everyone else", () => {
  expect(endFocus(true)).toBe("e-again")
  expect(endFocus(false)).toBe("e-leave")
})
