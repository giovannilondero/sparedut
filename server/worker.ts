/**
 * Il deploy su Cloudflare (`alchemy.run.ts`): il client buildato è servito come asset statico,
 * le partite vivono in un solo Durable Object con lo stesso `Hub` del server Bun.
 * A questo Worker arriva solo `/ws`.
 */
import { DurableObject } from "cloudflare:workers"
import { initPhysics } from "../shared/physics.ts"
import { Hub, type Peer } from "./hub.ts"
import { networkOf } from "./network.ts"

/**
 * Un telefono che va in standby non saluta: smette e basta di parlare. Il client manda un
 * ping al secondo, ma Chrome sveglia una scheda nascosta da un po' solo una volta al minuto.
 */
const SILENT_MS = 90_000
/** Tutte le stanze stanno in un oggetto solo: oltre questo numero di connessioni rifiutiamo. */
const MAX_CONNECTIONS = 300
/** Una LAN party dietro lo stesso router riempie una stanza; uno script che apre socket no. */
const MAX_CONNECTIONS_PER_NETWORK = 20
/** Come `setInterval(update, 2)` del server Bun, ma ogni risveglio qui costa di più. */
const LOOP_MS = 4

/**
 * Un Durable Object nasce vicino alla prima richiesta e lì resta per sempre (balon ne ha
 * avuto uno a 100 ms oltre l'edge): questo nasce in Europa occidentale. Cambiare nome crea
 * un oggetto nuovo, ed è l'unico modo per spostarlo.
 */
const OBJECT_NAME = "partidis-weur"

export interface Env {
  readonly PARTIDIS: DurableObjectNamespace<Partidis>
}

interface Connection {
  readonly peer: Peer
  /** Quando ha parlato l'ultima volta, input o ping. */
  seen: number
}

/**
 * Tutte le stanze in un oggetto solo, come il processo Bun: chi cerca le partite della propria
 * rete le vede tutte. Resta in memoria finché c'è qualcuno connesso; niente viene salvato,
 * quindi un deploy chiude le partite in corso.
 */
export class Partidis extends DurableObject<Env> {
  private readonly hub = new Hub()
  private readonly sockets = new Map<WebSocket, Connection>()
  private loop: ReturnType<typeof setInterval> | null = null

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 })
    // Il gioco si apre solo dalla sua pagina: un altro sito non usa questo server dal browser di chi lo visita.
    const origin = request.headers.get("Origin")
    if (origin && URL.parse(origin)?.host !== new URL(request.url).host) return new Response("Forbidden", { status: 403 })
    // Per rete, non per indirizzo: con IPv6 ogni casa ha milioni di indirizzi (`networkOf` guarda il /64).
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
      // Un'eccezione qui riavvierebbe l'oggetto, chiudendo le partite di tutti: paga solo chi l'ha causata.
      try {
        this.hub.message(peer, event.data)
      } catch (error) {
        console.error("Messaggio non gestito:", error)
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

  /** Avanza le stanze finché c'è qualcuno; poi si ferma e lascia dormire l'oggetto. */
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
