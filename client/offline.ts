/** The connection to an Offline room's host, which runs in a worker of this page. */
import { PROTOCOL_VERSION, type ClientMessage } from "../shared/protocol.ts"
import { HostConnection } from "./connection.ts"

export class BrowserHostConnection extends HostConnection {
  private worker: Worker | null = null
  /** The worker failed (its script or Rapier's WASM did not load). */
  onError: ((error: unknown) => void) | null = null

  /** Starts the host, if it is not running, and says hello. */
  open(name: string) {
    if (!this.worker) {
      const worker = new Worker(new URL("./host.worker.ts", import.meta.url), { type: "module", name: "sparedut-host" })
      worker.onmessage = (e: MessageEvent<string>) => this.receive(e.data)
      worker.onerror = (e) => {
        this.close()
        this.onError?.(e)
      }
      this.worker = worker
      this.startPing()
    }
    this.send({ t: "hello", name, version: PROTOCOL_VERSION })
  }

  /** Ends the host and its room: nothing of an Offline match is kept. */
  close() {
    this.stopPing()
    this.worker?.terminate()
    this.worker = null
  }

  send(msg: ClientMessage) {
    this.worker?.postMessage(JSON.stringify(msg))
  }
}
