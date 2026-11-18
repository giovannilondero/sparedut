/**
 * How the page was opened (its address), and what the game does about it: two pure decisions,
 * so that every way into the game is answered in one place.
 */

import type { Strings } from "./i18n.ts"
import { type Invite, readInvite } from "./invite.ts"

/** How the page was opened: on an invite, from the installed game's shortcut, or on nothing in particular. */
export type Opening = { readonly kind: "invite"; readonly invite: Invite } | { readonly kind: "shortcut" } | { readonly kind: "none" }

/**
 * How an address (`location.search`, `location.hash`) opened the game. The shortcut, "Zuie cuintri
 * i bot" in `client/public/manifest.webmanifest`, opens it with `?shortcut=bots`.
 */
export function readOpening(search: string, hash: string): Opening {
  const invite = readInvite(search, hash)
  if (invite) return { kind: "invite", invite }
  return new URLSearchParams(search).get("shortcut") === "bots" ? { kind: "shortcut" } : { kind: "none" }
}

/** The situation the opening is answered in. */
export interface OpeningSituation {
  /** A match is in progress (an Offline room counts): an opening never interrupts it. */
  readonly playing: boolean
  /** The player has a name: nothing starts without one. */
  readonly named: boolean
}

/** What the game does about how it was opened. */
export type OpeningAction =
  | { readonly kind: "join"; readonly code: string; readonly password: string | null }
  /** The home screen's button, "Zuie cuintri i bot": the same menu action, so the same match. */
  | { readonly kind: "start" }
  /** A message asking for the name, in the player's language, about the opening that needed it; nothing else, and nothing remembered. */
  | { readonly kind: "askName"; readonly message: (texts: Strings["net"]) => string }
  | { readonly kind: "nothing" }

/** What to do about how the game was opened. An opening acts only from the menu, never over a match in progress. */
export function decideOpening(opening: Opening, situation: OpeningSituation): OpeningAction {
  if (opening.kind === "none" || situation.playing) return { kind: "nothing" }
  if (!situation.named) {
    if (opening.kind === "shortcut") return { kind: "askName", message: (texts) => texts.shortcutNeedName }
    const { code } = opening.invite
    return { kind: "askName", message: (texts) => texts.inviteNeedName(code) }
  }
  if (opening.kind === "shortcut") return { kind: "start" }
  return { kind: "join", code: opening.invite.code, password: opening.invite.password }
}
