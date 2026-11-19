/**
 * What the death screen shows, from the snapshot and the room: no DOM.
 */
import { expect, test } from "bun:test"
import { deathScreen } from "../client/hud.ts"

const dead = { alive: false }
const alive = { alive: true }

test("nobody on the map, or alive, sees no death screen", () => {
  expect(deathScreen(null, { phase: "Live", mode: "bataie" })).toEqual({ tag: "none" })
  expect(deathScreen(alive, { phase: "Live", mode: "bataie" })).toEqual({ tag: "none" })
  // In the Muster nobody is on the map: nobody is dead either.
  expect(deathScreen(dead, { phase: "Muster", mode: "bataie" })).toEqual({ tag: "none" })
})

test("in a match the death screen does not offer to change the primary: it is fixed until the Muster", () => {
  for (const mode of ["bataie", "frico", "tampieste"] as const) {
    const screen = deathScreen(dead, { phase: "Live", mode })
    expect(screen.tag).toBe("dead")
    expect(screen.tag === "dead" && screen.armoury).toBe(false)
  }
})

test("in a training, where the armoury opens, the death screen still names its key", () => {
  expect(deathScreen(dead, { phase: "Live", mode: "dutrine" })).toEqual({ tag: "dead", armoury: true })
})
