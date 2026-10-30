import { defineConfig } from "vite"

export default defineConfig({
  root: "client",
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ["railway-courtesy-birth-have.trycloudflare.com"],
    proxy: { "/ws": { target: "ws://localhost:3007", ws: true } }
  }
})
