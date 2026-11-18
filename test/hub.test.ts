import { beforeAll, expect, spyOn, test } from "bun:test"
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

const create = { t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: "online", access: { kind: "open" }, bots: 0, level: "pari", ff: false, primary: "cramar" }

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

test("every room on the server appears in the list of a player who can reach it", () => {
  const hub = new Hub()
  const kinds = [
    create,
    { ...create, reach: "lan" },
    { ...create, access: { kind: "password", password: "Cjavedal-7q" } },
    { ...create, reach: "lan", access: { kind: "password", password: "Cjavedal-7q" } },
    { ...create, bots: 7, ff: true },
    // What the home screen's button used to send: the flag is gone, the room is a room like any other.
    { ...create, quick: true }
  ]
  const hosts = kinds.map((msg) => {
    const host = connect(hub, "1.2.3.4")
    host.say(msg)
    return host
  })
  const me = connect(hub, "1.2.3.4")
  me.say({ t: "list" })
  const lan = [hosts[1], hosts[3]].map((h) => h.peer.room!.code)
  const online = [hosts[0], hosts[2], hosts[4], hosts[5]].map((h) => h.peer.room!.code)
  expect(rooms(me.got).map((r) => r.code)).toEqual([...lan, ...online])
})

test("the old visibility setting is refused", () => {
  const hub = new Hub()
  const { peer, got, say } = connect(hub)
  const { reach: _, ...old } = create
  say({ ...old, visibility: "code" })
  expect(got.at(-1)).toEqual({ t: "error", code: "invalid" })
  expect(peer.room).toBeNull()
})

// ---------------------------------------------------------------- access

const PASSWORD = "Cjavedal-7q"
const withPassword = { ...create, access: { kind: "password", password: PASSWORD } }

test("the room list says which rooms need a password, and an open room does not", () => {
  const hub = new Hub()
  connect(hub, "9.9.9.9").say(create)
  connect(hub, "9.9.9.8").say(withPassword)
  const me = connect(hub, "1.2.3.4")
  me.say({ t: "list" })
  expect(rooms(me.got).map((r) => r.reach !== "offline" && r.access)).toEqual(["open", "password"])
})

test("a password of 1 to 32 characters after cleaning is accepted, an empty or longer one is refused", () => {
  const hub = new Hub()
  const tries = ["", "  ‮ ", "x".repeat(33), "x", ` ${"x".repeat(32)}\u0007 `]
  const results = tries.map((password) => {
    const host = connect(hub, `7.7.7.${password.length}`)
    host.say({ ...withPassword, access: { kind: "password", password } })
    return host.peer.room ? "created" : host.got.at(-1)
  })
  const invalid = { t: "error", code: "invalid" } as const
  expect(results).toEqual([invalid, invalid, invalid, "created", "created"])
})

test("joining a password room asks for the password, refuses a wrong one and accepts the right one", () => {
  const hub = new Hub()
  const host = connect(hub, "9.9.9.9")
  host.say(withPassword)
  const code = host.peer.room!.code
  const me = connect(hub, "1.2.3.4")
  me.say({ t: "join", code, primary: "cramar" })
  expect(me.got.at(-1)).toEqual({ t: "error", code: "passwordRequired" })
  me.say({ t: "join", code, password: "cjavedal-7q", primary: "cramar" })
  expect(me.got.at(-1)).toEqual({ t: "error", code: "wrongPassword" })
  expect(me.peer.room).toBeNull()
  me.say({ t: "join", code: code.toLowerCase(), password: ` ${PASSWORD} `, primary: "cramar" })
  expect(me.peer.room?.code).toBe(code)
})

test("an open room lets a player in whatever password they send", () => {
  const hub = new Hub()
  const host = connect(hub, "9.9.9.9")
  host.say(create)
  const me = connect(hub, "1.2.3.4")
  me.say({ t: "join", code: host.peer.room!.code, password: "anything", primary: "cramar" })
  expect(me.peer.room?.code).toBe(host.peer.room!.code)
})

