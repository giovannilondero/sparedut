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
  /** Derived from the Vêr look's files alone, which are cached on first use: it names their cache. */
  readonly ver: string
}

/** The service worker's own file: the browser fetches it, it never comes from a cache. */
export const WORKER_FILE = "sw.js"

/** The pictures that show the game off, the link preview and the install screenshots (`scripts/showcase.ts`): never played with. */
export const SHOWCASE_PREFIX = "/showcase/"

/** Never precached: the Vêr look's files (`VER_PREFIXES`), the showcase pictures, the server's headers, the worker, notes and source maps. */
const left = (url: string) => isVerFile(url) || url.startsWith(SHOWCASE_PREFIX) || url === "/_headers" || url === `/${WORKER_FILE}` || /\.(md|map)$/.test(url) || url.endsWith("/.DS_Store")

/** The page is asked for as `/`: Cloudflare answers `/index.html` with a redirect, which a navigation can't take from a cache. */
const urlOf = (path: string) => (path === "index.html" ? "/" : `/${path}`)

/** A hash of the urls and contents of `files`, 12 hex digits. */
const versionOf = (files: readonly { url: string; hash: string }[]) => {
  const digest = createHash("sha256")
  for (const file of [...files].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))) digest.update(`${file.url}\0${file.hash}\n`)
  return digest.digest("hex").slice(0, 12)
}

export function precacheOf(files: readonly BuiltFile[]): Precache {
  const kept = files
    .map((file) => ({ ...file, url: urlOf(file.path) }))
    .filter((file) => !left(file.url))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  return {
    version: versionOf(kept),
    urls: kept.map((file) => file.url),
    bytes: kept.reduce((sum, file) => sum + file.bytes, 0),
    ver: versionOf(files.map((file) => ({ ...file, url: urlOf(file.path) })).filter((file) => isVerFile(file.url) && !/\.(md|map)$/.test(file.url)))
  }
}
