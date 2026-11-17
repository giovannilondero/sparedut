import { defineConfig } from "vite"

/** With PUBLIC_URL (tunnel or domain) Vite also accepts that host. */
const publicHost = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).hostname : null

export default defineConfig({
  root: "client",
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: {
    host: true,
    port: 5173,
    ...(publicHost ? { allowedHosts: [publicHost] } : {}),
    // The game server's port: `PORT` as the server reads it, so a second checkout can run its own pair.
    proxy: { "/ws": { target: `ws://localhost:${process.env.PORT ?? 3007}`, ws: true } }
  }
})
