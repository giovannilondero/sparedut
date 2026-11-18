import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { headersFor } from "../server/static-headers.ts"
import { registerServiceWorker } from "../client/offline-cache/register.ts"
import { cacheName, staleCaches } from "../client/offline-cache/caches.ts"
import { precacheOf } from "../client/offline-cache/precache.ts"
import { routeOf } from "../client/offline-cache/route.ts"

const ORIGIN = "https://sparedut.example"
const PRECACHED = new Set(["/", "/boot.js", "/favicon.svg", "/assets/index-abc.js", "/assets/rapier_wasm3d_bg-def.wasm"])

/** What the browser hands the service worker for a request. */
const get = (path: string, mode = "no-cors", extra: { method?: string; headers?: Record<string, string> } = {}) => ({
  method: extra.method ?? "GET",
  url: path.startsWith("http") || path.startsWith("ws") ? path : ORIGIN + path,
  mode,
  headers: new Headers(extra.headers)
})
const route = (request: ReturnType<typeof get>) => routeOf(request, ORIGIN, PRECACHED)

test("opening the game is answered with the cached page", () => {
  expect(route(get("/", "navigate"))).toBe("page")
})

test("an invite link and any other path of the game open the cached page", () => {
  expect(route(get("/?p=ABCD", "navigate"))).toBe("page")
  expect(route(get("/?p=ABCD#pw=secret", "navigate"))).toBe("page")
  expect(route(get("/stanza/che/non/esiste", "navigate"))).toBe("page")
})

test("the scripts, styles, physics and boot script of the build come from the cache", () => {
  expect(route(get("/boot.js", "no-cors"))).toBe("precached")
  expect(route(get("/assets/index-abc.js", "cors"))).toBe("precached")
  expect(route(get("/assets/rapier_wasm3d_bg-def.wasm", "same-origin"))).toBe("precached")
  expect(route(get("/favicon.svg"))).toBe("precached")
})

test("the game socket is never answered from a cache", () => {
  expect(route(get("/ws", "websocket"))).toBe("network")
  expect(route(get("/ws", "same-origin", { headers: { Upgrade: "websocket" } }))).toBe("network")
  expect(route(get("wss://sparedut.example/ws"))).toBe("network")
})

test("anything that is not a plain read of the game's own origin goes to the network", () => {
  expect(route(get("/", "navigate", { method: "POST" }))).toBe("network")
  expect(route(get("/boot.js", "no-cors", { method: "HEAD" }))).toBe("network")
  expect(route(get("https://elsewhere.example/boot.js"))).toBe("network")
  expect(route(get("https://elsewhere.example/", "navigate"))).toBe("network")
  expect(route(get("http://sparedut.example/boot.js"))).toBe("network")
})

test("a file of the game that is not in the build's list goes to the network", () => {
  expect(route(get("/models/mitraie.glb", "cors"))).toBe("network")
  expect(route(get("/tex/pietra_d.webp", "cors"))).toBe("network")
  expect(route(get("/assets/index-old.js", "cors"))).toBe("network")
})

test("a listed file asked with a query or a range is not the cached file", () => {
  expect(route(get("/boot.js?v=2"))).toBe("network")
  expect(route(get("/assets/index-abc.js", "cors", { headers: { Range: "bytes=0-10" } }))).toBe("network")
})

test("a new build fills its own cache and, when it takes over, removes the previous builds' caches", () => {
  const previous = cacheName("1111aaaa")
  const older = cacheName("0000ffff")
  const current = cacheName("2222bbbb")
  expect(current).not.toBe(previous)
  expect(staleCaches([older, previous, current], current)).toEqual([older, previous])
})

test("a cache the game did not make is left alone", () => {
  const current = cacheName("2222bbbb")
  expect(staleCaches(["someone-else", current], current)).toEqual([])
})

/** A build's output as the build sees it: path under the output folder, size and content hash. */
const BUILD = [
  { path: "index.html", bytes: 18_000, hash: "h-index" },
  { path: "boot.js", bytes: 600, hash: "h-boot" },
  { path: "favicon.svg", bytes: 400, hash: "h-icon" },
  { path: "_headers", bytes: 700, hash: "h-headers" },
  { path: "sw.js", bytes: 2_000, hash: "h-sw" },
  { path: "assets/index-abc.js", bytes: 1_600_000, hash: "h-js" },
  { path: "assets/index-abc.css", bytes: 46_000, hash: "h-css" },
  { path: "assets/host.worker-x.js", bytes: 570_000, hash: "h-host" },
  { path: "assets/rapier_wasm3d_bg-def.wasm", bytes: 3_000_000, hash: "h-wasm" },
  { path: "models/mitraie.glb", bytes: 2_000_000, hash: "h-glb" },
  { path: "tex/pietra_d.webp", bytes: 900_000, hash: "h-webp" },
  { path: "tex/README.md", bytes: 3_000, hash: "h-readme" }
]

