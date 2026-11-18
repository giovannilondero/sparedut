/**
 * Which request the service worker (`./sw.ts`) answers from its cache. Pure: the worker
 * passes what the browser hands it, the tests pass plain objects.
 */

/**
 * - `page`: a navigation inside the game, invite links included: the cached page.
 * - `precached`: a file of this build's list (`./precache.ts`): from the cache, the network if it is missing.
 * - `first-use`: a Vêr file (`VER_PREFIXES`): from the Vêr cache, else the network, kept on the way (`storable`).
 * - `network`: everything else, never cached: the game socket, other origins, anything but a plain read.
 */
export const ROUTES = ["page", "precached", "first-use", "network"] as const
export type Route = (typeof ROUTES)[number]

/** The parts of a `Request` the decision reads. */
export interface RequestLike {
  readonly method: string
  readonly url: string
  readonly mode: string
  readonly headers: { get(name: string): string | null }
}

/**
 * The Vêr look's models and photographed surfaces: most of the build's weight, fetched only
 * by a player who chooses Vêr, so never in the precache list.
 */
export const VER_PREFIXES = ["/models/", "/tex/"] as const
export const isVerFile = (path: string) => VER_PREFIXES.some((prefix) => path.startsWith(prefix))

/** The game socket's path, the same on the Bun server and on Cloudflare. */
export const SOCKET_PATH = "/ws"

/** How a request is answered, for a worker at `origin` whose build lists the paths in `precached`. */
export function routeOf(request: RequestLike, origin: string, precached: ReadonlySet<string>): Route {
  if (request.method !== "GET") return "network"
  const url = new URL(request.url)
  if (url.origin !== origin) return "network"
  if (url.pathname === SOCKET_PATH || request.mode === "websocket" || request.headers.get("Upgrade")) return "network"
  if (request.mode === "navigate") return "page"
  if (url.search || request.headers.get("Range")) return "network"
  if (isVerFile(url.pathname)) return "first-use"
  return precached.has(url.pathname) ? "precached" : "network"
}

/** Whether an answer to a `first-use` request is kept: a whole, successful answer of the game's own origin. */
export const storable = (response: { readonly status: number; readonly type: string }) => response.status === 200 && response.type === "basic"
