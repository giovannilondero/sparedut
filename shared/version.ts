/**
 * The game's version, the one people read and say ("0.1.0"), and the commit it was built from.
 * Both come in at build time (`scripts/game-version.ts`): `vite build` writes them into the client
 * bundle and `alchemy.run.ts` into the Worker's, from `version` in `package.json` and the git
 * commit. The dev server and the Bun server have neither, so they are `dev`.
 *
 * Not `PROTOCOL_VERSION` (`shared/protocol.ts`): that one says which client and server can play
 * together, and a release does not have to change it.
 */

declare const __SPAREDUT_VERSION__: string | undefined
declare const __SPAREDUT_COMMIT__: string | undefined

export interface GameBuild {
  /** SemVer from `package.json`, without the `v`. */
  readonly version: string
  /** The short commit SHA: two builds of the same version told apart. */
  readonly commit: string
}

/** This build's version and commit, or `null` where nothing was stamped (dev server, Bun server, tests). */
export const GAME_BUILD: GameBuild | null =
  typeof __SPAREDUT_VERSION__ === "string" && typeof __SPAREDUT_COMMIT__ === "string" ? { version: __SPAREDUT_VERSION__, commit: __SPAREDUT_COMMIT__ } : null

/** What the menu shows: `v0.1.0 · f25736c`, or `dev`. The same in every language. */
export function versionLabel(build: GameBuild | null): string {
  return build ? `v${build.version} · ${build.commit}` : "dev"
}
