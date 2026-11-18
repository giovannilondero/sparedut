import { defineConfig } from "vite"
import { rapierWithWasmFile } from "./scripts/rapier-wasm.ts"
import { serviceWorker } from "./scripts/service-worker.ts"

/** With PUBLIC_URL (tunnel or domain) Vite also accepts that host. */
const publicHost = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).hostname : null

export default defineConfig({
  root: "client",
  // `dist/sw.js` and its precache list, made from the build output: production only.
  plugins: [serviceWorker()],
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
