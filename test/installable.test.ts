import { expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { STRINGS } from "../client/i18n.ts"
import { addsToHomeScreenByHand, keepStorage, runsInstalled } from "../client/installed.ts"
import { deployOriginInPage, pageForDeploy } from "../scripts/deploy-origin.ts"
import viteConfig from "../vite.config.ts"
import { precacheOf } from "../client/offline-cache/precache.ts"
import { builtFiles } from "../scripts/service-worker.ts"
import { headersFor } from "../server/static-headers.ts"
import { readOpening } from "../client/opening.ts"

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

/** The page as the build writes it, for a deploy on `domain` (`DEPLOY_DOMAIN`, or none). */
const built = (domain?: string) => pageForDeploy(html, domain === undefined ? {} : { DEPLOY_DOMAIN: domain })
/** The `content` of the `<meta>` whose `name` or `property` is `key`, in a page. */
const meta = (page: string, key: string) => page.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1]

test("a shared link shows the game's title, a line about it and a large picture, in chats and on X", () => {
  const page = built()
  expect(meta(page, "description")).toBeTruthy()
  expect(meta(page, "og:title")).toBe("Sparedût")
  expect(meta(page, "og:description")).toBe(meta(page, "description"))
  expect(meta(page, "og:type")).toBe("website")
  expect(meta(page, "og:locale")).toBe("fur_IT")
  expect(meta(page, "og:url")).toBe("https://sparedut.giovannilondero.dev/")
  expect(meta(page, "og:image")).toBe("https://sparedut.giovannilondero.dev/showcase/link-preview.png")
  expect(meta(page, "og:image:type")).toBe("image/png")
  expect(meta(page, "og:image:width")).toBe("1200")
  expect(meta(page, "og:image:height")).toBe("630")
  expect(meta(page, "og:image:alt")).toBeTruthy()
  expect(meta(page, "twitter:card")).toBe("summary_large_image")
  expect(meta(page, "twitter:image")).toBe(meta(page, "og:image"))
  expect(meta(page, "twitter:image:alt")).toBe(meta(page, "og:image:alt"))
})

/** Every absolute address written in a page. */
const absolute = (page: string) => [...page.matchAll(/"([a-z][a-z0-9+.-]*:\/\/[^"]*)"/gi)].map((m) => m[1]!)

test("every absolute address in the page is on the public game's domain, whichever build wrote it", () => {
  const addresses = absolute(built())
  expect(addresses.length).toBeGreaterThanOrEqual(3)
  expect(addresses.filter((url) => !url.startsWith("https://sparedut.giovannilondero.dev/"))).toEqual([])
  expect(built("")).toBe(built())
})

test("a deploy on another domain advertises its own address", () => {
  const addresses = absolute(built("sparedut.example.com"))
  expect(addresses.length).toBeGreaterThanOrEqual(3)
  expect(addresses.filter((url) => !url.startsWith("https://sparedut.example.com/"))).toEqual([])
  expect(meta(built("sparedut.example.com"), "og:image")).toBe("https://sparedut.example.com/showcase/link-preview.png")
})

test("the page is built with the deploy's address, in the dev server and in every build", () => {
  const plugin = deployOriginInPage()
  const transform = plugin.transformIndexHtml as (html: string) => string
  const previous = process.env.DEPLOY_DOMAIN
  try {
    process.env.DEPLOY_DOMAIN = "sparedut.example.com"
    expect(transform(html)).toBe(built("sparedut.example.com"))
  } finally {
    if (previous === undefined) delete process.env.DEPLOY_DOMAIN
    else process.env.DEPLOY_DOMAIN = previous
  }
  expect(viteConfig.plugins?.flat().some((p) => p && typeof p === "object" && "name" in p && p.name === plugin.name)).toBe(true)
  expect(built()).not.toContain("%DEPLOY_ORIGIN%")
})

/** The page's path for an address on the deploy's origin. */
const pathOf = (url: string) => new URL(url).pathname

test("the preview picture is a 1200 by 630 PNG that the build serves", () => {
  const image = pathOf(meta(built(), "og:image")!)
  expect(pngSize(image)).toEqual([1200, 630])
})

test("the preview picture is not downloaded when the game is installed", () => {
  const { urls } = precacheOf(builtFiles(PUBLIC))
  expect(urls).toContain("/manifest.webmanifest")
  expect(urls).not.toContain(pathOf(meta(built(), "og:image")!))
})

test("the preview picture is served with the same security headers as the page", () => {
  const headers = readFileSync(join(PUBLIC, "_headers"), "utf8")
  expect(headersFor(headers, pathOf(meta(built(), "og:image")!))).toEqual(headersFor(headers, "/"))
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

interface Shortcut {
  name: string
  short_name?: string
  url: string
  icons?: Icon[]
}

test("a long press on the installed game's icon offers the home screen's button, opening the game on the shortcut", () => {
  const shortcuts = (manifest.shortcuts ?? []) as Shortcut[]
  expect(shortcuts.map((shortcut) => shortcut.name)).toEqual([STRINGS.fur.static.oneTap])
  const url = new URL(shortcuts[0]!.url, "https://sparedut.example")
  expect(url.pathname).toBe("/")
  expect(readOpening(url.search, url.hash)).toEqual({ kind: "shortcut" })
  for (const icon of shortcuts[0]!.icons ?? []) expect(pngSize(icon.src)).toEqual(icon.sizes.split("x").map(Number) as [number, number])
})

test("opening the installed game again brings the open game to the front instead of a new window", () => {
  expect(manifest.launch_handler).toEqual({ client_mode: "focus-existing" })
})
