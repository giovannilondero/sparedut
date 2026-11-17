/** The connection to an Offline room's host, which runs in a worker of this page. */
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "../shared/protocol.ts"
import { smoothRtt, type Connection, type Listener } from "./connection.ts"

export class BrowserHost implements Connection {
  private worker: Worker | null = null
  private readonly listeners = new Set<Listener>()
  private pingTimer = 0
  rtt = 0
  /** The worker failed (its script or Rapier's WASM did not load). */
  onError: ((error: unknown) => void) | null = null

  /** Starts the host, if it is not running, and says hello. */
  open(name: string) {
    if (!this.worker) {
      const worker = new Worker(new URL("./host.worker.ts", import.meta.url), { type: "module", name: "sparedut-host" })
      worker.onmessage = (e: MessageEvent<string>) => {
        const msg = JSON.parse(e.data) as ServerMessage
        if (msg.t === "pong") this.rtt = smoothRtt(this.rtt, performance.now() - msg.c)
        for (const l of this.listeners) l(msg)
      }
      worker.onerror = (e) => {
        this.close()
        this.onError?.(e)
      }
      this.worker = worker
      this.pingTimer = window.setInterval(() => this.send({ t: "ping", c: performance.now(), rtt: this.rtt }), 1000)
    }
    this.send({ t: "hello", name, version: PROTOCOL_VERSION })
  }

  /** Ends the host and its room: nothing of an Offline match is kept. */
  close() {
    clearInterval(this.pingTimer)
    this.worker?.terminate()
    this.worker = null
    this.rtt = 0
  }

  send(msg: ClientMessage) {
    this.worker?.postMessage(JSON.stringify(msg))
  }

  on(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
