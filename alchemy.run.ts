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
import { dirname, join } from "node:path"

/**
 * Rapier "compat" ships its WASM as base64 and compiles it at runtime, which Workers don't
 * allow. Here the base64 gives way to the package's `.wasm` file (the same bytes),
 * which the bundler loads as a precompiled module: `RAPIER.init()` stays as it is.
 */
const rapierWasm = {
  name: "sparedut:rapier-wasm",
  transform: {
    filter: { id: /rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/ },
    handler(code: string, id: string) {
      const inline = /[\w$]+\.toByteArray\("[A-Za-z0-9+/=]+"\)(\.buffer)?/g
      const found = code.match(inline)?.length ?? 0
      if (found !== 1) throw new Error(`Rapier: expected a single inline WASM in ${id}, found ${found}`)
      const wasm = JSON.stringify(join(dirname(id), "rapier_wasm3d_bg.wasm"))
      return `import rapierWasm from ${wasm};\n${code.replace(inline, "rapierWasm")}`
    }
  }
}

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
      build: { input: { plugins: [rapierWasm] } },
      domain: process.env.DEPLOY_DOMAIN || undefined,
      observability: { enabled: true }
    })
    return { url: site.url }
  })
)
