/**
 * When a page that comes back into view, or back to the menu, asks the server for a new version
 * (`client/offline-cache/on-return.ts`): an installed game brought to the front without a reload.
 */
import { expect, test } from "bun:test"
import { checkOnReturn } from "../client/offline-cache/on-return.ts"

const HOUR = 60 * 60 * 1000
/** A visible page in the menu whose last check was `ago` milliseconds ago. */
const back = (ago: number, at: { visible?: boolean; playing?: boolean } = {}) =>
  checkOnReturn({ visible: at.visible ?? true, playing: at.playing ?? false, now: 1_000_000_000, lastCheck: 1_000_000_000 - ago })

test("a page back after more than an hour since the last check asks for a new version", () => {
  expect(back(HOUR + 1)).toBe(true)
})

test("within an hour of the last check it does not ask again", () => {
  expect(back(HOUR - 1)).toBe(false)
  expect(back(0)).toBe(false)
})

test("never during a match, however long since the last check", () => {
  expect(back(10 * HOUR, { playing: true })).toBe(false)
})

test("not while the page is out of view: back to the menu in the background waits for the player's return", () => {
  expect(back(10 * HOUR, { visible: false })).toBe(false)
})

test("a clock set back since the last check does not hold the next check off", () => {
  expect(back(-1)).toBe(true)
})
