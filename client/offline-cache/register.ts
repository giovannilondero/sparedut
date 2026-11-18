/**
 * Registers the service worker (`./sw.ts`, built to `/sw.js` by `scripts/service-worker.ts`)
 * in the production build only: in the dev server there is no `/sw.js`, and a worker would
 * answer Vite's modules from a stale cache.
 */

export const WORKER_URL = "/sw.js"

/** The registration, or `null` when there is none: dev server, no support, or refused (the game plays online as before). */
export async function registerServiceWorker<R>(env: {
  production: boolean
  container: { register(url: string, options?: { scope?: string }): Promise<R> } | undefined
}): Promise<R | null> {
  if (!env.production || !env.container) return null
  try {
    return await env.container.register(WORKER_URL, { scope: "/" })
  } catch (error) {
    console.warn("service worker not registered", error)
    return null
  }
}
