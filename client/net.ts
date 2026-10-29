/** La connessione al server: messaggi tipati in entrambe le direzioni. */
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "../shared/protocol.ts"

export type Listener = (msg: ServerMessage) => void

export class Net {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private pingTimer = 0
  rtt = 0
  open = false
  onClose: (() => void) | null = null

  connect(name: string): Promise<void> {
    const proto = location.protocol === "https:" ? "wss" : "ws"
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    this.ws = ws
    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        this.open = true
        this.send({ t: "hello", name, version: PROTOCOL_VERSION })
        this.pingTimer = window.setInterval(() => this.send({ t: "ping", c: performance.now(), rtt: this.rtt }), 1000)
        resolve()
      }
      ws.onerror = () => reject(new Error("Server non raggiungibile."))
      ws.onclose = () => {
        this.open = false
        clearInterval(this.pingTimer)
        this.onClose?.()
      }
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as ServerMessage
        if (msg.t === "pong") this.rtt = this.rtt === 0 ? performance.now() - msg.c : this.rtt * 0.8 + (performance.now() - msg.c) * 0.2
        for (const l of this.listeners) l(msg)
      }
    })
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  on(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
