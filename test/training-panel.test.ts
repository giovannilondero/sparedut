/**
 * The training's panel with no DOM: beside the station, its steps as small marks, so the player sees
 * which one they are on and how many are left.
 */
import { expect, test } from "bun:test"
import { STRINGS } from "../client/i18n.ts"
import { announcesStep, NOT_SHOWN, stepMarks, stepMarksHtml } from "../client/training-panel.ts"

test("the steps before the current one are done, the current one is marked, the rest are to do", () => {
  expect(stepMarks({ tag: "station", station: "always", step: "aimedHit", count: 0, target: 1, unlocked: 3 })).toEqual(["done", "current", "todo", "todo", "todo"])
  expect(stepMarks({ tag: "station", station: "always", step: "doorDown", count: 0, target: 1, unlocked: 3 })).toEqual(["done", "done", "done", "done", "current"])
})

test("a station of one step shows one mark; a completed training shows none", () => {
  expect(stepMarks({ tag: "station", station: "armoury", step: "choosePrimary", count: 0, target: 1, unlocked: 6 })).toEqual(["current"])
  expect(stepMarks({ tag: "complete" })).toEqual([])
})

test("the marks say which step out of how many, in each language", () => {
  const view = { tag: "station", station: "always", step: "aimedHit", count: 0, target: 1, unlocked: 3 } as const
  expect(stepMarksHtml(view, STRINGS.it)).toContain('aria-label="Passo 2 di 5"')
  expect(stepMarksHtml(view, STRINGS.fur)).toContain('aria-label="Pas 2 di 5"')
  expect(stepMarksHtml(view, STRINGS.it).match(/class="step-mark is-/g)).toHaveLength(5)
  expect(stepMarksHtml({ tag: "complete" }, STRINGS.it)).toBe("")
})

test("a step the panel was not showing calls for attention: the first one, the next one, the same one in another station", () => {
  expect(announcesStep(NOT_SHOWN, { station: "look", step: "lookAround" })).toBe(true)
  expect(announcesStep({ station: "look", step: "lookAround" }, { station: "look", step: "walkTo" })).toBe(true)
  expect(announcesStep({ station: "look", step: "walkTo" }, { station: "course", step: "walkTo" })).toBe(true)
})

test("the step already shown does not call again, nor does a station with no step to do yet", () => {
  expect(announcesStep({ station: "look", step: "lookAround" }, { station: "look", step: "lookAround" })).toBe(false)
  expect(announcesStep({ station: "look", step: "walkTo" }, { station: "course", step: null })).toBe(false)
  expect(announcesStep({ station: "course", step: null }, NOT_SHOWN)).toBe(false)
})
