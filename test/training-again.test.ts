/**
 * Starting again in a training never duplicates its bots: going to a station from the list (another
 * one and back, the current one, several times before an arrival), restarting, starting over, dying
 * and respawning, leaving and entering again. Checked at both seams the player sees: the
 * simulation's players (the snapshot), the roster the client is told (whom it names, and in which
 * team's colours), and the bodies the client draws (`client/bodies.ts`).
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { takeAwayDeparted } from "../client/bodies.ts"
import { createBrowserHost } from "../client/host.ts"
import { IDLE_INPUT } from "../shared/input.ts"
import { initPhysics } from "../shared/physics.ts"
import type { RosterEntry } from "../shared/protocol.ts"
import { STATION_IDS, STATIONS, type StationId } from "../shared/training/index.ts"
import { MAX_STATION_BOTS } from "../shared/training/station.ts"
import { harness, type Client, type Harness } from "./harness.ts"

beforeAll(() => initPhysics())

/** A training on the in-browser host with every station open, entered at `from`, played until the trainee is alive. */
function enter(h: Harness, from: StationId) {
  const me = h.connect()
  me.say({ t: "training", primary: "cramar", unlocked: STATION_IDS.length, from })
  for (let i = 0; i < 120 && !me.last("snap")?.you?.alive; i++) h.play(1)
  return me
}

/** Lets `ticks` ticks pass with the trainee standing still, sending inputs as a client does. */
function idle(h: Harness, me: Client, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    const snap = me.last("snap")!
    me.say({ t: "input", i: { ...IDLE_INPUT, weapon: snap.you?.arsenal.current ?? "cramar", seq: (snap.you?.seq ?? 0) + 1, view: snap.tick } })
    h.play(1)
  }
}

/** Goes to `station` from the list and waits for the arrival (a dead trainee's waits for its respawn), then a second more. */
function goTo(h: Harness, me: Client, station: StationId) {
  me.say({ t: "goTo", station })
  idle(h, me, 2)
  const arrived = () => {
    const training = me.last("snap")!.training
    return training?.tag === "station" && training.step !== null
  }
  for (let i = 0; i < 400 && !arrived(); i++) idle(h, me, 1)
  idle(h, me, 60)
}

const you = (me: Client) => me.last("joined")!.you

/** The roster the client was last told: the `joined` message, or any `room` message after it. */
function roster(me: Client): readonly RosterEntry[] {
  const m = me.got.findLast((m) => m.t === "joined" || m.t === "room")
  return m?.t === "joined" || m?.t === "room" ? m.room.roster : []
}

/**
 * The bodies the client draws, by its own rule (`client/bodies.ts`), with a frame drawn after
 * every message as the page does: the frame draws a body for each player of the latest snapshot.
 */
function drawn(me: Client): Set<string> {
  const bodies = new Map<string, string>()
  let latest: ReadonlyMap<string, unknown> = new Map()
  for (const m of me.got) {
    if (m.t === "snap") {
      latest = new Map(m.players.map((p) => [p.id, p]))
      takeAwayDeparted(bodies, latest, () => {})
    }
    for (const id of latest.keys()) if (id !== you(me) && !bodies.has(id)) bodies.set(id, id)
  }
  return new Set(bodies.keys())
}

/** Exactly the station's bots, each once: in the simulation, in the roster, on the scoreboard and drawn. */
function hasItsBotsOnce(me: Client, station: StationId) {
  const wanted = STATIONS[station].setup.bots.slice(0, MAX_STATION_BOTS)
  const snap = me.last("snap")!
  expect(snap.training).toMatchObject({ tag: "station", station })
  const bots = snap.players.filter((p) => p.id !== you(me)).map((p) => p.id).toSorted()
  expect(bots.length).toBe(wanted.length)
  expect(new Set(bots).size).toBe(wanted.length)
  const listed = roster(me).filter((r) => r.bot)
  expect(listed.map((r) => r.id).toSorted()).toEqual(bots)
  expect(listed.map((r) => r.team).toSorted()).toEqual(wanted.map((b) => b.team).toSorted())
  expect(new Set(listed.map((r) => r.name)).size).toBe(listed.length)
  expect([...drawn(me)].toSorted()).toEqual(bots)
  expect(me.last("board")!.rows.filter((r) => r.bot).length).toBe(wanted.length)
}

