/**
 * Single weapon changed by the host in the Muster, between one match and the next. Against both
 * hosts, as a client sees it, and through the simulation driven by its intents.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { Hub, type Clock } from "../server/hub.ts"
import { GLEMONE } from "../shared/maps/glemone.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import { MAPS } from "../shared/maps/index.ts"
import { createSim, type Sim } from "../shared/sim/index.ts"
import { COUNTDOWN_TICKS } from "../shared/sim/rules.ts"
import { TRAINING } from "../shared/training/index.ts"
import type { PrimaryId } from "../shared/weapons.ts"
import { harness } from "./harness.ts"

let glemone: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  glemone = createPhysicsWorld(GLEMONE)
})

const HOSTS = [
  { name: "the game server", reach: "online", access: { access: { kind: "open" } }, make: (clock: Clock) => new Hub(clock) },
  { name: "the in-browser host", reach: "offline", access: {}, make: (clock: Clock) => createBrowserHost(clock) }
] as const

for (const host of HOSTS) {
  describe(`single weapon in the Muster on ${host.name}`, () => {
    const create = { t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: host.reach, ...host.access, bots: 2, level: "pari", ff: false, primary: "cramar" }

    test("the host sets single weapon in the Muster: every member's primary in the roster becomes the setting's", () => {
      const { connect } = harness(host.make)
      const me = connect()
      me.say(create)
      me.say({ t: "single", p: "mulin" })
      const { room } = me.last("room")!
      expect(room.single).toBe("mulin")
      expect(room.roster.length).toBe(4)
      expect(room.roster.every((r) => r.primary === "mulin")).toBe(true)
    })

    test("the match that follows is played with the setting's primary", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say(create)
      me.say({ t: "single", p: "doplete" })
      me.say({ t: "start" })
      play(10)
      const snap = me.last("snap")!
      expect(snap.phase.tag).toBe("Live")
      expect(snap.players.every((p) => p.w === "doplete")).toBe(true)
      expect(snap.you?.arsenal).toMatchObject({ primary: "doplete", bombs: 0, mines: 0 })
    })

    test("turning it off after a match played with it gives each member back the primary they had chosen", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say({ ...create, primary: "cjampanili", single: "mulin" })
      const { you } = me.last("joined")!
      me.say({ t: "start" })
      play(10)
      expect(me.last("snap")!.you?.arsenal.primary).toBe("mulin")
      // The host's start during a match sends the room back to the Muster.
      me.say({ t: "start" })
      play(2)
      expect(me.last("snap")!.phase.tag).toBe("Muster")
      me.say({ t: "single", p: null })
      const { room } = me.last("room")!
      expect(room.single).toBeNull()
      expect(room.roster.find((r) => r.id === you)!.primary).toBe("cjampanili")
      expect(room.roster.some((r) => r.bot && r.primary !== "mulin")).toBe(true)
      me.say({ t: "start" })
      play(10)
      const snap = me.last("snap")!
      expect(snap.phase.tag).toBe("Live")
      expect(snap.you?.arsenal.primary).toBe("cjampanili")
      expect(snap.players.find((p) => p.id === you)!.w).toBe("cjampanili")
      expect(snap.you?.arsenal.bombs).toBeGreaterThan(0)
    })

    test("during a live match and while its results are shown, the setting is refused", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say({ ...create, minutes: 2, bots: 0 })
      me.say({ t: "start" })
      play(10)
      expect(me.last("snap")!.phase.tag).toBe("Live")
      const rooms = me.got.filter((m) => m.t === "room").length
      me.say({ t: "single", p: "mulin" })
      expect(me.got.filter((m) => m.t === "room").length).toBe(rooms)
      for (let s = 0; s < 130 && me.last("snap")?.phase.tag !== "Over"; s++) play(60)
      expect(me.last("snap")!.phase.tag).toBe("Over")
      me.say({ t: "single", p: "mulin" })
      expect(me.last("room")!.room.single).toBeNull()
      // The match that follows is played without it.
      me.say({ t: "start" })
      play(2)
      me.say({ t: "start" })
      play(10)
      expect(me.last("snap")!.you?.arsenal.primary).toBe("cramar")
    })
  })
}

describe("single weapon in the Muster on the game server", () => {
  const create = { t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: "online", access: { kind: "open" }, bots: 2, level: "pari", ff: false, primary: "cramar" }

  /** A room with its host and one more human member, in the Muster: the host's start alone begins a countdown. */
  const twoHumans = () => {
    const h = harness(HOSTS[0].make)
    const host = h.connect()
    host.say(create)
    const other = h.connect()
    other.say({ t: "join", code: host.last("joined")!.room.code, primary: "miedi" })
    h.play(2)
    return { ...h, host, other, otherId: other.last("joined")!.you }
  }

  test("every member sees the change at once, and the picker locks and unlocks with it", () => {
    const { host, other, otherId } = twoHumans()
    host.say({ t: "single", p: "gjalinis" })
    const locked = other.last("room")!.room
    expect(locked.single).toBe("gjalinis")
    expect(locked.roster.find((r) => r.id === otherId)!.primary).toBe("gjalinis")
    host.say({ t: "single", p: null })
    const free = other.last("room")!.room
    expect(free.single).toBeNull()
    expect(free.roster.find((r) => r.id === otherId)!.primary).toBe("miedi")
  })

  test("a member who is not the host cannot set it", () => {
    const { play, host, other } = twoHumans()
    other.say({ t: "single", p: "mulin" })
    play(2)
    expect(host.last("room")!.room.single).toBeNull()
    expect(other.last("room")!.room.single).toBeNull()
  })

  test("a countdown that is running restarts from its full length when the setting changes", () => {
    const { play, host, other } = twoHumans()
    host.say({ t: "start" })
    play(COUNTDOWN_TICKS - 60)
    host.say({ t: "single", p: "cjampanili" })
    play(2)
    const phase = other.last("snap")!.phase
    if (phase.tag !== "Muster" || phase.starts === null) throw new Error("no countdown")
    expect(phase.starts - other.last("snap")!.tick).toBeWithin(COUNTDOWN_TICKS - 3, COUNTDOWN_TICKS + 1)
    play(COUNTDOWN_TICKS - 10)
    expect(other.last("snap")!.phase.tag).toBe("Muster")
    play(14)
    const live = other.last("snap")!
    expect(live.phase.tag).toBe("Live")
    expect(live.you?.arsenal.primary).toBe("cjampanili")
  })

  test("with no countdown running, the setting starts none", () => {
    const { play, host, other } = twoHumans()
    host.say({ t: "single", p: "cjampanili" })
    play(2)
    expect(other.last("snap")!.phase).toEqual({ tag: "Muster", starts: null })
  })

  test("the room list reflects the change", () => {
    const { connect, host } = twoHumans()
    const browsing = connect()
    browsing.say({ t: "list" })
    expect(browsing.last("rooms")!.rooms.map((r) => r.single)).toEqual([null])
    host.say({ t: "single", p: "doplete" })
    browsing.say({ t: "list" })
    expect(browsing.last("rooms")!.rooms.map((r) => r.single)).toEqual(["doplete"])
    host.say({ t: "single", p: null })
    browsing.say({ t: "list" })
    expect(browsing.last("rooms")!.rooms.map((r) => r.single)).toEqual([null])
  })
})

