/**
 * The Cloudflare deploy (`alchemy.run.ts`): the built client is served as static assets,
 * matches live in a single Durable Object with the same `Hub` as the Bun server.
 * Only `/ws` reaches this Worker.
 */
import { DurableObject } from "cloudflare:workers"
import { initPhysics } from "../shared/physics.ts"
import { Hub, type Peer } from "./hub.ts"
import { networkOf } from "./network.ts"

/**
 * A phone going to standby doesn't say goodbye: it just stops talking. The client sends a
 * ping every second, but Chrome wakes a tab that's been hidden for a while only once a minute.
 */
const SILENT_MS = 90_000
/** All rooms live in a single object: beyond this many connections we refuse. */
const MAX_CONNECTIONS = 300
/** A LAN party behind the same router fills a room; a script opening sockets doesn't. */
const MAX_CONNECTIONS_PER_NETWORK = 20
/** Like the Bun server's `setInterval(update, 2)`, but every wake-up costs more here. */
const LOOP_MS = 4

/**
 * A Durable Object is created near the first request and stays there forever (balon had
 * one 100 ms past the edge): this one is created in Western Europe. Changing the name creates
 * a new object, and that's the only way to move it.
 */
const OBJECT_NAME = "partidis-weur"

export interface Env {
  readonly PARTIDIS: DurableObjectNamespace<Partidis>
}

interface Connection {
  readonly peer: Peer
  /** When it last spoke, input or ping. */
  seen: number
}

/**
 * All rooms in a single object, like the Bun process: whoever looks for matches on their own
 * network sees them all. It stays in memory while someone is connected; nothing is saved,
 * so a deploy ends the matches in progress.
 */
export class Partidis extends DurableObject<Env> {
  private readonly hub = new Hub()
  private readonly sockets = new Map<WebSocket, Connection>()
  private loop: ReturnType<typeof setInterval> | null = null

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 })
    // The game only opens from its own page: another site can't use this server from its visitors' browsers.
    const origin = request.headers.get("Origin")
    if (origin && URL.parse(origin)?.host !== new URL(request.url).host) return new Response("Forbidden", { status: 403 })
    // Per network, not per address: with IPv6 every home has millions of addresses (`networkOf` looks at the /64).
    const network = networkOf(request.headers.get("CF-Connecting-IP") ?? undefined)
    if (this.sockets.size >= MAX_CONNECTIONS || this.connectionsFrom(network.key) >= MAX_CONNECTIONS_PER_NETWORK) {
      return new Response("Too many connections", { status: 429 })
    }
    await initPhysics()
    this.hub.setPublicUrl(new URL(request.url).origin)

    const { 0: client, 1: socket } = new WebSocketPair()
    socket.accept()
    const peer: Peer = {
      network,
      send: (data) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(data)
      },
      id: null,
      name: "",
      room: null
    }
    const connection: Connection = { peer, seen: performance.now() }
    this.sockets.set(socket, connection)
    this.hub.open(peer)
    socket.addEventListener("message", (event) => {
      connection.seen = performance.now()
      if (typeof event.data !== "string") return
      // An exception here would restart the object, ending everyone's matches: only whoever caused it pays.
      try {
        this.hub.message(peer, event.data)
      } catch (error) {
        console.error("Unhandled message:", error)
        this.drop(socket)
        socket.close(1011, "error")
      }
    })
    socket.addEventListener("close", () => this.drop(socket))
    socket.addEventListener("error", () => this.drop(socket))
    this.start()
    return new Response(null, { status: 101, webSocket: client })
  }

  private connectionsFrom(network: string) {
    let count = 0
    for (const connection of this.sockets.values()) if (connection.peer.network.key === network) count++
    return count
  }

  private drop(socket: WebSocket) {
    const connection = this.sockets.get(socket)
    if (!connection) return
    this.sockets.delete(socket)
    this.hub.close(connection.peer)
  }

  /** Advances the rooms while someone is around; then stops and lets the object sleep. */
  private start() {
    if (this.loop) return
    this.loop = setInterval(() => {
      this.hub.update()
      const now = performance.now()
      for (const [socket, connection] of this.sockets) {
        if (now - connection.seen <= SILENT_MS) continue
        this.drop(socket)
        socket.close(1001, "silent")
      }
      if (this.hub.idle && this.loop) {
        clearInterval(this.loop)
        this.loop = null
      }
    }, LOOP_MS)
  }
}

export default {
  fetch: (request, env) => {
    if (new URL(request.url).pathname !== "/ws") return new Response("Not found", { status: 404 })
    return env.PARTIDIS.getByName(OBJECT_NAME, { locationHint: "weur" }).fetch(request)
  }
} satisfies ExportedHandler<Env>
