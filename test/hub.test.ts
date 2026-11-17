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

const create = { t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: "online", bots: 0, level: "pari", ff: false, primary: "cramar" }

test("names and chat lose invisible characters and the ones that flip text direction", () => {
  const hello = ClientMessage.parse({ t: "hello", name: "‮Toni\u0007", version: 1 })
  expect(hello).toEqual({ t: "hello", name: "Toni", version: 1 })
  expect(ClientMessage.safeParse({ t: "hello", name: "‮‏", version: 1 }).success).toBe(false)
  expect(ClientMessage.safeParse({ t: "chat", text: "x".repeat(1000) }).success).toBe(false)
})

test("a message that is too long is not even read", () => {
  const hub = new Hub()
  const { got, say } = connect(hub)
  got.length = 0
  say({ t: "list", pad: "x".repeat(5000) })
  expect(got).toEqual([])
})

test("whoever sends too many commands loses the extra ones, input gets through", () => {
  const hub = new Hub()
  const { got, say } = connect(hub)
  got.length = 0
  for (let i = 0; i < 30; i++) say({ t: "list" })
  // 8 in reserve minus the hello
  expect(got.filter((m) => m.t === "rooms").length).toBe(7)
  for (let i = 0; i < 30; i++) say({ t: "ping", c: i })
  expect(got.filter((m) => m.t === "pong").length).toBe(30)
})

test("a network opens no more than six rooms", () => {
  const hub = new Hub()
  const peers = Array.from({ length: 7 }, () => connect(hub))
  for (const p of peers) p.say(create)
  expect(hub.rooms.size).toBe(6)
  expect(peers[6].got.at(-1)).toEqual({ t: "error", code: "busy" })
  const other = connect(hub, "5.6.7.8")
  other.say(create)
  expect(hub.rooms.size).toBe(7)
})

const rooms = (got: ServerMessage[]) => {
  const last = got.findLast((m) => m.t === "rooms")
  return last?.t === "rooms" ? last.rooms : []
}

test("a player receives the LAN rooms of their own network and every Online room, LAN first", () => {
  const hub = new Hub()
  const online = connect(hub, "9.9.9.9")
  online.say(create)
  const foreignLan = connect(hub, "9.9.9.9")
  foreignLan.say({ ...create, reach: "lan" })
  const homeLan = connect(hub, "1.2.3.4")
  homeLan.say({ ...create, reach: "lan" })
  const me = connect(hub, "1.2.3.4")
  me.say({ t: "list" })
  const list = rooms(me.got)
  expect(list.map((r) => r.code)).toEqual([homeLan.peer.room!.code, online.peer.room!.code])
  expect(list.map((r) => r.reach)).toEqual(["lan", "online"])
  expect(list[1]).toMatchObject({ host: "Toni", mode: "bataie", map: "glemone", players: 1, max: 16 })
})

test("a LAN room refuses a join by code from another network, an Online room accepts it", () => {
  const hub = new Hub()
  const host = connect(hub, "1.2.3.4")
  host.say({ ...create, reach: "lan" })
  const lanCode = host.peer.room!.code
  const stranger = connect(hub, "5.6.7.8")
  stranger.say({ t: "join", code: lanCode, primary: "cramar" })
  expect(stranger.got.at(-1)).toEqual({ t: "error", code: "lanOnly" })
  expect(stranger.peer.room).toBeNull()
  const other = connect(hub, "9.9.9.9")
  other.say(create)
  stranger.say({ t: "join", code: other.peer.room!.code, primary: "cramar" })
  expect(stranger.peer.room?.code).toBe(other.peer.room!.code)
})

test("a full room stays in the list", () => {
  const hub = new Hub()
  const host = connect(hub, "9.9.9.9")
  host.say(create)
  for (let i = 1; i < 16; i++) connect(hub, `9.9.9.${i}`).say({ t: "join", code: host.peer.room!.code, primary: "cramar" })
  const me = connect(hub, "1.2.3.4")
  me.say({ t: "list" })
  expect(rooms(me.got)).toEqual([expect.objectContaining({ code: host.peer.room!.code, players: 16, max: 16 })])
})

test("the quick match against the bots is joinable by code but stays out of the list", () => {
  const hub = new Hub()
  const solo = connect(hub, "1.2.3.4")
  solo.say({ ...create, quick: true })
  const code = solo.peer.room!.code
  const me = connect(hub, "1.2.3.4")
  me.say({ t: "list" })
  expect(rooms(me.got)).toEqual([])
  me.say({ t: "join", code, primary: "cramar" })
  expect(me.peer.room?.code).toBe(code)
})

test("the old visibility setting is refused", () => {
  const hub = new Hub()
  const { peer, got, say } = connect(hub)
  const { reach: _, ...old } = create
  say({ ...old, visibility: "code" })
  expect(got.at(-1)).toEqual({ t: "error", code: "invalid" })
  expect(peer.room).toBeNull()
})

test("the server refuses to create an Offline room", () => {
  const hub = new Hub()
  const { peer, got, say } = connect(hub)
  say({ ...create, reach: "offline" })
  expect(got.at(-1)).toEqual({ t: "error", code: "invalid" })
  expect(peer.room).toBeNull()
  expect(hub.rooms.size).toBe(0)
})
