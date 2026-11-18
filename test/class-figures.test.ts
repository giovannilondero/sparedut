/**
 * What the armoury shows of each primary's class, in both languages, with no browser.
 */
import { expect, test } from "bun:test"
import { classFigures } from "../client/menu-model.ts"
import { STRINGS } from "../client/i18n.ts"
import { CLASSES, PRIMARIES } from "../shared/weapons.ts"

test("the armoury card of each primary shows its class's health and speed", () => {
  for (const primary of PRIMARIES) {
    const { hp, speed } = CLASSES[primary]
    expect(classFigures(STRINGS.it, primary)).toEqual([["Salute", `${hp}`], ["Velocità", `${Math.round(speed * 100)}%`]])
    expect(classFigures(STRINGS.fur, primary)).toEqual([["Salût", `${hp}`], ["Velocitât", `${Math.round(speed * 100)}%`]])
  }
})
