import { expect, test } from "bun:test"
import { holdsScreenAwake } from "../client/screen-wake.ts"

test("during a match, with no menu open and the page visible, the screen is held awake", () => {
  expect(holdsScreenAwake({ inMatch: true, inMatchMenu: false, visible: true })).toBe(true)
})

test("in the main menu the screen may sleep, visible or not", () => {
  expect(holdsScreenAwake({ inMatch: false, inMatchMenu: false, visible: true })).toBe(false)
  expect(holdsScreenAwake({ inMatch: false, inMatchMenu: false, visible: false })).toBe(false)
})

test("paused in the match menu the screen may sleep", () => {
  expect(holdsScreenAwake({ inMatch: true, inMatchMenu: true, visible: true })).toBe(false)
})

test("with the page hidden the screen is not held, in a match or in its menu", () => {
  expect(holdsScreenAwake({ inMatch: true, inMatchMenu: false, visible: false })).toBe(false)
  expect(holdsScreenAwake({ inMatch: true, inMatchMenu: true, visible: false })).toBe(false)
})