test("after five wrong passwords a connection waits ten seconds before trying again, other connections do not", () => {
  let now = 1000
  const hub = new Hub(() => now)
  const host = connect(hub, "9.9.9.9")
  host.say(withPassword)
  const code = host.peer.room!.code
  const me = connect(hub, "1.2.3.4")
  const join = (password: string) => me.say({ t: "join", code, password, primary: "cramar" })
  for (let i = 0; i < 5; i++) join("nope")
  expect(me.got.filter((m) => m.t === "error").map((m) => m.t === "error" && m.code)).toEqual(Array(5).fill("wrongPassword"))
  join(PASSWORD)
  expect(me.got.at(-1)).toEqual({ t: "error", code: "tooManyAttempts" })
  now += 9_900
  join(PASSWORD)
  expect(me.got.at(-1)).toEqual({ t: "error", code: "tooManyAttempts" })
  expect(me.peer.room).toBeNull()
  const friend = connect(hub, "1.2.3.4")
  friend.say({ t: "join", code, password: PASSWORD, primary: "cramar" })
  expect(friend.peer.room?.code).toBe(code)
  now += 100
  join(PASSWORD)
  expect(me.peer.room?.code).toBe(code)
})

test("the password is in no message the server sends and in none of its logs", () => {
  const logged: string[] = []
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
    spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")))
  )
  try {
    passwordStaysHome()
  } finally {
    for (const s of spies) s.mockRestore()
  }
  function passwordStaysHome() {
  let now = 0
  const hub = new Hub(() => now)
  const host = connect(hub, "9.9.9.9")
  host.say({ ...withPassword, bots: 2 })
  const code = host.peer.room!.code
  const member = connect(hub, "1.2.3.4")
  member.say({ t: "join", code, password: PASSWORD, primary: "cramar" })
  const stranger = connect(hub, "1.2.3.4")
  stranger.say({ t: "join", code, primary: "cramar" })
  stranger.say({ t: "join", code, password: "nope", primary: "cramar" })
  stranger.say({ t: "list" })
  host.say({ t: "start" })
  for (let i = 0; i < 40; i++) {
    now += 50
    hub.update()
  }
  host.say({ t: "chat", text: "ciao" })
  host.say({ t: "leave" })
  member.say({ t: "list" })
  const sent = [host, member, stranger].flatMap((p) => p.got)
  expect(sent.some((m) => m.t === "snap")).toBe(true)
  expect(sent.some((m) => m.t === "joined" || m.t === "room")).toBe(true)
  expect(sent.filter((m) => JSON.stringify(m).includes(PASSWORD))).toEqual([])
  expect(logged.some((l) => l.includes(code))).toBe(true)
  expect(logged.filter((l) => l.includes(PASSWORD))).toEqual([])
  }
})

test("the room keeps its access and password when the host leaves, and its members see it", () => {
  const hub = new Hub()
  const host = connect(hub, "9.9.9.9")
  host.say(withPassword)
  const code = host.peer.room!.code
  const member = connect(hub, "1.2.3.4")
  member.say({ t: "join", code, password: PASSWORD, primary: "cramar" })
  host.say({ t: "leave" })
  const info = member.got.findLast((m) => m.t === "room")
  expect(info?.t === "room" && info.room).toMatchObject({ hostId: member.peer.id, access: "password" })
  const late = connect(hub, "5.5.5.5")
  late.say({ t: "join", code, primary: "cramar" })
  expect(late.got.at(-1)).toEqual({ t: "error", code: "passwordRequired" })
  late.say({ t: "join", code, password: PASSWORD, primary: "cramar" })
  expect(late.peer.room?.code).toBe(code)
})

test("the server refuses to create an Offline room", () => {
  const hub = new Hub()
  const { peer, got, say } = connect(hub)
  say({ ...create, reach: "offline" })
  expect(got.at(-1)).toEqual({ t: "error", code: "invalid" })
  expect(peer.room).toBeNull()
  expect(hub.rooms.size).toBe(0)
})
