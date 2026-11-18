/**
 * The service worker's cache names. Each build fills its own precache, named after the
 * build's version (`./precache.ts`); when a new worker takes over it deletes the others.
 */

const PRECACHE_PREFIX = "sparedut-precache-"

/** The precache of the build whose version is `version`. */
export const cacheName = (version: string) => `${PRECACHE_PREFIX}${version}`

/**
 * The caches to delete when the worker of `current` takes over: the previous builds'
 * precaches. Anything else (a cache that outlives builds, or one the game did not make) stays.
 */
export const staleCaches = (names: readonly string[], current: string): string[] =>
  names.filter((name) => name.startsWith(PRECACHE_PREFIX) && name !== current)

const VER_PREFIX = "sparedut-ver-"

/**
 * The Vêr look's files, cached on first use (`./route.ts`). Named after their own version
 * (`Precache.ver`), so a new build of the game alone keeps them and a changed model replaces them.
 */
export const verCacheName = (ver: string) => `${VER_PREFIX}${ver}`

/** The Vêr caches to delete when the worker whose Vêr cache is `current` takes over. */
export const staleVerCaches = (names: readonly string[], current: string): string[] =>
  names.filter((name) => name.startsWith(VER_PREFIX) && name !== current)
