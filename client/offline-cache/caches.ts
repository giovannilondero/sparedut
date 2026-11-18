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
