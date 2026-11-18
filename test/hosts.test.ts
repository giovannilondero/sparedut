/**
 * The same protocol messages, sent to both hosts: the game server's and the one a browser runs
 * for an Offline room. Each host only differs in the reach it creates rooms with.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { Hub, type Clock } from "../server/hub.ts"
import { ROOM_MODE_IDS } from "../shared/folklore.ts"
import { initPhysics } from "../shared/physics.ts"
import { harness } from "./harness.ts"
import { FLAG_BIT, type Snapshot } from "../shared/protocol.ts"

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

    test("a new room is in the Muster: nobody is on the map, moves, fires, is hit or takes a pickup", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say({ ...create, bots: 4 })
      play(2)
      const first = me.last("snap")!
      expect(first.phase.tag).toBe("Muster")
      // Ten seconds of a player pushing forward and firing, and of bots thinking.
      for (let i = 0; i < 600; i++) {
        me.say({ t: "input", i: { seq: i + 1, mx: 0, mz: 1, yaw: 0, pitch: 0, buttons: 1, weapon: "cramar", view: 0 } })
        play(1)
      }
      const snaps = me.got.filter((m) => m.t === "snap")
      expect(snaps.every((s) => s.phase.tag === "Muster")).toBe(true)
      expect(snaps.every((s) => s.players.every((p) => (p.f & FLAG_BIT.alive) === 0) && s.you?.alive === false)).toBe(true)
      const last = me.last("snap")!
      expect(last.players.map((p) => [p.x, p.z])).toEqual(first.players.map((p) => [p.x, p.z]))
      expect(last.pickups).not.toContain("0")
      expect(snaps.flatMap((s) => s.ev).filter((e) => e.t === "shot" || e.t === "melee" || e.t === "hit" || e.t === "pick" || e.t === "spawn")).toEqual([])
    })

    test("the roster carries every member's team and primary, and a change to either shows at once", () => {
      const { connect } = harness(host.make)
      const me = connect()
      me.say({ ...create, primary: "mulin" })
      const { you } = me.last("joined")!
      const roster = () => me.last("room")!.room.roster
      const mine = () => roster().find((r) => r.id === you)!
      expect(mine()).toMatchObject({ team: "benandanti", primary: "mulin" })
      expect(roster().filter((r) => r.bot).every((r) => typeof r.primary === "string")).toBe(true)
      me.say({ t: "primary", p: "cjampanili" })
      expect(mine().primary).toBe("cjampanili")
      me.say({ t: "team", team: "malandanti" })
      expect(mine().team).toBe("malandanti")
    })

    test("on start every member and bot enters the map together, with the team and primary shown for them", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say({ ...create, bots: 4 })
      me.say({ t: "primary", p: "doplete" })
      play(30)
      me.say({ t: "start" })
      const shown = me.last("room")!.room.roster
      let entered: Snapshot | undefined
      for (let i = 0; i < 10 && !entered; i++) {
        play(1)
        const snap = me.last("snap")
        if (snap?.players.some((p) => p.f & FLAG_BIT.alive)) entered = snap
      }
      expect(entered!.phase.tag).toBe("Live")
      // Everybody at once: nobody on the map before the others.
      expect(entered!.players.every((p) => p.f & FLAG_BIT.alive)).toBe(true)
      expect(entered!.players.map((p) => [p.id, p.w]).sort()).toEqual(shown.map((r) => [r.id, r.primary]).sort())
      expect(entered!.you?.arsenal.primary).toBe("doplete")
    })

    test("a regular create request on the training's map is refused", () => {
      const { hub, connect } = harness(host.make)
      const me = connect()
      me.say({ ...create, map: "sagre" })
      expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
      expect(hub.rooms.size).toBe(0)
    })

    test("a regular create request in the training's mode is refused", () => {
      const { hub, connect } = harness(host.make)
      const me = connect()
      me.say({ ...create, mode: "dutrine" })
      expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
      expect(hub.rooms.size).toBe(0)
    })

    test("the host's clock brings snapshots of the creator's own player, thirty a second", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say(create)
      me.say({ t: "start" })
      play(60)
      const snaps = me.got.filter((m) => m.t === "snap")
      expect(snaps).toHaveLength(30)
      const last = me.last("snap")!
      expect(last.tick).toBe(60)
      expect(last.you?.alive).toBe(true)
      expect(last.players).toHaveLength(4)
    })

    test("host tools in the Muster: bots and their skill", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say(create)
      play(2)
      expect(me.last("snap")!.phase.tag).toBe("Muster")
      me.say({ t: "bot", team: "malandanti", delta: 1 })
      expect(me.last("room")!.room.bots).toBe(4)
      me.say({ t: "bot", team: "benandanti", delta: -1 })
      expect(me.last("room")!.room.roster.filter((r) => r.bot && r.team === "benandanti")).toHaveLength(0)
      me.say({ t: "level", level: "plevan" })
      expect(me.last("room")!.room.level).toBe("plevan")
      play(2)
      // The bots added in the Muster are in the room, off the map like everybody else.
      expect(me.last("snap")!.players).toHaveLength(4)
      expect(me.last("snap")!.phase.tag).toBe("Muster")
    })

    test("the enter intent is refused in the Muster and from a member already on the map", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say(create)
      const { you } = me.last("joined")!
      play(2)
      const rooms = me.got.filter((m) => m.t === "room").length
      me.say({ t: "enter" })
      play(10)
      // Nothing changes: still the Muster, nobody on the map, no new roster.
      expect(me.last("snap")!.phase.tag).toBe("Muster")
      expect(me.last("snap")!.you?.alive).toBe(false)
      expect(me.got.filter((m) => m.t === "room")).toHaveLength(rooms)
      me.say({ t: "start" })
      play(10)
      const before = me.last("snap")!.players.length
      me.say({ t: "enter" })
      play(10)
      expect(me.last("snap")!.players).toHaveLength(before)
      expect(me.last("snap")!.you?.alive).toBe(true)
      expect(me.last("room")!.room.roster.find((r) => r.id === you)?.onMap).toBe(true)
    })

    test("the host's restart during a live match ends it and returns the room to the Muster", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say(create)
      me.say({ t: "start" })
      play(120)
      expect(me.last("snap")!.phase.tag).toBe("Live")
      expect(me.last("snap")!.you?.alive).toBe(true)
      me.say({ t: "start" })
      play(2)
      expect(me.last("snap")!.phase.tag).toBe("Muster")
      expect(me.last("snap")!.players.every((p) => (p.f & FLAG_BIT.alive) === 0)).toBe(true)
      // And there it stays: the next match waits for the host.
      play(60 * 60)
      expect(me.last("snap")!.phase.tag).toBe("Muster")
      me.say({ t: "start" })
      play(2)
      expect(me.last("snap")!.phase.tag).toBe("Live")
    })

    test("a change of primary by a player on the map during a live match is refused: primary, weapon in hand and ammunition stay", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say({ ...create, primary: "doplete" })
      const { you } = me.last("joined")!
      me.say({ t: "start" })
      play(120)
      const before = me.last("snap")!
      expect(before.phase.tag).toBe("Live")
      expect(before.you?.arsenal.primary).toBe("doplete")
      const rooms = me.got.filter((m) => m.t === "room").length
      me.say({ t: "primary", p: "mulin" })
      play(60)
      const after = me.last("snap")!
      expect(after.you?.arsenal).toEqual(before.you?.arsenal)
      expect(after.players.find((p) => p.id === you)?.w).toBe("doplete")
      expect(me.got.filter((m) => m.t === "room")).toHaveLength(rooms)
      expect(me.last("room")!.room.roster.find((r) => r.id === you)?.primary).toBe("doplete")
    })

    test("a change of primary during the results is refused too, and the next Muster accepts it", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say({ ...create, minutes: 2, bots: 0, primary: "doplete" })
      const { you } = me.last("joined")!
      me.say({ t: "start" })
      for (let s = 0; s < 130 && me.last("snap")?.phase.tag !== "Over"; s++) play(60)
      expect(me.last("snap")!.phase.tag).toBe("Over")
      const before = me.last("snap")!.you?.arsenal
      me.say({ t: "primary", p: "mulin" })
      play(2)
      expect(me.last("snap")!.phase.tag).toBe("Over")
      expect(me.last("snap")!.you?.arsenal).toEqual(before)
      expect(me.last("room")!.room.roster.find((r) => r.id === you)?.primary).toBe("doplete")
      for (let s = 0; s < 20 && me.last("snap")?.phase.tag !== "Muster"; s++) play(60)
      expect(me.last("snap")!.phase.tag).toBe("Muster")
      me.say({ t: "primary", p: "mulin" })
      expect(me.last("room")!.room.roster.find((r) => r.id === you)?.primary).toBe("mulin")
      me.say({ t: "start" })
      play(10)
      expect(me.last("snap")!.you?.arsenal.primary).toBe("mulin")
    }, 30_000)

    test("after the results the room is in the Muster again, and stays there until the host starts", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say({ ...create, minutes: 2, bots: 0 })
      me.say({ t: "start" })
      for (let s = 0; s < 130 && me.last("snap")?.phase.tag !== "Over"; s++) play(60)
      const over = me.last("snap")!.phase
      expect(over.tag).toBe("Over")
      if (over.tag !== "Over") return
      play(over.restarts - me.last("snap")!.tick - 2)
      expect(me.last("snap")!.phase.tag).toBe("Over")
      play(4)
      expect(me.last("snap")!.phase.tag).toBe("Muster")
      expect(me.last("snap")!.you?.alive).toBe(false)
      play(60 * 60)
      expect(me.last("snap")!.phase.tag).toBe("Muster")
      me.say({ t: "start" })
      play(10)
      expect(me.last("snap")!.phase.tag).toBe("Live")
      expect(me.last("snap")!.you?.alive).toBe(true)
    }, 30_000)
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

describe("the Muster on the game server", () => {
  const join = (code: string) => ({ t: "join", code, primary: "miedi" })

  test("only the host can start", () => {
    const { connect, play } = harness(HOSTS[0].make)
    const host = connect()
    host.say(HOSTS_CREATE.online)
    const other = connect()
    other.say(join(host.last("joined")!.room.code))
    other.say({ t: "start" })
    play(60)
    expect(other.last("snap")!.phase.tag).toBe("Muster")
    host.say({ t: "start" })
    play(2)
    expect(other.last("snap")!.phase.tag).toBe("Live")
  })

  test("a member who joins sees everybody's team and primary in the roster", () => {
    const { connect } = harness(HOSTS[0].make)
    const host = connect()
    host.say({ ...HOSTS_CREATE.online, primary: "mulin" })
    const other = connect()
    other.say(join(host.last("joined")!.room.code))
    const { room, you } = other.last("joined")!
    expect(room.roster.find((r) => r.id === host.last("joined")!.you)?.primary).toBe("mulin")
    expect(room.roster.find((r) => r.id === you)?.primary).toBe("miedi")
    // The host sees the newcomer too.
    expect(host.last("room")!.room.roster.find((r) => r.id === you)?.primary).toBe("miedi")
  })

  test("the host passing to another member during the Muster leaves a room that can still be started", () => {
    const { connect, play } = harness(HOSTS[0].make)
    const host = connect()
    host.say(HOSTS_CREATE.online)
    const other = connect()
    other.say(join(host.last("joined")!.room.code))
    play(10)
    host.say({ t: "leave" })
    expect(other.last("room")!.room.hostId).toBe(other.last("joined")!.you)
    play(10)
    expect(other.last("snap")!.phase.tag).toBe("Muster")
    other.say({ t: "start" })
    play(10)
    expect(other.last("snap")!.phase.tag).toBe("Live")
    expect(other.last("snap")!.you?.alive).toBe(true)
  })

  test("the room list shows the Muster as a room's phase, then the match", () => {
    const { connect, play } = harness(HOSTS[0].make)
    const host = connect()
    host.say(HOSTS_CREATE.online)
    const browsing = connect()
    browsing.say({ t: "list" })
    expect(browsing.last("rooms")!.rooms.map((r) => r.phase)).toEqual(["Muster"])
    host.say({ t: "start" })
    play(2)
    browsing.say({ t: "list" })
    expect(browsing.last("rooms")!.rooms.map((r) => r.phase)).toEqual(["Live"])
  })
})

describe("joining a match already on, on the game server", () => {
  const join = (code: string, primary = "miedi") => ({ t: "join", code, primary })
  /** A host in a live match, and a second player who joins it. */
  const live = (create: object = HOSTS_CREATE.online) => {
    const h = harness(HOSTS[0].make)
    const host = h.connect()
    host.say(create)
    host.say({ t: "start" })
    h.play(120)
    const late = h.connect()
    late.say(join(host.last("joined")!.room.code))
    const you = late.last("joined")!.you
    const entry = (c = late) => c.last("room")!.room.roster.find((r) => r.id === you)
    return { ...h, host, late, you, entry }
  }

  test("a member who joins a live match is in the roster, not on the map, and absent from the match's players", () => {
    const { host, late, you, entry, play } = live()
    expect(entry()).toMatchObject({ primary: "miedi", onMap: false })
    expect(entry(host)?.onMap).toBe(false)
    // The others are on the map.
    expect(late.last("room")!.room.roster.filter((r) => r.id !== you).every((r) => r.onMap)).toBe(true)
    // No time limit: a long wait, and still nothing of them in the match.
    play(60 * 60)
    const snaps = [...late.got, ...host.got].filter((m) => m.t === "snap")
    expect(snaps.every((s) => s.players.every((p) => p.id !== you))).toBe(true)
    expect(late.last("snap")!.you).toBeNull()
    expect(late.last("snap")!.phase.tag).toBe("Live")
    expect(late.last("board")!.rows.some((r) => r.id === you)).toBe(false)
  })

  test("the enter intent places them on the map with the team and primary they chose", () => {
    const { host, late, you, entry, play } = live()
    const team = entry()!.team === "benandanti" ? "malandanti" : "benandanti"
    play(30)
    late.say({ t: "team", team })
    late.say({ t: "primary", p: "mulin" })
    expect(entry()).toMatchObject({ team, primary: "mulin", onMap: false })
    late.say({ t: "enter" })
    expect(entry()?.onMap).toBe(true)
    expect(entry(host)?.onMap).toBe(true)
    play(120)
    const snap = late.last("snap")!
    expect(snap.you?.alive).toBe(true)
    expect(snap.you?.arsenal.primary).toBe("mulin")
    expect(snap.players.find((p) => p.id === you)?.w).toBe("mulin")
    expect(late.last("board")!.rows.find((r) => r.id === you)?.team).toBe(team)
  })

  test("a change of primary by a member who has not entered is accepted, and refused once they are on the map", () => {
    const { late, you, entry, play } = live()
    late.say({ t: "primary", p: "cjampanili" })
    expect(entry()?.primary).toBe("cjampanili")
    late.say({ t: "enter" })
    play(120)
    expect(late.last("snap")!.you?.arsenal.primary).toBe("cjampanili")
    late.say({ t: "primary", p: "mulin" })
    play(30)
    expect(entry()?.primary).toBe("cjampanili")
    expect(late.last("snap")!.you?.arsenal.primary).toBe("cjampanili")
    expect(late.last("snap")!.players.find((p) => p.id === you)?.w).toBe("cjampanili")
  })

  test("a bot that would give up its seat keeps playing until the human enters", () => {
    const h = harness(HOSTS[0].make)
    const host = h.connect()
    host.say({ ...HOSTS_CREATE.online, bots: 7 })
    // Fill the room to the last seat.
    while (host.last("room")!.room.roster.length < 16) {
      host.say({ t: "bot", team: "benandanti", delta: 1 })
      h.play(60)
    }
    host.say({ t: "start" })
    h.play(120)
    const late = h.connect()
    late.say(join(host.last("joined")!.room.code))
    const { you } = late.last("joined")!
    const bots = () => host.last("room")!.room.roster.filter((r) => r.bot).length
    expect(bots()).toBe(15)
    h.play(600)
    // Every seat still played: sixteen on the map, the bots among them alive and moving.
    expect(host.last("snap")!.players).toHaveLength(16)
    late.say({ t: "enter" })
    expect(bots()).toBe(14)
    h.play(120)
    expect(host.last("snap")!.players).toHaveLength(16)
    expect(host.last("snap")!.players.some((p) => p.id === you)).toBe(true)
  })

  test("a full room of humans still refuses a player who joins during a match", () => {
    const h = harness(HOSTS[0].make)
    const host = h.connect()
    host.say({ ...HOSTS_CREATE.online, bots: 7 })
    while (host.last("room")!.room.roster.length < 16) {
      host.say({ t: "bot", team: "benandanti", delta: 1 })
      h.play(60)
    }
    host.say({ t: "start" })
    h.play(60)
    const code = host.last("joined")!.room.code
    // Fifteen bots: fifteen players can join while the match is on, each to take one's seat.
    const joined = Array.from({ length: 15 }, (_, i) => {
      const c = h.connect(`10.0.0.${i}`)
      c.say(join(code))
      return c
    })
    expect(joined.every((c) => c.last("joined"))).toBe(true)
    const extra = h.connect("10.0.1.1")
    extra.say(join(code))
    expect(extra.last("joined")).toBeUndefined()
    expect(extra.last("error")?.code).toBe("full")
    for (const c of joined) c.say({ t: "enter" })
    h.play(10)
    expect(host.last("room")!.room.roster.filter((r) => r.bot)).toHaveLength(0)
    expect(host.last("snap")!.players).toHaveLength(16)
  })

  test("a member who never enters stays off the map for the match, and is in the Muster when it ends", () => {
    const { host, late, you, entry, play } = live({ ...HOSTS_CREATE.online, minutes: 2 })
    for (let s = 0; s < 130 && late.last("snap")?.phase.tag !== "Over"; s++) play(60)
    expect(late.last("snap")!.phase.tag).toBe("Over")
    expect(late.got.filter((m) => m.t === "snap").every((s) => s.players.every((p) => p.id !== you))).toBe(true)
    // Entering during the results is still entering this match; they wait for the Muster instead.
    for (let s = 0; s < 20 && late.last("snap")?.phase.tag !== "Muster"; s++) play(60)
    expect(late.last("snap")!.phase.tag).toBe("Muster")
    expect(entry()?.onMap).toBe(true)
    play(2)
    expect(late.last("snap")!.players.some((p) => p.id === you)).toBe(true)
    host.say({ t: "start" })
    play(10)
    expect(late.last("snap")!.you?.alive).toBe(true)
    expect(late.last("snap")!.you?.arsenal.primary).toBe("miedi")
  }, 30_000)

  test("the host's restart sends a member who has not entered to the Muster with everybody", () => {
    const { host, late, entry, play } = live()
    host.say({ t: "start" })
    play(2)
    expect(late.last("snap")!.phase.tag).toBe("Muster")
    expect(entry()?.onMap).toBe(true)
    host.say({ t: "start" })
    play(10)
    expect(late.last("snap")!.you?.alive).toBe(true)
  })

  test("in the Tampieste a member entering after the start does not spawn in that match", () => {
    const { late, you, entry, play } = live({ ...HOSTS_CREATE.online, mode: "tampieste" })
    late.say({ t: "enter" })
    expect(entry()?.onMap).toBe(true)
    play(600)
    const snap = late.last("snap")!
    expect(snap.phase.tag).toBe("Live")
    expect(snap.you?.alive).toBe(false)
    expect(snap.players.find((p) => p.id === you)!.f & FLAG_BIT.alive).toBe(0)
  })

  test("a member who has not entered and leaves is gone from the roster, and the match goes on", () => {
    const { host, late, you, play } = live()
    late.say({ t: "leave" })
    expect(host.last("room")!.room.roster.some((r) => r.id === you)).toBe(false)
    play(60)
    expect(host.last("snap")!.phase.tag).toBe("Live")
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
    // Restarted while paused: the match that was playing ended, and the room is in the Muster.
    expect(live.tag).toBe("Live")
    expect(snap.phase.tag).toBe("Muster")
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

  for (const mode of ROOM_MODE_IDS) {
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

  // Only a browser makes a training: the game server has none to test.
  test("a change of primary in a training is accepted and arrives at once, with its ammunition", () => {
    const { connect, play } = harness(browser)
    const me = connect()
    me.say({ t: "training", primary: "cramar" })
    play(120)
    expect(me.last("snap")!.you?.alive).toBe(true)
    expect(me.last("snap")!.you?.arsenal.primary).toBe("cramar")
    me.say({ t: "primary", p: "doplete" })
    play(2)
    const arsenal = me.last("snap")!.you!.arsenal
    expect(arsenal.primary).toBe("doplete")
    expect(arsenal.ammo.doplete.mag).toBeGreaterThan(0)
  })

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
