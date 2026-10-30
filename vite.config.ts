import { defineConfig } from "vite"

/** Con PUBLIC_URL (tunnel o dominio) Vite accetta anche quell'host. */
const publicHost = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).hostname : null

export default defineConfig({
  root: "client",
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ["fruits-twist-lived-holdem.trycloudflare.com", ...(publicHost ? [publicHost] : [])],
    proxy: { "/ws": { target: "ws://localhost:3007", ws: true } }
  }
})
