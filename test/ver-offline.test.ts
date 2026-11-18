import { expect, test } from "bun:test"
import { cacheName, staleCaches, staleVerCaches, verCacheName } from "../client/offline-cache/caches.ts"
import { lookFromUrl } from "../client/looks.ts"
import { keepVerFilesOnceControlled, lookToShow, VER_PROBE, verState } from "../client/offline-cache/ver.ts"
import { existsSync } from "node:fs"
import { precacheOf } from "../client/offline-cache/precache.ts"
import { routeOf, storable } from "../client/offline-cache/route.ts"

const ORIGIN = "https://sparedut.example"
const PRECACHED = new Set(["/", "/boot.js", "/assets/index-abc.js"])
const get = (path: string, mode = "no-cors", extra: { method?: string; headers?: Record<string, string> } = {}) => ({
  method: extra.method ?? "GET",
  url: path.startsWith("http") ? path : ORIGIN + path,
  mode,
  headers: new Headers(extra.headers)
})
const route = (request: ReturnType<typeof get>) => routeOf(request, ORIGIN, PRECACHED)

test("Vêr's models and photographed surfaces are cached on first use", () => {
  expect(route(get("/models/mitraie.glb", "cors"))).toBe("first-use")
  expect(route(get("/tex/pietra_d.webp", "no-cors"))).toBe("first-use")
})

test("a Vêr file asked other than as a plain read is never cached", () => {
  expect(route(get("/models/mitraie.glb", "cors", { method: "HEAD" }))).toBe("network")
  expect(route(get("/models/mitraie.glb?v=2", "cors"))).toBe("network")
  expect(route(get("/tex/pietra_d.webp", "no-cors", { headers: { Range: "bytes=0-10" } }))).toBe("network")
  expect(route(get("https://elsewhere.example/models/mitraie.glb", "cors"))).toBe("network")
})

test("only a whole, successful answer of the game's own origin is kept", () => {
  expect(storable({ status: 200, type: "basic" })).toBe(true)
  expect(storable({ status: 404, type: "basic" })).toBe(false)
  expect(storable({ status: 500, type: "basic" })).toBe(false)
  expect(storable({ status: 206, type: "basic" })).toBe(false)
  expect(storable({ status: 0, type: "opaque" })).toBe(false)
  expect(storable({ status: 200, type: "cors" })).toBe(false)
})

const BUILD = [
  { path: "index.html", bytes: 18_000, hash: "h-index" },
  { path: "assets/index-abc.js", bytes: 1_600_000, hash: "h-js" },
  { path: "models/mitraie.glb", bytes: 2_000_000, hash: "h-glb" },
  { path: "tex/pietra_d.webp", bytes: 900_000, hash: "h-webp" },
  { path: "tex/README.md", bytes: 3_000, hash: "h-readme" }
]
const withHash = (path: string, hash: string) => BUILD.map((file) => (file.path === path ? { ...file, hash } : file))

test("Vêr's files have a version of their own: a changed model or surface gives a new one", () => {
  const ver = precacheOf(BUILD).ver
  expect(ver).toMatch(/^[0-9a-f]{12}$/)
  expect(precacheOf([...BUILD].reverse()).ver).toBe(ver)
  expect(precacheOf(withHash("models/mitraie.glb", "h-glb-2")).ver).not.toBe(ver)
  expect(precacheOf(withHash("tex/pietra_d.webp", "h-webp-2")).ver).not.toBe(ver)
})

test("a new build of the game alone keeps what Vêr has cached", () => {
  const ver = precacheOf(BUILD).ver
  expect(precacheOf(withHash("assets/index-abc.js", "h-js-2")).ver).toBe(ver)
  expect(precacheOf(withHash("tex/README.md", "h-readme-2")).ver).toBe(ver)
  const kept = verCacheName(ver)
  expect(staleCaches([cacheName("old"), cacheName("new"), kept], cacheName("new"))).toEqual([cacheName("old")])
  expect(staleVerCaches([cacheName("old"), kept, "someone-else"], kept)).toEqual([])
})

test("when Vêr's files change, the Vêr cache of the old ones is removed", () => {
  const old = verCacheName("aaaa")
  const current = verCacheName("bbbb")
  expect(current).not.toBe(old)
  expect(staleVerCaches([old, current, cacheName("bbbb")], current)).toEqual([old])
})