// --- The simulation ------------------------------------------------------------------------

describe("single weapon set in the simulation", () => {
  const LAUNCHER = GLEMONE.pickups.findIndex((p) => p.kind === "lanciafrico")
  const me = (sim: Sim) => sim.view().players.find((p) => p.session === "a")!
  const muster = (single: PrimaryId | null = null) => {
    const sim = createSim({ mode: "bataie", minutes: 5, seed: 3, physics: glemone, single })
    sim.join("a", "Toni", "benandanti", false, "cramar")
    sim.step()
    return sim
  }
  const goLive = (sim: Sim) => {
    sim.start(true)
    for (let i = 0; i < 10; i++) sim.step()
  }
  const backToMuster = (sim: Sim) => {
    sim.start(true)
    sim.step()
  }

  test("in the Muster the setting changes the rules: the match is played with it, and the Lanciafrico leaves the map at once", () => {
    const sim = muster()
    sim.single("mulin")
    sim.step()
    expect(sim.view().pickups[LAUNCHER]).toBe("absent")
    goLive(sim)
    expect(me(sim).arsenal).toMatchObject({ primary: "mulin", kit: "single" })
  })

  test("turned off in the Muster, the player enters the next match with their own primary and the full kit, and the Lanciafrico is back", () => {
    const sim = muster("doplete")
    goLive(sim)
    expect(me(sim).arsenal.primary).toBe("doplete")
    backToMuster(sim)
    sim.single(null)
    sim.step()
    expect(sim.view().pickups[LAUNCHER]).toBe("up")
    goLive(sim)
    expect(me(sim).arsenal).toMatchObject({ primary: "cramar", kit: "full" })
  })

  test("during a live match the intent is not taken: the next match is played by the rules it had", () => {
    const sim = muster()
    goLive(sim)
    sim.single("mulin")
    sim.step()
    expect(sim.view().pickups[LAUNCHER]).toBe("up")
    backToMuster(sim)
    goLive(sim)
    expect(me(sim).arsenal.primary).toBe("cramar")
  })

  test("a training never takes it", () => {
    const sim = createSim({ mode: "dutrine", minutes: 0, seed: 3, physics: createPhysicsWorld(MAPS[TRAINING.map]) })
    sim.join("a", "Toni", "benandanti", false, "cramar")
    sim.single("mulin")
    for (let i = 0; i < 40; i++) sim.step()
    expect(me(sim).arsenal.kit).toBe("full")
  })
})
