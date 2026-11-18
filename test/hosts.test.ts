/**
 * The same protocol messages, sent to both hosts: the game server's and the one a browser runs
 * for an Offline room. Each host only differs in the reach it creates rooms with.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { Hub, type Clock, type Peer } from "../server/hub.ts"
import { MODE_IDS } from "../shared/folklore.ts"
import { initPhysics } from "../shared/physics.ts"
import { PROTOCOL_VERSION, type ServerMessage } from "../shared/protocol.ts"

beforeAll(() => initPhysics())

/** A host with a clock the test moves by hand. */
const HOSTS = [
  { name: "the game server", reach: "online", access: { access: { kind: "open" } }, make: (clock: Clock) => new Hub(clock) },
  // An Offline room has no access: nobody else can come in.
  { name: "the in-browser host", reach: "offline", access: {}, make: (clock: Clock) => createBrowserHost(clock) }
] as const

const HOSTS_CREATE = {
  online: { t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: "online", access: { kind: "open" }, bots: 2, level: "pari", ff: false, primary: "cramar" },
  offline: { t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: "offline", bots: 2, level: "pari", ff: false, primary: "cramar" }
}

function harness(make: (clock: Clock) => Hub) {
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

for (const host of HOSTS) {
  describe(host.name, () => {
    const create = { t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: host.reach, ...host.access, bots: 2, level: "pari", ff: false, primary: "cramar" }

    test("creating a room puts its creator in it as host, with the bots asked for", () => {
      const { connect } = harness(host.make)
      const me = connect()
      me.say(create)
      const { you } = me.last("joined")!
      // Two a side: the creator counts for their team.
      expect(me.last("room")!.room).toMatchObject({ reach: host.reach, mode: "bataie", map: "glemone", hostId: you, players: 1, bots: 3, level: "pari", ff: false })
    })

    test("a regular create request on the training's map is refused", () => {
      const { hub, connect } = harness(host.make)
      const me = connect()
      me.say({ ...create, map: "sagre" })
      expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
      expect(hub.rooms.size).toBe(0)
    })

    test("the host's clock brings snapshots of the creator's own player, thirty a second", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say(create)
      play(60)
      const snaps = me.got.filter((m) => m.t === "snap")
      expect(snaps).toHaveLength(30)
      const last = me.last("snap")!
      expect(last.tick).toBe(60)
      expect(last.you?.alive).toBe(true)
      expect(last.players).toHaveLength(4)
    })

    test("host tools: start, restart, bots and their skill", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say(create)
      play(2)
      expect(me.last("snap")!.phase.tag).toBe("Warmup")
      me.say({ t: "start" })
      play(2)
      const live = me.last("snap")!.phase
      expect(live.tag).toBe("Live")
      play(120)
      me.say({ t: "start" })
      play(2)
      const restarted = me.last("snap")!.phase
      expect(restarted.tag === "Live" && live.tag === "Live" && restarted.ends > live.ends).toBe(true)
      me.say({ t: "bot", team: "malandanti", delta: 1 })
      expect(me.last("room")!.room.bots).toBe(4)
      me.say({ t: "bot", team: "benandanti", delta: -1 })
      expect(me.last("room")!.room.roster.filter((r) => r.bot && r.team === "benandanti")).toHaveLength(0)
      me.say({ t: "level", level: "plevan" })
      expect(me.last("room")!.room.level).toBe("plevan")
    })

  })
}

describe("the game server", () => {
  test("a room on the server does not pause when its player opens the match menu or hides the tab", () => {
    const { connect, play } = harness(HOSTS[0].make)
    const me = connect()
    me.say(HOSTS_CREATE.online)
    play(30)
    me.say({ t: "pause", paused: true })
    play(60)
    expect(me.last("snap")!.tick).toBe(90)
    expect(me.got.some((m) => m.t === "error")).toBe(false)
  })
})

