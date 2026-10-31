import { beforeAll, expect, test } from "bun:test"
import { Hub, type Peer } from "../server/hub.ts"
import { ClientMessage, PROTOCOL_VERSION, type ServerMessage } from "../shared/protocol.ts"
import { initPhysics } from "../shared/physics.ts"

beforeAll(() => initPhysics())

function connect(hub: Hub, network = "1.2.3.4") {
  const got: ServerMessage[] = []
  const peer: Peer = { network: { key: network, lan: false }, send: (d) => got.push(JSON.parse(d)), id: null, name: "", room: null }
  hub.open(peer)
  const say = (msg: object) => hub.message(peer, JSON.stringify(msg))
  say({ t: "hello", name: "Toni", version: PROTOCOL_VERSION })
  return { peer, got, say }
}

const create = { t: "create", mode: "bataie", map: "glemone", minutes: 10, visibility: "code", bots: 0, level: "pari", ff: false, primary: "cramar" }

test("nomi e chat perdono i caratteri invisibili e quelli che rigirano il testo", () => {
  const hello = ClientMessage.parse({ t: "hello", name: "‮Toni\u0007", version: 1 })
  expect(hello).toEqual({ t: "hello", name: "Toni", version: 1 })
  expect(ClientMessage.safeParse({ t: "hello", name: "‮‏", version: 1 }).success).toBe(false)
  expect(ClientMessage.safeParse({ t: "chat", text: "x".repeat(1000) }).success).toBe(false)
})

test("un messaggio troppo lungo non viene neanche letto", () => {
  const hub = new Hub()
  const { got, say } = connect(hub)
  got.length = 0
  say({ t: "list", pad: "x".repeat(5000) })
  expect(got).toEqual([])
})

test("chi manda troppi comandi perde quelli in più, l'input passa", () => {
  const hub = new Hub()
  const { got, say } = connect(hub)
  got.length = 0
  for (let i = 0; i < 30; i++) say({ t: "list" })
  // 8 di scorta meno l'hello
  expect(got.filter((m) => m.t === "rooms").length).toBe(7)
  for (let i = 0; i < 30; i++) say({ t: "ping", c: i })
  expect(got.filter((m) => m.t === "pong").length).toBe(30)
})

test("una rete non apre più di sei stanze", () => {
  const hub = new Hub()
  const peers = Array.from({ length: 7 }, () => connect(hub))
  for (const p of peers) p.say(create)
  expect(hub.rooms.size).toBe(6)
  expect(peers[6].got.at(-1)).toEqual({ t: "error", code: "busy" })
  const other = connect(hub, "5.6.7.8")
  other.say(create)
  expect(hub.rooms.size).toBe(7)
})
