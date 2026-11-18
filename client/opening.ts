/**
 * How the page was opened (its address), and what the game does about it: two pure decisions,
 * so that every way into the game is answered in one place.
 */

import { type Invite, readInvite } from "./invite.ts"

/** How the page was opened: on an invite, or on nothing in particular. */
export type Opening = { readonly kind: "invite"; readonly invite: Invite } | { readonly kind: "none" }

/** How an address (`location.search`, `location.hash`) opened the game. */
export function readOpening(search: string, hash: string): Opening {
  const invite = readInvite(search, hash)
  return invite ? { kind: "invite", invite } : { kind: "none" }
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
  /** A message asking for the name, about the opening that needed it; nothing else, and nothing remembered. */
  | { readonly kind: "askName"; readonly opening: Exclude<Opening, { kind: "none" }> }
  | { readonly kind: "nothing" }

/** What to do about how the game was opened. An opening acts only from the menu, never over a match in progress. */
export function decideOpening(opening: Opening, situation: OpeningSituation): OpeningAction {
  if (opening.kind === "none" || situation.playing) return { kind: "nothing" }
  if (!situation.named) return { kind: "askName", opening }
  return { kind: "join", code: opening.invite.code, password: opening.invite.password }
}