describe("pause in an Offline room", () => {
  const browser = HOSTS[1].make

  test("pausing stops the match at its tick, with no snapshots; resuming goes on from that same tick", () => {
    const { connect, play } = harness(browser)
    const me = connect()
    me.say(HOSTS_CREATE.offline)
    me.say({ t: "start" })
    play(30)
    const before = me.last("snap")!
    expect(before.tick).toBe(30)
    me.say({ t: "pause", paused: true })
    const sent = me.got.length
    play(600)
    // Bots, projectiles and the match clock all live in the room's tick: nothing moved.
    expect(me.got.slice(sent).filter((m) => m.t === "snap")).toEqual([])
    me.say({ t: "ping", c: 1 })
    expect(me.last("pong")!.tick).toBe(30)
    me.say({ t: "pause", paused: false })
    play(2)
    const after = me.last("snap")!
    expect(after.tick).toBe(32)
    // The match's end is the same distance away as before the pause: no time was lost.
    expect(after.phase.tag === "Live" && before.phase.tag === "Live" && after.phase.ends === before.phase.ends).toBe(true)
  })

  test("host tools used while paused take effect: bots, their skill, restart", () => {
    const { connect, play } = harness(browser)
    const me = connect()
    me.say(HOSTS_CREATE.offline)
    me.say({ t: "start" })
    play(120)
    const live = me.last("snap")!.phase
    me.say({ t: "pause", paused: true })
    // A player in the menu clicks more than a burst of commands, over some seconds of real time.
    for (let i = 0; i < 6; i++) {
      me.say({ t: "bot", team: "malandanti", delta: 1 })
      me.say({ t: "bot", team: "malandanti", delta: -1 })
      play(60)
    }
    me.say({ t: "bot", team: "malandanti", delta: 1 })
    expect(me.last("room")!.room.bots).toBe(4)
    me.say({ t: "level", level: "plevan" })
    expect(me.last("room")!.room.level).toBe("plevan")
    me.say({ t: "start" })
    play(60)
    me.say({ t: "pause", paused: false })
    play(2)
    const snap = me.last("snap")!
    expect(snap.tick).toBe(122)
    expect(snap.players).toHaveLength(5)
    // Restarted while paused: the new match ends later than the one that was playing.
    expect(snap.phase.tag === "Live" && live.tag === "Live" && snap.phase.ends > live.ends).toBe(true)
  })
})

describe("the in-browser host", () => {
  const create = { t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: "offline", bots: 2, level: "pari", ff: false, primary: "cramar" }
  const browser = HOSTS[1].make

  test("creates only Offline rooms, and those without an access", () => {
    const { hub, connect } = harness(browser)
    const me = connect()
    for (const reach of ["lan", "online"]) {
      me.say({ ...create, reach, access: { kind: "open" } })
      expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
    }
    for (const access of [{ kind: "open" }, { kind: "password", password: "Cjavedal" }]) {
      me.say({ ...create, access })
      expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
    }
    expect(hub.rooms.size).toBe(0)
  })

  test("an Offline room is in no room list and cannot be joined by its code", () => {
    const { hub, connect } = harness(browser)
    const me = connect()
    me.say(create)
    expect(me.last("room")!.room).not.toHaveProperty("access")
    const other = connect()
    other.say({ t: "list" })
    expect(other.last("rooms")!.rooms).toEqual([])
    other.say({ t: "join", code: [...hub.rooms.keys()][0], primary: "cramar" })
    expect(other.got.at(-1)).toEqual({ t: "error", code: "notFound" })
    expect(other.peer.room).toBeNull()
  })

  for (const mode of MODE_IDS) {
    test(`an Offline room plays a whole ${mode} match against the bots`, () => {
      const { connect, play } = harness(browser)
      const me = connect()
      me.say({ ...create, mode, minutes: 2, bots: 4 })
      me.say({ t: "start" })
      // Two minutes and a little more: the match may also end early on score.
      for (let s = 0; s < 130 && me.last("snap")?.phase.tag !== "Over"; s++) play(60)
      expect(me.last("snap")!.phase.tag).toBe("Over")
    }, 30_000)
  }

  test("runs in a browser: nothing it imports needs Bun or Node", async () => {
    const seen = new Set<string>()
    const outside: string[] = []
    const visit = async (url: URL) => {
      if (seen.has(url.href)) return
      seen.add(url.href)
      const source = await Bun.file(url).text()
      for (const [, path] of source.matchAll(/(?:from|import)\s+"([^"]+)"/g)) {
        if (path.startsWith(".")) await visit(new URL(path, url))
        else if (/^(node:|bun:?|fs$|path$|os$)/.test(path)) outside.push(`${url.pathname.split("/").slice(-2).join("/")} → ${path}`)
      }
    }
    await visit(new URL("../client/host.worker.ts", import.meta.url))
    expect(outside).toEqual([])
    expect([...seen].some((u) => u.endsWith("/server/room.ts"))).toBe(true)
  })
})
