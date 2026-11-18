/**
 * The training's stations and steps are data the client bundles too (prompts, gates, which device
 * has which control). They must not bring the simulation with them: its schema and systems, and
 * the ECS under them, belong to the host only.
 */
import { expect, test } from "bun:test"

test("the stations and steps reach neither the simulation's schema nor its systems at run time", async () => {
  const seen = new Set<string>()
  const reached: string[] = []
  const visit = async (url: URL, from: string) => {
    const here = url.pathname.split("/shared/")[1] ?? url.pathname
    if (/^sim\/(schema|schedule|index|view)\.ts$|^sim\/systems\//.test(here)) reached.push(`${from} → ${here}`)
    if (seen.has(url.href)) return
    seen.add(url.href)
    const source = await Bun.file(url).text()
    // `import type` is erased; anything else is in the bundle.
    for (const [, path] of source.matchAll(/^(?:import|export)\s+(?!type\b)[^"]*?from\s+"([^"]+)"/gm)) {
      if (path.startsWith(".")) await visit(new URL(path, url), here)
    }
  }
  const dir = new URL("../shared/training/", import.meta.url)
  for (const file of new Bun.Glob("*.ts").scanSync(dir.pathname)) await visit(new URL(file, dir), "test")
  expect(reached).toEqual([])
  expect([...seen].some((u) => u.endsWith("/shared/training/stations/always.ts"))).toBe(true)
})
