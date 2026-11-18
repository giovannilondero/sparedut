import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const html = readFileSync(join(import.meta.dir, "../client/index.html"), "utf8")

test("every id in the page names one element, so a lookup by id finds the one meant", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i)
  expect(ids.length).toBeGreaterThan(50)
  expect(twice).toEqual([])
})
