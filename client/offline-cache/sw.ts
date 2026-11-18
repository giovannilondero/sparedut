/**
 * The service worker: the game opens with no network once it has been opened online.
 * Hand-written, no library. The build (`scripts/service-worker.ts`) bundles it to `/sw.js`
 * with this build's precache list in front of it (`PRECACHE`).
 *
 * - install: fills this build's cache with the whole list, or fails and leaves the old worker in place;
 * - activate: deletes the previous builds' caches and takes control of the open pages;
 * - fetch: `routeOf` decides; the page and the listed files come from this build's cache.
 *
 * A new worker waits until no page runs the old build: a page keeps the files of its own build.
 */
import { cacheName, staleCaches } from "./caches.ts"
import { routeOf, type Route } from "./route.ts"

declare const self: ServiceWorkerGlobalScope
/** Written in front of the bundle by the build. */
declare const PRECACHE: { readonly version: string; readonly urls: readonly string[] }

const CACHE = cacheName(PRECACHE.version)
const LISTED: ReadonlySet<string> = new Set(PRECACHE.urls)
/** The page every navigation inside the game is answered with. */
const PAGE = "/"

/** From this build's cache; from the network should the entry be missing. */
const cached = (key: string, request: Request) =>
  caches
    .open(CACHE)
    .then((cache) => cache.match(key))
    .then((hit) => hit ?? fetch(request))

const answers = {
  page: (request) => cached(PAGE, request),
  precached: (request) => cached(new URL(request.url).pathname, request),
  network: null
} satisfies Record<Route, ((request: Request) => Promise<Response>) | null>

self.addEventListener("install", (event) => {
  // `reload`: past the browser's HTTP cache, so the page and the boot script are this build's.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.urls.map((url) => new Request(url, { cache: "reload" })))))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(staleCaches(names, CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const answer = answers[routeOf(event.request, self.location.origin, LISTED)]
  if (answer) event.respondWith(answer(event.request))
})
