/**
 * What the death screen shows, from the snapshot and the room: no DOM.
 */
import { expect, test } from "bun:test"
import { deathScreen } from "../client/hud.ts"

const dead = { alive: false }
const alive = { alive: true }
/** Somebody who has been on the map, alive, in this match. */
const played = true

test("nobody on the map, or alive, sees no death screen", () => {
  expect(deathScreen(null, { phase: "Live", mode: "bataie", played })).toEqual({ tag: "none" })
  expect(deathScreen(alive, { phase: "Live", mode: "bataie", played })).toEqual({ tag: "none" })
  // In the Muster nobody is on the map: nobody is dead either.
  expect(deathScreen(dead, { phase: "Muster", mode: "bataie", played })).toEqual({ tag: "none" })
})

test("in a match the death screen does not offer to change the primary: it is fixed until the Muster", () => {
  for (const mode of ["bataie", "frico", "tampieste"] as const) {
    const screen = deathScreen(dead, { phase: "Live", mode, played })
    expect(screen.tag).toBe("dead")
    expect(screen.tag === "dead" && screen.armoury).toBe(false)
  }
})

test("in a training, where the armoury opens, the death screen still names its key", () => {
  expect(deathScreen(dead, { phase: "Live", mode: "dutrine", played })).toEqual({ tag: "dead", armoury: true, spectate: false })
})

test("in a live Tampieste the dead watch until the end; elsewhere they are told when they come back", () => {
  expect(deathScreen(dead, { phase: "Live", mode: "tampieste", played })).toEqual({ tag: "dead", armoury: false, spectate: true })
  expect(deathScreen(dead, { phase: "Live", mode: "bataie", played })).toEqual({ tag: "dead", armoury: false, spectate: false })
})

test("somebody who entered a Tampieste after its start has not played: no death screen, they are told they play from the next match", () => {
  expect(deathScreen(dead, { phase: "Live", mode: "tampieste", played: false })).toEqual({ tag: "nextMatch" })
})

test("somebody who has not played yet sees no death screen while they wait to come on, nor over the results", () => {
  // Entered a live match: on the map within moments.
  expect(deathScreen(dead, { phase: "Live", mode: "bataie", played: false })).toEqual({ tag: "none" })
  // Entered while the results show: the next match is theirs.
  expect(deathScreen(dead, { phase: "Over", mode: "bataie", played: false })).toEqual({ tag: "none" })
  expect(deathScreen(dead, { phase: "Over", mode: "tampieste", played: false })).toEqual({ tag: "none" })
})