/** The browser's localStorage, in memory. */
const fakeStorage = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries))
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) }
}

test("Vêr chosen with no network and nothing of it cached: Cumò is shown, and the player is told why", () => {
  expect(lookToShow("ver", "unreachable")).toEqual({ look: "cumo", fellBack: true })
})

test("Vêr chosen and cached, or reachable, is shown as Vêr", () => {
  expect(lookToShow("ver", "cached")).toEqual({ look: "ver", fellBack: false })
  expect(lookToShow("ver", "reachable")).toEqual({ look: "ver", fellBack: false })
})

test("Cumò chosen is Cumò, whatever the network", () => {
  expect(lookToShow("cumo", "unreachable")).toEqual({ look: "cumo", fellBack: false })
})

test("after falling back to Cumò the saved choice is still Vêr, so Vêr comes back once it can load", () => {
  const storage = fakeStorage({ "sparedut.look": "ver" })
  expect(lookToShow(lookFromUrl("", storage), "unreachable").look).toBe("cumo")
  expect(lookFromUrl("", storage)).toBe("ver")
  const asked = fakeStorage()
  expect(lookToShow(lookFromUrl("?look=ver", asked), "unreachable").look).toBe("cumo")
  expect(lookFromUrl("", asked)).toBe("ver")
})

/** What the page reads to tell whether Vêr can load: the caches and the network. */
const probe = (cached: boolean, network: "up" | "down" | "missing") => {
  const asked: string[] = []
  return {
    asked,
    caches: { match: async (url: string) => (cached && url === VER_PROBE ? {} : undefined) },
    fetch: async (url: string, init?: { method?: string }) => {
      asked.push(`${init?.method ?? "GET"} ${url}`)
      if (network === "down") throw new TypeError("Failed to fetch")
      return { ok: network === "up", status: network === "up" ? 200 : 404 }
    }
  }
}

test("Vêr is cached when its files were fetched once: no request goes out", async () => {
  const env = probe(true, "down")
  expect(await verState(env)).toBe("cached")
  expect(env.asked).toEqual([])
})

test("Vêr never fetched is reachable when the game's origin answers, and unreachable with no network", async () => {
  expect(await verState(probe(false, "up"))).toBe("reachable")
  expect(await verState(probe(false, "missing"))).toBe("reachable")
  const down = probe(false, "down")
  expect(await verState(down)).toBe("unreachable")
  expect(down.asked).toEqual([`HEAD ${VER_PROBE}`])
})

test("with no cache in the browser (plain-http LAN address), the network decides", async () => {
  const env = probe(false, "up")
  expect(await verState({ caches: undefined, fetch: env.fetch })).toBe("reachable")
  expect(await verState({ caches: undefined, fetch: probe(false, "down").fetch })).toBe("unreachable")
})

test("the file probed for Vêr is one the build ships", () => {
  expect(existsSync(`client/public${VER_PROBE}`)).toBe(true)
})

/** `navigator.serviceWorker` as the page sees it, and what the page fetches again. */
const firstVisit = (controller: unknown) => {
  const listeners: (() => void)[] = []
  const fetchedAgain: string[] = []
  const env = {
    container: { controller, addEventListener: (_: "controllerchange", listener: () => void) => void listeners.push(listener) },
    fetched: () => [
      `${ORIGIN}/assets/index-abc.js`,
      `${ORIGIN}/models/mitraie.glb`,
      `${ORIGIN}/tex/pietra_d.webp`,
      `${ORIGIN}/tex/pietra_n.webp?x=1`,
      "https://elsewhere.example/models/mitraie.glb"
    ],
    fetch: async (url: string) => void fetchedAgain.push(url),
    origin: ORIGIN
  }
  return { env, fetchedAgain, takeControl: () => listeners.forEach((listener) => listener()) }
}

test("on the first visit, the Vêr files fetched before the worker took control are fetched again through it", () => {
  const visit = firstVisit(null)
  keepVerFilesOnceControlled(visit.env)
  expect(visit.fetchedAgain).toEqual([])
  visit.takeControl()
  expect(visit.fetchedAgain).toEqual(["/models/mitraie.glb", "/tex/pietra_d.webp"])
})

test("a page the worker already controls fetches nothing again", () => {
  const visit = firstVisit({})
  keepVerFilesOnceControlled(visit.env)
  visit.takeControl()
  expect(visit.fetchedAgain).toEqual([])
})
