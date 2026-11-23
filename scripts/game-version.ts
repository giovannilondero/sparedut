/**
 * Stamps the game's version and commit into a build (`shared/version.ts`). The version is
 * `version` in `package.json`, the only place it is written; the commit is the short SHA of
 * `HEAD`. The client's build (`vite.config.ts`) and the Worker's (`alchemy.run.ts`) both take
 * their values from `buildDefines`, so the two always agree.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import type { Plugin } from "vite"
import type { GameBuild } from "../shared/version.ts"

const PACKAGE_JSON = new URL("../package.json", import.meta.url)

/** `MAJOR.MINOR.PATCH`, with an optional pre-release or build suffix. */
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/

/** The commit's short SHA: git's, or CI's `GITHUB_SHA` without git, or `unknown`. */
export function shortCommit(env: Readonly<Record<string, string | undefined>> = process.env): string {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return env.GITHUB_SHA?.slice(0, 7) || "unknown"
  }
}

/** The version in `package.json`; a missing or malformed one fails the build. */
export function packageVersion(json: string = readFileSync(PACKAGE_JSON, "utf8")): string {
  const version: unknown = (JSON.parse(json) as { version?: unknown }).version
  if (typeof version !== "string" || !SEMVER.test(version)) throw new Error(`package.json: "version" must be SemVer, not ${JSON.stringify(version)}`)
  return version
}

/** The version and commit of the build being made now. */
export function currentBuild(): GameBuild {
  return { version: packageVersion(), commit: shortCommit() }
}

/** The constants `shared/version.ts` reads, as a bundler's `define`. */
export function buildDefines(build: GameBuild): Record<string, string> {
  return { __SPAREDUT_VERSION__: JSON.stringify(build.version), __SPAREDUT_COMMIT__: JSON.stringify(build.commit) }
}

/** The version and commit in `vite build` only: the dev server stays `dev`. */
export function gameVersion(): Plugin {
  return {
    name: "sparedut-game-version",
    apply: "build",
    config: () => ({ define: buildDefines(currentBuild()) })
  }
}
