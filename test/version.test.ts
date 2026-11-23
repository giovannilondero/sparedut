/**
 * The game's version: `version` in `package.json`, stamped with the commit into the client's
 * and the Worker's builds (`scripts/game-version.ts`), shown on the menu's home screen.
 */
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { buildDefines, currentBuild, packageVersion } from "../scripts/game-version.ts"
import { GAME_BUILD, versionLabel } from "../shared/version.ts"

test("the menu shows the version and the commit, or `dev` where nothing was stamped", () => {
  expect(versionLabel({ version: "0.1.0", commit: "f25736c" })).toBe("v0.1.0 · f25736c")
  expect(versionLabel(null)).toBe("dev")
})

test("outside a build nothing is stamped: the dev server and the Bun server are `dev`", () => {
  expect(GAME_BUILD).toBeNull()
})

test("the version is package.json's own, SemVer", () => {
  expect(packageVersion()).toBe((JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version)
  expect(packageVersion('{"version":"0.12.3"}')).toBe("0.12.3")
  expect(packageVersion('{"version":"1.0.0-rc.1"}')).toBe("1.0.0-rc.1")
  expect(() => packageVersion("{}")).toThrow()
  expect(() => packageVersion('{"version":"0.1"}')).toThrow()
  expect(() => packageVersion('{"version":"v0.1.0"}')).toThrow()
})

test("a build is stamped with the version and a short commit, as string literals", () => {
  const build = currentBuild()
  expect(build.version).toBe(packageVersion())
  expect(build.commit).toMatch(/^([0-9a-f]{7,}|unknown)$/)
  expect(buildDefines({ version: "0.1.0", commit: "f25736c" })).toEqual({ __SPAREDUT_VERSION__: '"0.1.0"', __SPAREDUT_COMMIT__: '"f25736c"' })
})

test("the version is on the menu's home screen only, so never over a match", () => {
  const html = readFileSync(new URL("../client/index.html", import.meta.url), "utf8")
  const home = html.slice(html.indexOf('<div id="menu-home"'), html.indexOf("<!-- A password room's prompt"))
  expect(home).toContain('id="home-version"')
  expect(html.slice(html.indexOf("<!-- ===================== HUD"))).not.toContain("home-version")
})
