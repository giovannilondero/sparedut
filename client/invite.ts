/**
 * Invite links: the room code in the query, the password (for a password room) in the fragment.
 * The fragment is not part of the page request, so the password never reaches a web server or its logs.
 */

export interface Invite {
  readonly code: string
  readonly password: string | null
}

export function inviteLink(base: string, code: string, password: string | null): string {
  return `${base}?p=${code}${password ? `#${new URLSearchParams({ pw: password })}` : ""}`
}

/** The invite in an address (`location.search`, `location.hash`), if there is one. */
export function readInvite(search: string, hash: string): Invite | null {
  const code = new URLSearchParams(search).get("p")
  if (!code) return null
  return { code: code.toUpperCase(), password: new URLSearchParams(hash.replace(/^#/, "")).get("pw") }
}
