/**
 * The public address of the game, written into the page at build time: the link previews
 * (Open Graph, X/Twitter) need absolute addresses. It is `https://` + `DEPLOY_DOMAIN`, the
 * domain the deploy uses (`alchemy.run.ts`), or the public game's when it is not set, so a
 * LAN or Bun build still advertises the public game and never an address only its network
 * reaches.
 *
 * `client/index.html` writes `%DEPLOY_ORIGIN%` where an absolute address goes; the same
 * metadata serves every address, invites included: nothing in it is per room.
 */
import type { Plugin } from "vite"

/** The public game's domain, when the deploy names none. */
export const PUBLIC_DOMAIN = "sparedut.giovannilondero.dev"

const PLACEHOLDER = "%DEPLOY_ORIGIN%"

/** `https://` and the deploy's domain, with no trailing slash. */
export function deployOrigin(env: Readonly<Record<string, string | undefined>>): string {
  return `https://${env.DEPLOY_DOMAIN?.trim() || PUBLIC_DOMAIN}`
}

/** The page with every placeholder replaced by the deploy's origin. */
export function pageForDeploy(html: string, env: Readonly<Record<string, string | undefined>>): string {
  return html.replaceAll(PLACEHOLDER, deployOrigin(env))
}

/** Writes the deploy's origin into `index.html`, in the dev server and in every build. */
export function deployOriginInPage(): Plugin {
  return {
    name: "sparedut-deploy-origin",
    transformIndexHtml: (html) => pageForDeploy(html, process.env)
  }
}
