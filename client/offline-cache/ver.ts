/**
 * The Vêr look with no network, on the page's side. The service worker keeps Vêr's files the
 * first time they are fetched (`./route.ts`, `first-use`); at startup the page asks whether
 * Vêr can load (`verState`) and, when it can't, shows Cumò for this page only (`lookToShow`):
 * the saved choice stays Vêr, so Vêr comes back by itself once it can be loaded.
 */
import type { LookId } from "../looks.ts"
import { isVerFile } from "./route.ts"

/**
 * - `cached`: Vêr's files were fetched once and are in the Vêr cache;
 * - `reachable`: not cached, but the game's origin answers, so they can be fetched now;
 * - `unreachable`: neither: no network and nothing cached.
 */
export const VER_STATES = ["cached", "reachable", "unreachable"] as const
export type VerState = (typeof VER_STATES)[number]

/** A Vêr file every Vêr page fetches at startup (the weapons' models load all at once): its presence stands for the rest. */
export const VER_PROBE = "/models/mitraie.glb"

/** How long the network has to answer before Vêr counts as unreachable (a connection that hangs). */
const PROBE_MS = 4000

/** Whether Vêr can load. `caches` is absent where the page has no Cache Storage (plain-http LAN address). */
export async function verState(env: {
  caches: { match(url: string): Promise<unknown> } | undefined
  fetch: (url: string, init: RequestInit) => Promise<unknown>
}): Promise<VerState> {
  if (env.caches && (await env.caches.match(VER_PROBE).catch(() => undefined))) return "cached"
  try {
    // Any answer means the network is there: a HEAD is never cached and fetches no body.
    await env.fetch(VER_PROBE, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(PROBE_MS) })
    return "reachable"
  } catch {
    return "unreachable"
  }
}

/** The look this page shows for the `chosen` one; `fellBack` when Vêr was chosen and can't load, to say why. */
export function lookToShow(chosen: LookId, ver: VerState): { look: LookId; fellBack: boolean } {
  const fellBack = chosen === "ver" && ver === "unreachable"
  return { look: fellBack ? "cumo" : chosen, fellBack }
}

/**
 * On the first visit the worker takes control only after the page has fetched Vêr's files, so
 * they went past it. Once it controls the page, they are fetched again through it (from the
 * browser's HTTP cache where it can) and kept: one online visit is enough to have Vêr offline.
 */
export function keepVerFilesOnceControlled(env: {
  container: { readonly controller: unknown; addEventListener(type: "controllerchange", listener: () => void, options: { once: true }): void } | undefined
  fetched: () => readonly string[]
  fetch: (url: string) => Promise<unknown>
  origin: string
}) {
  if (!env.container || env.container.controller) return
  env.container.addEventListener(
    "controllerchange",
    () => {
      for (const href of env.fetched()) {
        const url = new URL(href, env.origin)
        if (url.origin === env.origin && !url.search && isVerFile(url.pathname)) void env.fetch(url.pathname).catch(() => {})
      }
    },
    { once: true }
  )
}
