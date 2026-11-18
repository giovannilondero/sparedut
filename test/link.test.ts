/**
 * The game's link to its hosts: the game server and the in-browser host of an Offline room.
 * Both keep talking (the server's room list keeps coming while offline), but only the host
 * holding the current room may start, replace or feed a match.
 */
import { expect, test } from "bun:test"
import { Link, type Connection, type Listener } from "../client/connection.ts"
import type { ClientMessage, RoomInfo, ServerMessage } from "../shared/protocol.ts"

/** A host the test speaks for. */
function fakeHost() {
  const listeners = new Set<Listener>()
  const sent: ClientMessage[] = []
  const host: Connection = {
    rtt: 0,
    send: (msg) => void sent.push(msg),
    on: (l) => (listeners.add(l), () => void listeners.delete(l))
  }
  const say = (msg: ServerMessage) => listeners.forEach((l) => l(msg))
  return { host, sent, say }
}

const room = (code: string) => ({ code, reach: code === "" ? "offline" : "online" }) as unknown as RoomInfo
const snap = { t: "snap", tick: 2 } as unknown as ServerMessage

test("while an Offline room is played, the server's invite room cannot start a match, feed it or end it", () => {
  const server = fakeHost()
  const browser = fakeHost()
  const link = new Link([server.host, browser.host])
  const heard: ServerMessage[] = []
  link.on((m) => heard.push(m))
  link.use(browser.host)
  browser.say({ t: "joined", room: room(""), you: "me", tick: 0 })
  browser.say(snap)

  // The server came back and auto-joined the room code still in the address.
  server.say({ t: "joined", room: room("ABCD"), you: "me2", tick: 0 })
  server.say(snap)
  server.say({ t: "chat", from: "x", name: "x", team: null, text: "hi" })
  server.say({ t: "left" })
  server.say({ t: "error", code: "notFound" })

  expect(heard.map((m) => m.t)).toEqual(["joined", "snap"])
  // The server is told the player is not there, so no ghost stays in its room.
  expect(server.sent).toEqual([{ t: "leave" }])
})

test("the server's room list and address still reach the game while an Offline room is played", () => {
  const server = fakeHost()
  const browser = fakeHost()
  const link = new Link([server.host, browser.host])
  const heard: ServerMessage[] = []
  link.on((m) => heard.push(m))
  link.use(browser.host)
  server.say({ t: "rooms", rooms: [] })
  server.say({ t: "public", url: "https://x.example" })
  expect(heard.map((m) => m.t)).toEqual(["rooms", "public"])
})

test("back on the server, its rooms start matches again and the closed in-browser host is not heard", () => {
  const server = fakeHost()
  const browser = fakeHost()
  const link = new Link([server.host, browser.host])
  const heard: ServerMessage[] = []
  link.on((m) => heard.push(m))
  link.use(browser.host)
  link.use(server.host)
  browser.say(snap)
  server.say({ t: "joined", room: room("ABCD"), you: "me", tick: 0 })
  server.say(snap)
  expect(heard.map((m) => m.t)).toEqual(["joined", "snap"])
  link.send({ t: "start" })
  expect(server.sent).toEqual([{ t: "start" }])
  expect(browser.sent).toEqual([])
})
