/**
 * A cached game too old for the game server updates itself instead of getting stuck.
 *
 * Once the game is served from a cache, a plain reload returns the same cached version. So when
 * the server answers `error version`, the client asks for an update check at once; a new version
 * that arrives takes over and the page reloads into it, once. If none arrives, or the server still
 * refuses after that reload, the player gets a message and nothing reloads again.
 *
 * The decision is this pure machine; `client/main.ts` feeds it events and carries out its effects
 * with `./update.ts`. Nothing here blocks play: offline rooms and the training stay usable.
 */

/** Why the game cannot update itself, said to the player. */
export const STUCK_REASONS = ["noWorker", "noUpdate", "stillRefused"] as const
export type StuckReason = (typeof STUCK_REASONS)[number]

/** What the player is told. */
export type Notice = "updating" | StuckReason

export type TooOld =
  /** The server has not refused this page. */
  | { readonly _tag: "Fine" }
  /** Refused: the update check is under way. */
  | { readonly _tag: "Checking" }
  /** A new version is waiting; it takes over on return to the menu. */
  | { readonly _tag: "Ready" }
  /** The new version was asked to take over. */
  | { readonly _tag: "TakingOver" }
  /** The new version is in control; the page reloads on return to the menu. */
  | { readonly _tag: "TookOver" }
  /** The one automatic reload of this page has been asked for. */
  | { readonly _tag: "Reloading" }
  /** No update this page: the player has been told why. */
  | { readonly _tag: "Stuck"; readonly reason: StuckReason }

export const FINE: TooOld = { _tag: "Fine" }

/** What the update check found: a new version installed and waiting, none, or no service worker at all. */
export type CheckOutcome = "waiting" | "none" | "noWorker"

export type TooOldEvent =
  /** The server answered `error version`. */
  | { readonly t: "refused" }
  | { readonly t: "checked"; readonly outcome: CheckOutcome }
  /** A new service worker took control of the page (`controllerchange`). */
  | { readonly t: "tookOver" }
  /** The player is in the menu, not in a match. */
  | { readonly t: "atMenu" }
  /** The check or the take-over took too long. */
  | { readonly t: "gaveUp" }
  /** The server answered a hello of this page with no version error. */
  | { readonly t: "accepted" }

export type Effect =
  | { readonly do: "check" }
  | { readonly do: "takeOver" }
  /** Remember the reload for this page session, then reload. */
  | { readonly do: "reload" }
  | { readonly do: "tell"; readonly say: Notice }
  /** Forget the reload of this page session: a refusal from now on is a new one, with its own update. */
  | { readonly do: "forget" }

export interface TooOldContext {
  /** This page session has already reloaded automatically (kept across the reload). */
  readonly reloaded: boolean
  /** A match (online, offline or the training) is in progress: it is never cut. */
  readonly playing: boolean
}

export interface TooOldStep {
  readonly state: TooOld
  readonly effects: readonly Effect[]
}

const NONE: readonly Effect[] = []
const stay = (state: TooOld): TooOldStep => ({ state, effects: NONE })
const stuck = (reason: StuckReason): TooOldStep => ({ state: { _tag: "Stuck", reason }, effects: [{ do: "tell", say: reason }] })
const updating: readonly Effect[] = [{ do: "tell", say: "updating" }]
/** The server takes this page: any earlier refusal is over, and the reload that answered it is forgotten. */
const accepted = (context: TooOldContext): TooOldStep => ({ state: FINE, effects: context.reloaded ? [{ do: "forget" }] : NONE })
const reloadUnlessPlaying = (context: TooOldContext): TooOldStep =>
  context.playing ? stay({ _tag: "TookOver" }) : { state: { _tag: "Reloading" }, effects: [{ do: "reload" }] }

type Handlers = { readonly [K in TooOld["_tag"]]: (state: Extract<TooOld, { _tag: K }>, event: TooOldEvent, context: TooOldContext) => TooOldStep }

const handlers = {
  Fine: (state, event, context) => {
    if (event.t === "accepted") return accepted(context)
    if (event.t !== "refused") return stay(state)
    if (context.reloaded) return stuck("stillRefused")
    return { state: { _tag: "Checking" }, effects: [{ do: "check" }, ...updating] }
  },
  Checking: (state, event, context) => {
    switch (event.t) {
      case "refused":
        return { state, effects: updating }
      case "checked":
        if (event.outcome === "noWorker") return stuck("noWorker")
        if (event.outcome === "none") return stuck("noUpdate")
        return context.playing ? stay({ _tag: "Ready" }) : { state: { _tag: "TakingOver" }, effects: [{ do: "takeOver" }] }
      case "tookOver":
        return reloadUnlessPlaying(context)
      case "gaveUp":
        return stuck("noUpdate")
      case "atMenu":
      case "accepted":
        return stay(state)
    }
  },
  Ready: (state, event, context) => {
    switch (event.t) {
      case "refused":
        return { state, effects: updating }
      case "atMenu":
        return context.playing ? stay(state) : { state: { _tag: "TakingOver" }, effects: [{ do: "takeOver" }] }
      case "tookOver":
        return reloadUnlessPlaying(context)
      case "checked":
      case "gaveUp":
      case "accepted":
        return stay(state)
    }
  },
  TakingOver: (state, event, context) => {
    switch (event.t) {
      case "refused":
        return { state, effects: updating }
      case "tookOver":
        return reloadUnlessPlaying(context)
      case "gaveUp":
        return stuck("noUpdate")
      case "checked":
      case "atMenu":
      case "accepted":
        return stay(state)
    }
  },
  TookOver: (state, event, context) => {
    if (event.t === "atMenu") return reloadUnlessPlaying(context)
    if (event.t === "refused") return { state, effects: updating }
    return stay(state)
  },
  Reloading: (state) => stay(state),
  Stuck: (state, event, context) => {
    if (event.t === "accepted") return accepted(context)
    return event.t === "refused" ? { state, effects: [{ do: "tell", say: state.reason }] } : stay(state)
  }
} satisfies Handlers

/** The next state of a page refused by the server, and what the client must do. */
export function tooOld(state: TooOld, event: TooOldEvent, context: TooOldContext): TooOldStep {
  return (handlers[state._tag] as (state: TooOld, event: TooOldEvent, context: TooOldContext) => TooOldStep)(state, event, context)
}
