/**
 * The training, driven by protocol messages to the in-browser host as the player's client drives
 * it: starting it, what the host refuses, and the steps of the first station.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { Hub, type Clock } from "../server/hub.ts"
import { IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import { initPhysics } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { STATION_IDS } from "../shared/training/index.ts"
import { MARKER_RADIUS } from "../shared/training/stations/look.ts"
import { harness, type Client } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"

beforeAll(() => initPhysics())

const TRAINING = { t: "training", primary: "cramar" }
const browser = (clock: Clock) => createBrowserHost(clock)

/** A training started on the in-browser host, played until the trainee stands at the first station. */
function started() {
  const h = harness(browser)
  const me = h.connect()
  me.say(TRAINING)
  for (let i = 0; i < 120 && !me.last("snap")?.you?.alive; i++) h.play(1)
  return { ...h, me }
}

/** Sends one input per tick, as a client does; returns the training events those ticks brought. */
function drive(h: ReturnType<typeof started>, ticks: number, input: (tick: number) => Partial<PlayerInput>) {
  const events: GameEvent[] = []
  let seq = h.me.last("snap")!.you!.seq
  for (let i = 0; i < ticks; i++) {
    const snap = h.me.last("snap")!
    h.me.say({ t: "input", i: { ...IDLE_INPUT, weapon: snap.you!.arsenal.current, ...input(i), seq: ++seq, view: snap.tick } })
    const before = h.me.got.length
    h.play(1)
    for (const m of h.me.got.slice(before)) if (m.t === "snap") events.push(...m.ev.filter((e) => e.t === "training"))
  }
  return events
}

const steps = (events: GameEvent[]) => events.flatMap((e) => (e.t === "training" && e.a === "step" ? [e.step] : []))
const view = (me: Client) => me.last("snap")!.training
const position = (me: Client) => me.last("snap")!.you!.body
const START = SAGRE_STATIONS.look.start
const MARKER = SAGRE_STATIONS.look.marker
/** Facing straight east, along the street. */
const EAST = START.yaw

describe("starting the training", () => {
  test("the game server refuses a training request", () => {
    const { hub, connect } = harness((clock) => new Hub(clock))
    const me = connect()
    me.say(TRAINING)
    expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
    expect(hub.rooms.size).toBe(0)
  })

  test("the in-browser host puts the player, a Benandante, at the first station of the fair: live at once, no clock", () => {
    const { me } = started()
    const room = me.last("joined")!.room
    expect(room).toMatchObject({ reach: "offline", mode: "dutrine", map: "sagre", players: 1, bots: 0 })
    expect(room.roster).toEqual([expect.objectContaining({ id: me.last("joined")!.you, team: "benandanti", bot: false })])
    const snap = me.last("snap")!
    expect(snap.phase.tag).toBe("Live")
    expect(snap.you!.alive).toBe(true)
    expect(snap.you!.body).toMatchObject({ x: START.at[0], z: START.at[2] })
    expect(snap.training).toEqual({ tag: "station", station: "look", step: "lookAround", count: 0, target: 1, unlocked: 1 })
  })

  test("no warm-up and no end: the training is still live long after a match would have ended", () => {
    const h = started()
    h.play(60 * 60)
    expect(h.me.last("snap")!.phase.tag).toBe("Live")
    expect(view(h.me)).toMatchObject({ station: "look", step: "lookAround" })
  })

  test("the training is in no room list and cannot be joined", () => {
    const { hub, me, connect } = started()
    const other = connect()
    other.say({ t: "list" })
    expect(other.last("rooms")!.rooms).toEqual([])
    other.say({ t: "join", code: [...hub.rooms.keys()][0], primary: "cramar" })
    expect(other.got.at(-1)).toEqual({ t: "error", code: "notFound" })
    expect(me.last("joined")!.room.players).toBe(1)
  })

  test("it has no host tools: start, bots, their skill and changing team do nothing", () => {
    const h = started()
    for (const msg of [{ t: "start" }, { t: "bot", team: "malandanti", delta: 1 }, { t: "level", level: "plevan" }, { t: "team", team: "malandanti" }]) h.me.say(msg)
    h.play(2)
    // Nothing about the room changed: no bot, no skill, no team.
    expect(h.me.got.filter((m) => m.t === "room" || m.t === "error")).toEqual([])
    expect(h.me.last("snap")!.players).toHaveLength(1)
    // A restart would have killed the trainee and sent them to the skirmish's side of the square.
    expect(h.me.last("snap")!.you!.alive).toBe(true)
    expect(position(h.me).x).toBeLessThan(SAGRE_STATIONS.look.area.maxX)
    expect(view(h.me)).toMatchObject({ station: "look", step: "lookAround" })
  })
})

