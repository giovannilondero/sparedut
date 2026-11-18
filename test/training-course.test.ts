/**
 * Station 2, the obstacle course, and the ways between stations, driven by protocol messages to
 * the in-browser host as the player's client drives it.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import type { Clock } from "../server/hub.ts"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { SAGRE, SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import { stepBody } from "../shared/movement.ts"
import { createPhysicsWorld, initPhysics } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { closedGates, viewedStation } from "../shared/training/gates.ts"
import { harness, type Client } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"

beforeAll(() => initPhysics())

const TRAINING = { t: "training", primary: "cramar" }

/** A training started on the in-browser host, played until the trainee stands at the first station. */
function started() {
  const h = harness((clock: Clock) => createBrowserHost(clock))
  const me = h.connect()
  me.say(TRAINING)
  for (let i = 0; i < 120 && !me.last("snap")?.you?.alive; i++) h.play(1)
  return { ...h, me, trainee: new Trainee(me.last("joined")!.you) }
}
type Started = ReturnType<typeof started>

/** The training events in the messages a client got since `before`. */
const trainingEvents = (me: Client, before: number) =>
  me.got.slice(before).flatMap((m) => (m.t === "snap" ? m.ev.filter((e) => e.t === "training") : []))

/** Sends one input per tick, as a client does; returns the training events those ticks brought. */
function drive(h: Started, ticks: number, input: (tick: number) => Partial<PlayerInput>) {
  const events: GameEvent[] = []
  let seq = h.me.last("snap")!.you!.seq
  for (let i = 0; i < ticks; i++) {
    const snap = h.me.last("snap")!
    h.me.say({ t: "input", i: { ...IDLE_INPUT, weapon: snap.you!.arsenal.current, ...input(i), seq: ++seq, view: snap.tick } })
    const before = h.me.got.length
    h.play(1)
    events.push(...trainingEvents(h.me, before))
  }
  return events
}

/** Lets the automatic player play until `done` holds of the training events so far (or time runs out); returns them. */
function auto(h: Started, done: (events: GameEvent[]) => boolean, seconds = 60) {
  const events: GameEvent[] = []
  for (let tick = 0; tick < 60 * seconds && !done(events); tick++) {
    for (const msg of h.trainee.think(h.me.last("snap"))) h.me.say(msg)
    const before = h.me.got.length
    h.play(1)
    events.push(...trainingEvents(h.me, before))
  }
  return events
}

const completed = (station: string) => (events: GameEvent[]) => events.some((e) => e.t === "training" && e.a === "station" && e.station === station)
const steps = (events: GameEvent[]) => events.flatMap((e) => (e.t === "training" && e.a === "step" ? [e.step] : []))
const view = (me: Client) => me.last("snap")!.training
const position = (me: Client) => me.last("snap")!.you!.body
/** Facing straight east, along the street. */
const EAST = SAGRE_STATIONS.look.start.yaw
const east = () => ({ mz: 1, yaw: EAST })
/** Where each gate stands across the street (its west face). */
const gateX = (i: number) => SAGRE.gates![i].min[0]

describe("the way forward", () => {
  test("the player cannot reach station 2 before completing station 1", () => {
    const h = started()
    // Running east, jumping all the way: the street is open to the gate, and the gate stops them.
    drive(h, 60 * 8, (i) => ({ ...east(), buttons: i % 20 === 0 ? BUTTON.jump : 0 }))
    expect(position(h.me).x).toBeLessThan(gateX(0))
    expect(position(h.me).x).toBeGreaterThan(gateX(0) - 1)
    expect(view(h.me)).toMatchObject({ station: "look" })
  })

  test("once station 1 completes, its way opens and station 2 is reached on foot", () => {
    const h = started()
    expect(completed("look")(auto(h, completed("look")))).toBe(true)
    drive(h, 60 * 3, east)
    expect(position(h.me).x).toBeGreaterThan(SAGRE_STATIONS.course.area.minX)
  })

  test("a client predicting its own movement from the snapshot is stopped by the gate where the host stops it", () => {
    const h = started()
    drive(h, 60 * 4, east)
    const snap = h.me.last("snap")!
    // The client's own world, its gates closed as the snapshot's training says.
    const client = createPhysicsWorld(SAGRE)
    client.setGates(closedGates(SAGRE.gates!.length, viewedStation(snap.training)))
    let predicted = snap.you!.body
    let seq = snap.you!.seq
    for (let i = 0; i < 60 * 4; i++) {
      const input = { ...IDLE_INPUT, ...east(), weapon: snap.you!.arsenal.current, seq: ++seq, view: snap.tick }
      predicted = stepBody(predicted, input, client, 1).body
      h.me.say({ t: "input", i: input })
      h.play(1)
    }
    expect(predicted.x).toBeLessThan(gateX(0))
    expect(Math.abs(predicted.x - position(h.me).x)).toBeLessThan(0.05)
  })

  test("a snapshot of a regular room, or of a completed training, closes no gate", () => {
    expect(closedGates(3, viewedStation(null))).toEqual([false, false, false])
    expect(closedGates(3, viewedStation({ tag: "complete" }))).toEqual([false, false, false])
    expect(closedGates(3, viewedStation({ tag: "station", station: "always", step: null, count: 0, target: 0, unlocked: 12 }))).toEqual([false, false, true])
  })
})

