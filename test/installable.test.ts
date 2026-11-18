import { expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { addsToHomeScreenByHand, keepStorage, runsInstalled } from "../client/installed.ts"

const PUBLIC = join(import.meta.dir, "../client/public")
const html = readFileSync(join(import.meta.dir, "../client/index.html"), "utf8")

/** The `href` of the `<link>` with this `rel` in the page, as the browser finds it. */
const linked = (rel: string) => html.match(new RegExp(`<link rel="${rel}"[^>]*href="([^"]+)"`))?.[1]

/** The width and height a PNG file declares in its header, or `null` when it is not a PNG. */
function pngSize(url: string): [number, number] | null {
  const bytes = readFileSync(join(PUBLIC, url))
  if (bytes.toString("latin1", 1, 4) !== "PNG") return null
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

interface Icon {
  src: string
  sizes: string
  type: string
  purpose?: string
}
const manifestUrl = linked("manifest")
const manifest = manifestUrl ? (JSON.parse(readFileSync(join(PUBLIC, manifestUrl), "utf8")) as Record<string, unknown>) : {}
const icons = (manifest.icons ?? []) as Icon[]

test("the page names a manifest that the build serves", () => {
  expect(manifestUrl).toBe("/manifest.webmanifest")
  expect(existsSync(join(PUBLIC, manifestUrl!))).toBe(true)
})

test("the installed game is named, opens on the game, with no browser bars and in any orientation", () => {
  expect(manifest.name).toBe("Sparedût")
  expect(manifest.short_name).toBe("Sparedût")
  expect(manifest.start_url).toBe("/")
  expect(manifest.scope).toBe("/")
  expect(manifest.id).toBe("/")
  expect(["fullscreen", "standalone"]).toContain(manifest.display as string)
  expect(manifest.orientation).toBe("any")
})

test("the installed game keeps the page's theme colour", () => {
  const theme = html.match(/<meta name="theme-color" content="([^"]+)"/)?.[1]
  expect(theme).toBe("#14110f")
  expect(manifest.theme_color).toBe(theme)
  expect(manifest.background_color).toBe(theme)
})

test("the home screens find icons of 192 and 512 pixels, and a maskable one", () => {
  const any = icons.filter((icon) => (icon.purpose ?? "any").split(" ").includes("any")).map((icon) => icon.sizes)
  expect(any).toContain("192x192")
  expect(any).toContain("512x512")
  expect(icons.some((icon) => icon.purpose?.split(" ").includes("maskable") && icon.sizes === "512x512")).toBe(true)
})

test("every icon of the manifest is a PNG of the size it declares", () => {
  expect(icons.length).toBeGreaterThan(0)
  for (const icon of icons) {
    expect(icon.type).toBe("image/png")
    const [w, h] = icon.sizes.split("x").map(Number)
    expect([icon.src, pngSize(icon.src)]).toEqual([icon.src, [w!, h!]])
  }
})

test("iOS finds its home screen icon, a 180 pixel PNG, and opens the game with no browser bars", () => {
  const apple = linked("apple-touch-icon")
  expect(apple).toBeDefined()
  expect(pngSize(apple!)).toEqual([180, 180])
  expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />')
  expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />')
})

/** A browser window: its display mode, whether the page is fullscreen through the Fullscreen API, and Safari's `navigator.standalone`. */
const window_ = (mode: "browser" | "standalone" | "fullscreen", extra: { fullscreenElement?: object; standalone?: boolean } = {}) => ({
  matchMedia: (query: string) => ({ matches: query === `(display-mode: ${mode})` }),
  fullscreenElement: extra.fullscreenElement ?? null,
  standalone: extra.standalone
})

test("the game runs installed when it opens in its own window, with or without the system bars", () => {
  expect(runsInstalled(window_("standalone"))).toBe(true)
  expect(runsInstalled(window_("fullscreen"))).toBe(true)
})

test("from the home screen of an iPhone the game runs installed", () => {
  expect(runsInstalled(window_("browser", { standalone: true }))).toBe(true)
})

test("in a browser tab, even one made fullscreen by a match, the game does not run installed", () => {
  expect(runsInstalled(window_("browser"))).toBe(false)
  expect(runsInstalled(window_("browser", { standalone: false }))).toBe(false)
  expect(runsInstalled(window_("fullscreen", { fullscreenElement: {} }))).toBe(false)
})

/** The browser's storage manager: whether it already keeps the storage and what it answers when asked. */
function storage(already: boolean, answer: boolean | "throws") {
  const asked: string[] = []
  return {
    asked,
    persisted: async () => (asked.push("persisted"), already),
    persist: async () => {
      asked.push("persist")
      if (answer === "throws") throw new Error("denied")
      return answer
    }
  }
}

test("the installed game asks the browser to keep its storage, and knows when it is kept", async () => {
  const manager = storage(false, true)
  expect(await keepStorage({ installed: true, storage: manager })).toBe(true)
  expect(manager.asked).toEqual(["persisted", "persist"])
})

test("in a browser tab the game does not ask to keep its storage", async () => {
  const manager = storage(false, true)
  expect(await keepStorage({ installed: false, storage: manager })).toBeNull()
  expect(manager.asked).toEqual([])
})

test("storage already kept is not asked for again", async () => {
  const manager = storage(true, true)
  expect(await keepStorage({ installed: true, storage: manager })).toBe(true)
  expect(manager.asked).toEqual(["persisted"])
})

test("a browser that refuses, fails, or cannot keep storage leaves the game playing", async () => {
  expect(await keepStorage({ installed: true, storage: storage(false, false) })).toBe(false)
  expect(await keepStorage({ installed: true, storage: storage(false, "throws") })).toBe(false)
  expect(await keepStorage({ installed: true, storage: undefined })).toBeNull()
})

test("only iPhone and iPad add the game to the home screen by hand, iPadOS's desktop address included", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
  const ipad = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15"
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
  expect(addsToHomeScreenByHand({ userAgent: iphone, maxTouchPoints: 5 })).toBe(true)
  expect(addsToHomeScreenByHand({ userAgent: ipad, maxTouchPoints: 5 })).toBe(true)
  // iPadOS asks for desktop pages by default: a Mac with a touch screen is an iPad.
  expect(addsToHomeScreenByHand({ userAgent: mac, maxTouchPoints: 5 })).toBe(true)
  expect(addsToHomeScreenByHand({ userAgent: mac, maxTouchPoints: 0 })).toBe(false)
  expect(addsToHomeScreenByHand({ userAgent: android, maxTouchPoints: 5 })).toBe(false)
})