/** Every bot alive at its post with its starting health: just after an arrival at a station whose bots don't walk. */
function atTheirPosts(me: Client, station: StationId) {
  for (const b of me.last("snap")!.players.filter((p) => p.id !== you(me))) {
    const own = STATIONS[station].setup.bots.find((s) => Math.hypot(b.x - s.route[0][0], b.z - s.route[0][2]) < 0.5)
    expect(own).toBeDefined()
    expect(b.hp).toBe(own!.hp)
  }
}

describe("going to a station from the list never duplicates the bots", () => {
  test("from the skirmish to stations with other numbers of bots and back: only the station's bots, drawn once", () => {
    const h = harness(createBrowserHost)
    const me = enter(h, "skirmish")
    idle(h, me, 60)
    hasItsBotsOnce(me, "skirmish")
    for (const there of ["stalls", "always", "medic", "look", "throw"] as const) {
      goTo(h, me, there)
      hasItsBotsOnce(me, there)
      goTo(h, me, "skirmish")
      hasItsBotsOnce(me, "skirmish")
    }
  })

  test("going to the current station (restarting it) five times: the same bots, back at their posts", () => {
    const h = harness(createBrowserHost)
    const me = enter(h, "skirmish")
    idle(h, me, 60)
    for (let n = 0; n < 5; n++) {
      // Let the foes leave their posts and fight a while, then restart.
      idle(h, me, 240)
      goTo(h, me, "skirmish")
      hasItsBotsOnce(me, "skirmish")
    }
  })

  test("restarting a station whose bots stand still: each back at its post with its starting health", () => {
    const h = harness(createBrowserHost)
    const me = enter(h, "medic")
    idle(h, me, 60)
    for (let n = 0; n < 3; n++) {
      goTo(h, me, "medic")
      atTheirPosts(me, "medic")
      hasItsBotsOnce(me, "medic")
    }
  })

  test("several stations chosen before the first arrival is applied: only the last one's bots", () => {
    const h = harness(createBrowserHost)
    const me = enter(h, "skirmish")
    idle(h, me, 60)
    // In one tick: the last one wins.
    me.say({ t: "goTo", station: "stalls" })
    me.say({ t: "goTo", station: "always" })
    me.say({ t: "goTo", station: "medic" })
    goTo(h, me, "throw")
    hasItsBotsOnce(me, "throw")
    // One a tick, each before the previous arrival.
    for (const s of ["stalls", "skirmish", "always"] as const) {
      me.say({ t: "goTo", station: s })
      idle(h, me, 1)
    }
    goTo(h, me, "medic")
    hasItsBotsOnce(me, "medic")
  })
})

describe("the other ways of starting again", () => {
  test("starting over: the skirmish's foes leave, in the simulation and in what the client draws", () => {
    const h = harness(createBrowserHost)
    const me = enter(h, "skirmish")
    idle(h, me, 60)
    me.say({ t: "startOver" })
    idle(h, me, 60)
    expect(me.last("snap")!.training).toMatchObject({ station: "look", unlocked: 1 })
    hasItsBotsOnce(me, "look")
  })

  test("dying and respawning in the skirmish: still its two foes, each once", () => {
    const h = harness(createBrowserHost)
    const me = enter(h, "skirmish")
    let died = false
    // The trainee stands still in the open: the foes come and kill it.
    for (let i = 0; i < 60 * 120 && !(died && me.last("snap")!.you!.alive); i++) {
      idle(h, me, 1)
      if (!me.last("snap")!.you!.alive) died = true
    }
    expect(died).toBe(true)
    idle(h, me, 60)
    hasItsBotsOnce(me, "skirmish")
  })

  test("leaving the training and entering it again three times: the skirmish's foes once each time", () => {
    const h = harness(createBrowserHost)
    for (let n = 0; n < 3; n++) {
      const me = enter(h, "skirmish")
      idle(h, me, 60)
      hasItsBotsOnce(me, "skirmish")
      me.say({ t: "leave" })
      h.play(2)
      expect(me.last("left")).toBeDefined()
    }
  })
})
