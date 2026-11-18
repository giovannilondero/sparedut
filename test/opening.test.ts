import { expect, test } from "bun:test"
import { STRINGS } from "../client/i18n.ts"
import { decideOpening, type OpeningAction, readOpening } from "../client/opening.ts"

const MENU = { playing: false, named: true }

/** What an `askName` action says, in Friulian and in Italian; anything else asks nothing. */
const asked = (action: OpeningAction) => (action.kind === "askName" ? [action.message(STRINGS.fur.net), action.message(STRINGS.it.net)] : [])

test("an invite's address opens the game on the invite, with or without a password", () => {
  expect(readOpening("?p=abcd", "#pw=Cjavedal")).toEqual({ kind: "invite", invite: { code: "ABCD", password: "Cjavedal" } })
  expect(readOpening("?p=abcd", "")).toEqual({ kind: "invite", invite: { code: "ABCD", password: null } })
})

test("the bare address opens the game on nothing in particular", () => {
  expect(readOpening("", "")).toEqual({ kind: "none" })
  expect(readOpening("", "#pw=x")).toEqual({ kind: "none" })
})

test("an invite opened from the menu by a named player joins its room, with its password if it has one", () => {
  expect(decideOpening(readOpening("?p=abcd", "#pw=Cjavedal"), MENU)).toEqual({ kind: "join", code: "ABCD", password: "Cjavedal" })
  expect(decideOpening(readOpening("?p=abcd", ""), MENU)).toEqual({ kind: "join", code: "ABCD", password: null })
})

test("an invite opened from the menu with no name asks for the name with the room's code, and joins nothing", () => {
  const nameless = { playing: false, named: false }
  for (const hash of ["#pw=Cjavedal", ""]) {
    const action = decideOpening(readOpening("?p=abcd", hash), nameless)
    expect(asked(action)).toEqual(["Scrîf il to non e jentre cul codiç ABCD", "Scrivi il tuo nome ed entra col codice ABCD"])
  }
})

test("an invite opened during a match does nothing, with or without a name: the match goes on", () => {
  for (const named of [true, false])
    for (const hash of ["#pw=Cjavedal", ""])
      expect(decideOpening(readOpening("?p=abcd", hash), { playing: true, named })).toEqual({ kind: "nothing" })
})

test("the bare address does nothing, in the menu or during a match, with or without a name", () => {
  for (const playing of [true, false])
    for (const named of [true, false]) expect(decideOpening(readOpening("", ""), { playing, named })).toEqual({ kind: "nothing" })
})

test("the icon's shortcut address opens the game on the shortcut", () => {
  expect(readOpening("?shortcut=bots", "")).toEqual({ kind: "shortcut" })
})

test("the shortcut used from the menu by a named player starts the home button's match", () => {
  expect(decideOpening(readOpening("?shortcut=bots", ""), MENU)).toEqual({ kind: "start" })
})

test("the shortcut used from the menu with no name asks for the name and starts nothing", () => {
  const action = decideOpening(readOpening("?shortcut=bots", ""), { playing: false, named: false })
  expect(asked(action)).toEqual(["Scrîf il to non e frache «Zuie cuintri i bot»", "Scrivi il tuo nome e tocca «Gioca contro i bot»"])
})

test("the shortcut used during a match does nothing, with or without a name: the match goes on", () => {
  for (const named of [true, false]) expect(decideOpening(readOpening("?shortcut=bots", ""), { playing: true, named })).toEqual({ kind: "nothing" })
})

test("an invite's address is an invite even with the shortcut's marker: invites behave as before", () => {
  expect(readOpening("?p=abcd&shortcut=bots", "")).toEqual({ kind: "invite", invite: { code: "ABCD", password: null } })
})

test("another value of the marker is not the shortcut", () => {
  expect(readOpening("?shortcut=x", "")).toEqual({ kind: "none" })
})
