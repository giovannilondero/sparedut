import { expect, test } from "bun:test"
import { inviteLink, readInvite } from "../client/invite.ts"

const BASE = "https://sparedut.example/"

test("an open room's invite link carries only the code", () => {
  expect(inviteLink(BASE, "ABCD", null)).toBe("https://sparedut.example/?p=ABCD")
})

test("a password room's invite link carries the password in the fragment, never in the page request", () => {
  const link = new URL(inviteLink(BASE, "ABCD", "Cjavedal 7q+&#ç"))
  expect(link.search).toBe("?p=ABCD")
  expect(link.hash).not.toBe("")
  expect(link.href.split("#")[0]).not.toContain("Cjavedal")
  expect(readInvite(link.search, link.hash)).toEqual({ code: "ABCD", password: "Cjavedal 7q+&#ç" })
})

test("an address without a code is not an invite, and a code alone has no password", () => {
  expect(readInvite("", "#pw=x")).toBeNull()
  expect(readInvite("?p=abcd", "")).toEqual({ code: "ABCD", password: null })
})
