/**
 * The Cloudflare deploy with Alchemy: the built client as static assets, matches in a
 * Durable Object (`server/worker.ts`). Alchemy's state lives in the Cloudflare account, so
 * a deploy from your own computer and one from CI see the same resources.
 *
 *   pnpm cf:deploy                          # https://sparedut.<account>.workers.dev
 *   DEPLOY_DOMAIN=sparedut.example.com pnpm cf:deploy
 */
import * as Alchemy from "alchemy"
import * as Cloudflare from "@alchemy.run/cloudflare"
import * as Effect from "effect/Effect"
import { rapierWithWasmFile } from "./scripts/rapier-wasm.ts"
import { buildDefines, currentBuild } from "./scripts/game-version.ts"

export default Alchemy.Stack(
  "Sparedut",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state()
  },
  Effect.gen(function* () {
    const site = yield* Cloudflare.Website.StaticSite("Sparedut", {
      command: "pnpm build",
      outdir: "dist",
      main: "./server/worker.ts",
      compatibility: { date: "2026-10-01" },
      assets: {
        // Every unknown path is the game (`?p=CODE` invite links included).
        notFoundHandling: "single-page-application",
        // Only the game socket reaches the Worker: static files don't, and stay free.
        runWorkerFirst: ["/ws"]
      },
      env: { PARTIDIS: Cloudflare.DurableObject("PARTIDIS", { className: "Partidis" }) },
      // The Worker gets the same version and commit as the client (`shared/version.ts`).
      build: {
        input: {
          resolve: { alias: { "@dimforge/rapier3d-compat": rapierWithWasmFile("module") } },
          transform: { define: buildDefines(currentBuild()) }
        }
      },
      domain: process.env.DEPLOY_DOMAIN || undefined,
      observability: { enabled: true }
    })
    return { url: site.url }
  })
)
