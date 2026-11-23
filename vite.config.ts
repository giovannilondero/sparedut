import { defineConfig } from "vite"
import { rapierWithWasmFile } from "./scripts/rapier-wasm.ts"
import { deployOriginInPage } from "./scripts/deploy-origin.ts"
import { serviceWorker } from "./scripts/service-worker.ts"
import { gameVersion } from "./scripts/game-version.ts"

/** With PUBLIC_URL (tunnel or domain) Vite also accepts that host. */
const publicHost = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).hostname : null

export default defineConfig({
  root: "client",
  // The public address in the page's link previews, in every build; `dist/sw.js` and its
  // precache list, made from the build output: production only; the game's version and commit in
  // the bundle, production only too (`shared/version.ts`).
  plugins: [deployOriginInPage(), serviceWorker(), gameVersion()],
  // Rapier's WASM as its own file, not 4 MB of base64 in both the page's and the host worker's bundle.
  resolve: { alias: { "@dimforge/rapier3d-compat": rapierWithWasmFile("url") } },
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: {
    host: true,
    port: 5173,
    ...(publicHost ? { allowedHosts: [publicHost] } : {}),
    // The game server's port: `PORT` as the server reads it, so a second checkout can run its own pair.
    proxy: { "/ws": { target: `ws://localhost:${process.env.PORT ?? 3007}`, ws: true } }
  }
})
