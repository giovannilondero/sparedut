import { expect, test } from "bun:test"
import { lookAddress } from "../client/looks.ts"

test("choosing a look reloads the same address with the look in it", () => {
  expect(lookAddress("https://sparedut.example/", "ver")).toBe("https://sparedut.example/?look=ver")
})

test("choosing a look keeps what the address already carries and replaces the previous look", () => {
  const next = new URL(lookAddress("https://sparedut.example/?p=ABCD&look=ver#pw=x", "cumo"))
  expect(next.searchParams.get("look")).toBe("cumo")
  expect(next.searchParams.get("p")).toBe("ABCD")
  expect(next.hash).toBe("#pw=x")
})