test("the precache list is the build's page, scripts, styles, host worker, physics, boot script and icon", () => {
  const list = precacheOf(BUILD)
  expect(list.urls).toEqual([
    "/",
    "/assets/host.worker-x.js",
    "/assets/index-abc.css",
    "/assets/index-abc.js",
    "/assets/rapier_wasm3d_bg-def.wasm",
    "/boot.js",
    "/favicon.svg"
  ])
  expect(list.bytes).toBe(18_000 + 600 + 400 + 1_600_000 + 46_000 + 570_000 + 3_000_000)
})

test("the Vêr look's models and surfaces, the headers file and the worker itself are not precached", () => {
  const { urls } = precacheOf(BUILD)
  expect(urls.some((url) => url.startsWith("/models/") || url.startsWith("/tex/"))).toBe(false)
  expect(urls).not.toContain("/_headers")
  expect(urls).not.toContain("/sw.js")
})

test("a file added to the build's root, such as a manifest or an icon, is precached without touching the list", () => {
  const { urls } = precacheOf([...BUILD, { path: "manifest.webmanifest", bytes: 500, hash: "h-man" }, { path: "icons/192.png", bytes: 9_000, hash: "h-192" }])
  expect(urls).toContain("/manifest.webmanifest")
  expect(urls).toContain("/icons/192.png")
})

test("the same build has the same version, whatever order its files come in", () => {
  expect(precacheOf([...BUILD].reverse()).version).toBe(precacheOf(BUILD).version)
  expect(precacheOf(BUILD).version).toMatch(/^[0-9a-f]{12}$/)
})

test("a change to any precached file, even one whose name has no hash, gives a new version", () => {
  const changed = BUILD.map((file) => (file.path === "boot.js" ? { ...file, hash: "h-boot-2" } : file))
  expect(precacheOf(changed).version).not.toBe(precacheOf(BUILD).version)
})

test("a change to a Vêr model alone keeps the version", () => {
  const changed = BUILD.map((file) => (file.path === "models/mitraie.glb" ? { ...file, hash: "h-glb-2" } : file))
  expect(precacheOf(changed).version).toBe(precacheOf(BUILD).version)
})

/** A browser's `navigator.serviceWorker` that records what it was asked to register. */
const fakeContainer = () => {
  const registered: { url: string; scope: string | undefined }[] = []
  return {
    registered,
    register: async (url: string, options?: { scope?: string }) => {
      registered.push({ url, scope: options?.scope })
      return { scope: options?.scope ?? "/" }
    }
  }
}

test("the dev server never registers the service worker", async () => {
  const container = fakeContainer()
  expect(await registerServiceWorker({ production: false, container })).toBeNull()
  expect(container.registered).toEqual([])
})

test("the production build registers the service worker for the whole game", async () => {
  const container = fakeContainer()
  expect(await registerServiceWorker({ production: true, container })).not.toBeNull()
  expect(container.registered).toEqual([{ url: "/sw.js", scope: "/" }])
})

test("a browser without service workers, or one that refuses it, still plays online", async () => {
  expect(await registerServiceWorker({ production: true, container: undefined })).toBeNull()
  const refusing = { register: () => Promise.reject(new Error("SecurityError")) }
  expect(await registerServiceWorker({ production: true, container: refusing })).toBeNull()
})

const HEADERS_FILE = readFileSync(new URL("../client/public/_headers", import.meta.url), "utf8")

test("the service worker is served so that the browser always revalidates it, with the same security headers", () => {
  const worker = headersFor(HEADERS_FILE, "/sw.js")
  expect(worker["Cache-Control"]).toBe("no-cache")
  expect(worker["Content-Security-Policy"]).toBe(headersFor(HEADERS_FILE, "/")["Content-Security-Policy"])
  expect(worker["Content-Security-Policy"]).toContain("default-src 'self'")
})

test("the other files keep their headers and are not forced to revalidate", () => {
  for (const path of ["/", "/index.html", "/boot.js", "/assets/index-abc.js"]) {
    const headers = headersFor(HEADERS_FILE, path)
    expect(headers["Cache-Control"]).toBeUndefined()
    expect(headers["X-Content-Type-Options"]).toBe("nosniff")
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin")
  }
})
