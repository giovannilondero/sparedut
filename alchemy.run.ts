/**
 * Il deploy su Cloudflare con Alchemy: il client buildato come asset statici, le partite in un
 * Durable Object (`server/worker.ts`). Lo stato di Alchemy sta nell'account Cloudflare, così
 * il deploy dal proprio computer e quello della CI vedono le stesse risorse.
 *
 *   pnpm cf:deploy                          # https://sparedut.<account>.workers.dev
 *   DEPLOY_DOMAIN=sparedut.example.com pnpm cf:deploy
 */
import * as Alchemy from "alchemy"
import * as Cloudflare from "@alchemy.run/cloudflare"
import * as Effect from "effect/Effect"
import { dirname, join } from "node:path"

/**
 * Rapier "compat" porta il suo WASM come base64 e lo compila a runtime, cosa che i Worker non
 * permettono. Qui il base64 lascia il posto al file `.wasm` del pacchetto (gli stessi byte),
 * che il bundler carica come modulo già compilato: `RAPIER.init()` resta com'è.
 */
const rapierWasm = {
  name: "sparedut:rapier-wasm",
  transform: {
    filter: { id: /rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/ },
    handler(code: string, id: string) {
      const inline = /[\w$]+\.toByteArray\("[A-Za-z0-9+/=]+"\)(\.buffer)?/g
      const found = code.match(inline)?.length ?? 0
      if (found !== 1) throw new Error(`Rapier: atteso un solo WASM inline in ${id}, trovati ${found}`)
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
        // Ogni percorso sconosciuto è il gioco (i link d'invito `?p=CODICE` compresi).
        notFoundHandling: "single-page-application",
        // Solo il socket di gioco arriva al Worker: i file statici no, e restano gratis.
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