const COURSE = SAGRE_STATIONS.course
const { bar, beam, sprintFrom, sprintLine } = COURSE
/** Walks east, or west with `back`; with `buttons` held. */
const along = (buttons = 0, back = false) => () => ({ mz: 1, yaw: back ? -EAST : EAST, buttons })
/** Station 1 done by the automatic player: the trainee stands on its marker, station 2 current. */
function atCourse() {
  const h = started()
  auto(h, completed("look"))
  expect(view(h.me)).toMatchObject({ station: "course", step: "jumpBar", count: 0, target: 1 })
  return h
}
/** Runs east and jumps once just before the bar. */
const jumpBar = (h: Started) => drive(h, 60 * 4, () => ({ ...east(), buttons: position(h.me).x > bar.min[0] - 1.3 && position(h.me).x < bar.min[0] ? BUTTON.jump : 0 }))

describe("station 2: the obstacle course", () => {
  test("walking into the bar does not jump it; jumping it does", () => {
    const h = atCourse()
    // Jumping on the spot, short of the bar: nothing.
    expect(drive(h, 60, (i) => ({ buttons: i % 20 === 0 ? BUTTON.jump : 0 }))).toEqual([])
    // Walking into it: stopped, nothing.
    expect(drive(h, 60 * 3, east)).toEqual([])
    expect(position(h.me).x).toBeLessThan(bar.min[0])
    expect(steps(jumpBar(h))).toEqual(["jumpBar"])
    expect(position(h.me).x).toBeGreaterThan(bar.max[0])
    expect(view(h.me)).toMatchObject({ station: "course", step: "crouchBeam" })
  })

  test("crouching counts only under the beam, and standing up the beam stops you", () => {
    const h = atCourse()
    jumpBar(h)
    // Crouching in place, then walking into the beam standing: nothing.
    expect(drive(h, 60, () => ({ buttons: BUTTON.crouch }))).toEqual([])
    expect(drive(h, 60 * 3, east)).toEqual([])
    expect(position(h.me).x).toBeLessThan(beam.min[0])
    // Crouched under it.
    expect(steps(drive(h, 60 * 2, along(BUTTON.crouch)))).toEqual(["crouchBeam"])
    expect(position(h.me).x).toBeGreaterThan(beam.max[0])
    expect(view(h.me)).toMatchObject({ station: "course", step: "sprintToLine" })
  })

  test("walking past the line is not sprinting to it; a sprint from the run-up is, and it opens the way on", () => {
    const h = atCourse()
    jumpBar(h)
    drive(h, 60 * 2, along(BUTTON.crouch))
    // Walking past the line.
    expect(drive(h, 60 * 3, east)).toEqual([])
    expect(position(h.me).x).toBeGreaterThan(sprintLine)
    // A sprint started just short of the line is no run.
    drive(h, 30, along(0, true))
    expect(position(h.me).x).toBeLessThan(sprintLine)
    expect(position(h.me).x).toBeGreaterThan(sprintLine - 3)
    expect(drive(h, 60, along(BUTTON.sprint))).toEqual([])
    // The way on is still closed.
    drive(h, 60, east)
    expect(position(h.me).x).toBeLessThan(gateX(1))
    // Back to the run-up, and sprinting from it.
    while (position(h.me).x > sprintFrom[0]) drive(h, 1, along(0, true))
    const events = drive(h, 60 * 2, along(BUTTON.sprint))
    expect(steps(events)).toEqual(["sprintToLine"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "course" })
    // The way to station 3 is open.
    drive(h, 60 * 2, east)
    expect(position(h.me).x).toBeGreaterThan(SAGRE_STATIONS.always.area.minX)
  })

  test("the automatic player completes stations 1 and 2", () => {
    const h = started()
    const events = auto(h, completed("course"), 90)
    expect(steps(events)).toEqual(["lookAround", "walkToMarker", "jumpBar", "crouchBeam", "sprintToLine"])
    expect(events.filter((e) => e.t === "training" && e.a === "station").slice(0, 2)).toEqual([
      { t: "training", a: "station", station: "look" },
      { t: "training", a: "station", station: "course" }
    ])
  })
})

