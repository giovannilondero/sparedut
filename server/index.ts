/**
 * Server di Sparedût: WebSocket di gioco su /ws e, in produzione, il client buildato.
 * In LAN basta avviarlo su un computer: gli altri aprono http://IP-DEL-COMPUTER:3007.
 */
import { existsSync } from "node:fs"
import { networkInterfaces } from "node:os"
import { join } from "node:path"
import { isLocalHost } from "../shared/hosts.ts"
import { initPhysics } from "../shared/physics.ts"
import { Hub, type Peer } from "./hub.ts"
import { networkOf, type NetworkId } from "./network.ts"

const PORT = Number(process.env.PORT ?? 3007)
const TRUST_PROXY = process.env.TRUST_PROXY === "1"
const DIST = join(import.meta.dir, "../dist")

interface SocketData {
  network: NetworkId
  peer: Peer | null
}

await initPhysics()
const hub = new Hub()
if (process.env.PUBLIC_URL) hub.setPublicUrl(new URL(process.env.PUBLIC_URL).origin)

/**
 * Chi arriva da un tunnel o da un dominio (Cloudflare, reverse proxy) porta nell'Host
 * l'indirizzo pubblico: lo ricordiamo per i link d'invito di chi gioca da localhost.
 */
function learnPublicUrl(req: Request) {
  if (process.env.PUBLIC_URL) return
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim()
  if (!host) return
  const hostname = new URL(`http://${host}`).hostname
  if (isLocalHost(hostname)) return
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? (/^[\d.]+$/.test(hostname) ? "http" : "https")
  hub.setPublicUrl(`${proto}://${host}`)
}

Bun.serve<SocketData>({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === "/ws") {
      learnPublicUrl(req)
      const forwarded = TRUST_PROXY ? req.headers.get("x-forwarded-for")?.split(",")[0].trim() : undefined
      const network = networkOf(forwarded ?? server.requestIP(req)?.address)
      if (server.upgrade(req, { data: { network, peer: null } })) return
      return new Response("Upgrade failed", { status: 400 })
    }
    if (existsSync(DIST)) {
      const path = url.pathname === "/" ? "/index.html" : url.pathname
      const file = Bun.file(join(DIST, path))
      return file.exists().then((ok) => new Response(ok ? file : Bun.file(join(DIST, "index.html"))))
    }
    return new Response("Client non buildato: usa `pnpm dev` e apri la porta di Vite (5173).", { status: 404 })
  },
  websocket: {
    open(ws) {
      const peer: Peer = { network: ws.data.network, send: (d) => ws.send(d), id: null, name: "", room: null }
      ws.data.peer = peer
      hub.open(peer)
    },
    message(ws, raw) {
      if (ws.data.peer) hub.message(ws.data.peer, String(raw))
    },
    close(ws) {
      if (ws.data.peer) hub.close(ws.data.peer)
    }
  }
})

setInterval(() => hub.update(), 2)

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address)
console.log(`🔔 Sparedût: server su :${PORT}`)
for (const ip of lan) console.log(`   In rete locale: http://${ip}:${existsSync(DIST) ? PORT : 5173}`)
if (!process.env.PUBLIC_URL) console.log("   Per i link d'invito da fuori: PUBLIC_URL=https://… (o basta che qualcuno entri dal tunnel)")
