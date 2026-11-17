/**
 * How the client talks to whoever hosts its room: the game server (`Net`) or the host in the
 * player's own browser (`BrowserHost`). Both speak the same protocol; the game only sees this.
 */
import type { ClientMessage, ServerMessage } from "../shared/protocol.ts"

export type Listener = (msg: ServerMessage) => void

export interface Connection {
  send(msg: ClientMessage): void
  /** Subscribes to every message from the host; returns the unsubscribe. */
  on(listener: Listener): () => void
  /** Round trip in milliseconds, smoothed. */
  readonly rtt: number
}

/** Smooths a new round-trip sample into the previous estimate. */
export const smoothRtt = (rtt: number, sample: number) => (rtt === 0 ? sample : rtt * 0.8 + sample * 0.2)

/**
 * The connection the game holds for its whole life: it forwards to whichever host has the
 * current room, and hears both (the server's room list keeps coming while playing offline).
 */
export class Link implements Connection {
  private host: Connection

  constructor(private readonly hosts: readonly Connection[]) {
    this.host = hosts[0]
  }

  /** The host that gets what the player sends from now on. */
  use(host: Connection) {
    this.host = host
  }

  uses(host: Connection) {
    return this.host === host
  }

  send(msg: ClientMessage) {
    this.host.send(msg)
  }

  on(listener: Listener) {
    const off = this.hosts.map((h) => h.on(listener))
    return () => off.forEach((f) => f())
  }

  get rtt() {
    return this.host.rtt
  }
}