describe("station 1: look and move", () => {
  test("looking around completes only once the player has turned far enough", () => {
    const h = started()
    // Walking straight ahead, never turning: nothing completes.
    expect(drive(h, 60, () => ({ mz: 1, yaw: EAST }))).toEqual([])
    // A slight turn is not looking around.
    expect(drive(h, 20, () => ({ yaw: EAST + 0.5 }))).toEqual([])
    expect(view(h.me)).toMatchObject({ step: "lookAround", count: 0 })
    const events = drive(h, 30, (i) => ({ yaw: EAST + 0.5 + i * 0.05 }))
    expect(steps(events)).toEqual(["lookAround"])
    expect(view(h.me)).toMatchObject({ step: "walkToMarker", count: 0, target: 1 })
  })

  test("reaching the marker counts only once it is the current step", () => {
    const h = started()
    // Facing the marker all the way: it lies straight east of the start. Stops on it.
    const toMarker = () => {
      const b = position(h.me)
      return Math.hypot(b.x - MARKER[0], b.z - MARKER[2]) < 0.5 ? { yaw: EAST } : { mz: 1, yaw: Math.atan2(-(MARKER[0] - b.x), -(MARKER[2] - b.z)) }
    }
    // Walked to the marker while looking around is still the step: neither completes.
    expect(steps(drive(h, 240, toMarker))).toEqual([])
    const at = position(h.me)
    expect(Math.hypot(at.x - MARKER[0], at.z - MARKER[2])).toBeLessThan(MARKER_RADIUS)
    // Looking around on the marker completes that step, and only that one: already standing there is no reaching it.
    expect(steps(drive(h, 60, (i) => ({ yaw: EAST + i * 0.05 })))).toEqual(["lookAround"])
    expect(view(h.me)).toMatchObject({ step: "walkToMarker", count: 0 })
    // Stepping off the marker and back on is.
    drive(h, 60, () => ({ mz: 1, yaw: -EAST }))
    expect(view(h.me)).toMatchObject({ step: "walkToMarker", count: 0 })
    const events = drive(h, 120, toMarker)
    expect(steps(events)).toEqual(["walkToMarker"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "look" })
  })

  test("the automatic player completes station 1", () => {
    const h = started()
    const trainee = new Trainee(h.me.last("joined")!.you)
    const events: GameEvent[] = []
    for (let tick = 0; tick < 60 * 30; tick++) {
      for (const msg of trainee.think(h.me.last("snap"))) h.me.say(msg)
      const before = h.me.got.length
      h.play(1)
      for (const m of h.me.got.slice(before)) if (m.t === "snap") events.push(...m.ev.filter((e) => e.t === "training"))
      if (events.some((e) => e.t === "training" && e.a === "station" && e.station === "look")) break
    }
    expect(steps(events)).toEqual(["lookAround", "walkToMarker"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "look" })
    // Station 2 is unlocked; the stations that have no steps yet complete on arrival.
    const now = view(h.me)
    expect(now?.tag === "complete" || (now?.tag === "station" && now.unlocked >= 2)).toBe(true)
  })

  test("every station has its place on the fair", () => {
    expect(Object.keys(SAGRE_STATIONS).sort()).toEqual([...STATION_IDS].sort())
  })
})
