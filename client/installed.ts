/**
 * The game installed to the home screen (`public/manifest.webmanifest`): whether this page runs
 * installed, and asking the browser to keep the game's storage (the offline cache, the settings,
 * the training's progress) so that it is not evicted when the device runs short of space.
 */

/** What tells an installed game from a browser tab: `window.matchMedia`, `document.fullscreenElement`, Safari's `navigator.standalone`. */
export interface Surroundings {
  matchMedia(query: string): { matches: boolean }
  readonly fullscreenElement: unknown
  readonly standalone?: boolean
}

/**
 * Whether the game runs installed: in its own window (the manifest asks for `fullscreen`, which
 * a browser may give as `standalone`), or from the iPhone's home screen. A tab a match put in
 * fullscreen (`fullscreen.ts`) also matches `display-mode: fullscreen`, so that one is ruled out.
 */
export function runsInstalled(env: Surroundings): boolean {
  if (env.standalone === true || env.matchMedia("(display-mode: standalone)").matches) return true
  return env.matchMedia("(display-mode: fullscreen)").matches && !env.fullscreenElement
}

/**
 * Whether the game is added to the home screen by hand, from the share menu, because the browser
 * offers no install prompt: iPhone and iPad. iPadOS asks for desktop pages by default, so its
 * Safari says "Macintosh"; a Mac has no touch points.
 */
export function addsToHomeScreenByHand(nav: { readonly userAgent: string; readonly maxTouchPoints: number }): boolean {
  return /\b(iPhone|iPad|iPod)\b/.test(nav.userAgent) || (/\bMacintosh\b/.test(nav.userAgent) && nav.maxTouchPoints > 1)
}

/** The part of `navigator.storage` used here. */
export interface StorageKeeper {
  persisted(): Promise<boolean>
  persist(): Promise<boolean>
}

/**
 * Asks the browser to keep the game's storage, once the game runs installed: in a tab the
 * question would come out of nowhere. Resolves to whether the storage is kept, or `null` when
 * it was not asked (not installed, or a browser without the API). A refusal is not an error:
 * the game plays as before, its storage merely evictable.
 */
export async function keepStorage(env: { installed: boolean; storage: StorageKeeper | undefined }): Promise<boolean | null> {
  if (!env.installed || !env.storage) return null
  try {
    return (await env.storage.persisted()) || (await env.storage.persist())
  } catch (error) {
    console.warn("storage not kept", error)
    return false
  }
}
