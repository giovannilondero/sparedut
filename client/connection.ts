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
const smoothRtt = (rtt: number, sample: number) => (rtt === 0 ? sample : rtt * 0.8 + sample * 0.2)

/** Who hears a connection's messages. */
class Listeners {
  private readonly set = new Set<Listener>()

  on(listener: Listener) {
    this.set.add(listener)
    return () => void this.set.delete(listener)
  }

  tell(msg: ServerMessage) {
    for (const l of this.set) l(msg)
  }
}

/**
 * What the connection to either host does the same way: it hands every message to its listeners,
 * pings the host once a second while up, and smooths the round trip each pong measures.
 * The transport (a WebSocket, a worker) is the subclass's.
 */
export abstract class HostConnection implements Connection {
  private readonly listeners = new Listeners()
  private pingTimer = 0
  rtt = 0

  abstract send(msg: ClientMessage): void

  on(listener: Listener) {
    return this.listeners.on(listener)
  }

  /** A message from the host, as its transport delivered it. */
  protected receive(data: string) {
    const msg = JSON.parse(data) as ServerMessage
    if (msg.t === "pong") this.rtt = smoothRtt(this.rtt, performance.now() - msg.c)
    this.listeners.tell(msg)
  }

  /** The host is up: ping it once a second. */
  protected startPing() {
    clearInterval(this.pingTimer)
    this.pingTimer = window.setInterval(() => this.send({ t: "ping", c: performance.now(), rtt: this.rtt }), 1000)
  }

  /** The host is gone: no more pings, and no round trip until it is back. */
  protected stopPing() {
    clearInterval(this.pingTimer)
    this.rtt = 0
  }
}

/**
 * Whether a message belongs to a room: it starts, replaces, feeds or ends a match, so only the
 * host holding the current room may deliver it. The others (room list, address, ping) come from
 * either host. A new message kind does not compile until it is placed here.
 */
const OF_A_ROOM = {
  welcome: false,
  public: false,
  rooms: false,
  pong: false,
  joined: true,
  room: true,
  left: true,
  snap: true,
  board: true,
  chat: true,
  error: true
} as const satisfies Record<ServerMessage["t"], boolean>

/**
 * The connection the game holds for its whole life: it forwards to whichever host has the
 * current room, and hears both (the server's room list keeps coming while playing offline).
 * A host that does not hold the current room cannot start, replace or feed a match: its room
 * messages are dropped, and a room it put the player in is left at once.
 */
export class Link implements Connection {
  private host: Connection
  private readonly listeners = new Listeners()

  constructor(hosts: readonly Connection[]) {
    this.host = hosts[0]
    for (const h of hosts)
      h.on((msg) => {
        if (OF_A_ROOM[msg.t] && h !== this.host) {
          if (msg.t === "joined") h.send({ t: "leave" })
          return
        }
        this.listeners.tell(msg)
      })
  }

  /** The host that gets what the player sends from now on, and the only one whose rooms are heard. */
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
    return this.listeners.on(listener)
  }

  get rtt() {
    return this.host.rtt
  }
}
