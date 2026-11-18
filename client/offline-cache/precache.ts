/**
 * The precache list, made at build time from the build output (`scripts/service-worker.ts`),
 * so a local build and the deploy, which runs the same `pnpm build`, produce the same list.
 * Not part of the page: it runs in the build.
 *
 * The list is everything in the output but what is left out below, so a file added to the
 * build (a manifest, icons) is precached without touching this file.
 */
import { createHash } from "node:crypto"
import { isVerFile } from "./route.ts"

/** A file of the build output: its path under the output folder, its size and a hash of its content. */
export interface BuiltFile {
  readonly path: string
  readonly bytes: number
  readonly hash: string
}

export interface Precache {
  /** Derived from the list and the content of every file in it: a new build of anything precached is a new version. */
  readonly version: string
  /** The paths the worker caches at install, sorted; the page is `/`. */
  readonly urls: readonly string[]
  /** What the install downloads. */
  readonly bytes: number
}

/** The service worker's own file: the browser fetches it, it never comes from a cache. */
export const WORKER_FILE = "sw.js"

/** Never precached: the Vêr look's files (`VER_PREFIXES`), the server's headers, the worker, notes and source maps. */
const left = (url: string) => isVerFile(url) || url === "/_headers" || url === `/${WORKER_FILE}` || /\.(md|map)$/.test(url) || url.endsWith("/.DS_Store")

/** The page is asked for as `/`: Cloudflare answers `/index.html` with a redirect, which a navigation can't take from a cache. */
const urlOf = (path: string) => (path === "index.html" ? "/" : `/${path}`)

export function precacheOf(files: readonly BuiltFile[]): Precache {
  const kept = files
    .map((file) => ({ ...file, url: urlOf(file.path) }))
    .filter((file) => !left(file.url))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  const digest = createHash("sha256")
  for (const file of kept) digest.update(`${file.url}\0${file.hash}\n`)
  return {
    version: digest.digest("hex").slice(0, 12),
    urls: kept.map((file) => file.url),
    bytes: kept.reduce((sum, file) => sum + file.bytes, 0)
  }
}
