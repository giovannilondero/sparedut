/**
 * A host driven by protocol messages, as a client drives it, with a clock the test moves by hand:
 * the game server's `Hub` or the in-browser host.
 */
import type { Clock, Hub, Peer } from "../server/hub.ts"
import { PROTOCOL_VERSION, type ServerMessage } from "../shared/protocol.ts"

export type Harness = ReturnType<typeof harness>
export type Client = ReturnType<Harness["connect"]>

export function harness(make: (clock: Clock) => Hub) {
  let clock = 0
  const hub = make(() => clock)
  const connect = (network = "1.2.3.4") => {
    const got: ServerMessage[] = []
    const peer: Peer = { network: { key: network, lan: false }, send: (d) => got.push(JSON.parse(d)), id: null, name: "", room: null }
    hub.open(peer)
    const say = (msg: object) => hub.message(peer, JSON.stringify(msg))
    say({ t: "hello", name: "Toni", version: PROTOCOL_VERSION })
    return { peer, got, say, last: <T extends ServerMessage["t"]>(t: T) => got.findLast((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined }
  }
  /** Lets `ticks` ticks of real time pass, in small steps as a timer would. */
  const play = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      clock += 1000 / 60 + 1e-6
      hub.update()
    }
  }
  return { hub, connect, play }
}
