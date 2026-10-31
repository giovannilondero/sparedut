/**
 * Sparedût server: the game WebSocket on /ws and, in production, the built client.
 * On a LAN just start it on one computer: the others open http://COMPUTER-IP:3007.
 */
import { existsSync, readFileSync } from "node:fs"
import { networkInterfaces } from "node:os"
import { join } from "node:path"
import { isLocalHost } from "../shared/hosts.ts"
import { MAP_IDS, MAPS } from "../shared/maps/index.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import { Hub, type Peer } from "./hub.ts"
import { warmNavGraph } from "./nav.ts"
import { networkOf, type NetworkId } from "./network.ts"

const PORT = Number(process.env.PORT ?? 3007)
const TRUST_PROXY = process.env.TRUST_PROXY === "1"
const DIST = join(import.meta.dir, "../dist")

interface SocketData {
  network: NetworkId
  peer: Peer | null
}

/** The security headers from the `/*` block of `_headers`, the same ones Cloudflare sets. */
function staticHeaders(): Record<string, string> {
  const file = join(DIST, "_headers")
  if (!existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const header = /^\s+([\w-]+):\s*(.+)$/.exec(line)
    if (header) out[header[1]] = header[2].trim()
  }
  return out
}
const HEADERS = staticHeaders()

await initPhysics()
const hub = new Hub()
if (process.env.PUBLIC_URL) hub.setPublicUrl(new URL(process.env.PUBLIC_URL).origin)

/**
 * Whoever comes through a tunnel or a domain (Cloudflare, reverse proxy) carries the public
 * address in Host: we remember it for the invite links of whoever plays from localhost.
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

/**
 * The player's IP. From a proxy on the same machine (cloudflared, Vite) or with TRUST_PROXY we
 * trust what the proxy says: otherwise the whole tunnel would look like the local network and anyone
 * would see LAN matches. In X-Forwarded-For the last address counts, the one added by the
 * proxy: anyone can write the first one.
 */
function clientAddress(req: Request, peer: string | undefined) {
  const local = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1"
  if (!TRUST_PROXY && !local) return peer
  const cloudflare = req.headers.get("cf-connecting-ip")?.trim()
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
  return cloudflare || forwarded || peer
}

Bun.serve<SocketData>({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === "/ws") {
      learnPublicUrl(req)
      const network = networkOf(clientAddress(req, server.requestIP(req)?.address))
      if (server.upgrade(req, { data: { network, peer: null } })) return
      return new Response("Upgrade failed", { status: 400 })
    }
    if (existsSync(DIST)) {
      const path = url.pathname === "/" ? "/index.html" : url.pathname
      const file = Bun.file(join(DIST, path))
      return file.exists().then((ok) => new Response(ok ? file : Bun.file(join(DIST, "index.html")), { headers: HEADERS }))
    }
    return new Response("Client not built: use `pnpm dev` and open the Vite port (5173).", { status: 404 })
  },
  websocket: {
    // The client's longest message fits in a couple of KB: a huge frame isn't even worth reading.
    maxPayloadLength: 4096,
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

// A map's bot graph costs a few seconds of computation: better to do it right away, in
// small pieces (one point at a time, between ticks), than at the first match on that map.
const warm = [...MAP_IDS]
let warming: PhysicsWorld | null = null
const warmNext = () => {
  if (!warming) {
    const id = warm.shift()
    if (!id) return
    warming = createPhysicsWorld(MAPS[id])
  }
  if (warmNavGraph(warming)) warming = null
  setTimeout(warmNext, 5)
}
setTimeout(warmNext, 200)

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address)
console.log(`🔔 Sparedût: server on :${PORT}`)
for (const ip of lan) console.log(`   On the local network: http://${ip}:${existsSync(DIST) ? PORT : 5173}`)
if (!process.env.PUBLIC_URL) console.log("   For invite links from outside: PUBLIC_URL=https://… (or just have someone join through the tunnel)")
