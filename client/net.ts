/** The connection to the game server: typed messages in both directions. */
import { PROTOCOL_VERSION, type ClientMessage } from "../shared/protocol.ts"
import { HostConnection } from "./connection.ts"

export class Net extends HostConnection {
  private ws: WebSocket | null = null
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
        this.startPing()
        resolve()
      }
      ws.onerror = () => reject(new Error("Server unreachable."))
      ws.onclose = () => {
        // A connection that never opened has already failed: whoever called `connect` retries.
        // Telling `onClose` too would start a second retry for every failed one.
        if (!this.open) return reject(new Error("Server unreachable."))
        this.open = false
        this.stopPing()
        this.onClose?.()
      }
      ws.onmessage = (e) => this.receive(e.data as string)
    })
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }
}
