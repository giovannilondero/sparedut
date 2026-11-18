/**
 * Over the production build: run after `pnpm build` with `pnpm test:build` (CI does). Not a
 * `*.test.ts`, so `pnpm test` never reads `dist/`, present or stale.
 *
 * What the page needs to boot and play in Cumò is worked out here from the build itself,
 * independently of the list: what `index.html` loads, then every build file a loaded script
 * names (the host worker, the physics it loads, lazy chunks), and so on.
 */
import { expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { STRINGS } from "../client/i18n.ts"
import { readOpening } from "../client/opening.ts"
import { readPrecache } from "../scripts/service-worker.ts"

const DIST = join(import.meta.dir, "../dist")
if (!existsSync(join(DIST, "index.html"))) throw new Error("no production build in dist/: run `pnpm build` first")

const precache = readPrecache(join(DIST, "sw.js"))
const listed = new Set(precache.urls)
const fileOf = (url: string) => join(DIST, url === "/" ? "index.html" : url)

/** The paths the page loads, followed through the scripts and styles that name other build files. */
function neededToBoot(): Set<string> {
  const assets = readdirSync(join(DIST, "assets"))
  const needed = new Set<string>(["/"])
  const html = readFileSync(join(DIST, "index.html"), "utf8")
  for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) needed.add(url)
  const queue = [...needed].filter((url) => /\.(js|css)$/.test(url))
  for (let url = queue.pop(); url; url = queue.pop()) {
    const code = readFileSync(fileOf(url), "utf8")
    for (const name of assets) {
      const asset = `/assets/${name}`
      if (needed.has(asset) || !code.includes(name)) continue
      needed.add(asset)
      if (/\.(js|css)$/.test(name)) queue.push(asset)
    }
  }
  return needed
}

test("every file needed to boot and play in Cumò is in the precache list", () => {
  const needed = neededToBoot()
  // The walk above must have found the in-browser host and its physics, or it proves nothing.
  expect([...needed].some((url) => /^\/assets\/host\.worker-.*\.js$/.test(url))).toBe(true)
  expect([...needed].some((url) => /^\/assets\/rapier_wasm3d_bg-.*\.wasm$/.test(url))).toBe(true)
  expect(needed).toContain("/boot.js")
  expect(needed).toContain("/favicon.svg")
  expect([...needed].filter((url) => !listed.has(url))).toEqual([])
})

test("the installed game's manifest and every icon it names are in the precache list", () => {
  const html = readFileSync(join(DIST, "index.html"), "utf8")
  const manifest = html.match(/<link rel="manifest" href="([^"]+)"/)?.[1]
  const apple = html.match(/<link rel="apple-touch-icon" href="([^"]+)"/)?.[1]
  expect(manifest).toBeDefined()
  expect(apple).toBeDefined()
  const icons = (JSON.parse(readFileSync(fileOf(manifest!), "utf8")) as { icons: { src: string }[] }).icons.map((icon) => icon.src)
  expect(icons.length).toBeGreaterThan(0)
  expect([manifest!, apple!, ...icons].filter((url) => !listed.has(url))).toEqual([])
})

test("every listed file exists in the build", () => {
  expect(precache.urls.filter((url) => !existsSync(fileOf(url)))).toEqual([])
})

test("no Vêr model or surface is listed", () => {
  expect(readdirSync(join(DIST, "models")).length).toBeGreaterThan(0)
  expect(readdirSync(join(DIST, "tex")).length).toBeGreaterThan(0)
  expect(precache.urls.filter((url) => url.startsWith("/models/") || url.startsWith("/tex/"))).toEqual([])
})

test("the size cached at install", () => {
  const bytes = precache.urls.reduce((sum, url) => sum + statSync(fileOf(url)).size, 0)
  expect(bytes).toBe(precache.bytes)
  console.log(`precached at install: ${precache.urls.length} files, ${(bytes / 1e6).toFixed(2)} MB (build ${precache.version})`)
})

test("the built manifest offers the home screen's button as the icon's shortcut, opening the game on it, and focuses an open game", () => {
  const html = readFileSync(join(DIST, "index.html"), "utf8")
  const url = html.match(/<link rel="manifest" href="([^"]+)"/)?.[1]
  const manifest = JSON.parse(readFileSync(fileOf(url!), "utf8")) as {
    shortcuts?: { name: string; url: string; icons?: { src: string }[] }[]
    launch_handler?: unknown
  }
  expect(manifest.shortcuts?.map((shortcut) => shortcut.name)).toEqual([STRINGS.fur.static.oneTap])
  const target = new URL(manifest.shortcuts![0]!.url, "https://sparedut.example")
  expect(readOpening(target.search, target.hash)).toEqual({ kind: "shortcut" })
  for (const icon of manifest.shortcuts![0]!.icons ?? []) expect(existsSync(fileOf(icon.src))).toBe(true)
  expect(manifest.launch_handler).toEqual({ client_mode: "focus-existing" })
})
