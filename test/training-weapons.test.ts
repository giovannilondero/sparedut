/**
 * Station 4 (changing weapon) and station 6 (the armoury), driven by protocol messages to the
 * in-browser host as the player's client drives them; and the interface-step report, which the
 * client sends to say how the player did something the simulation cannot see.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { Hub, type Clock } from "../server/hub.ts"
import { IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { initPhysics } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import type { StationId } from "../shared/training/index.ts"
import { REPORT_WINDOW_TICKS } from "../shared/training/stations/switch.ts"
import type { WeaponId } from "../shared/weapons.ts"
import { harness, type Client, type Harness } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"

beforeAll(() => initPhysics())

const browser = (clock: Clock) => createBrowserHost(clock)
const view = (me: Client) => me.last("snap")!.training
const arsenal = (me: Client) => me.last("snap")!.you!.arsenal

interface Started extends Harness {
  readonly me: Client
  /** The weapon the client last chose: every input carries it. */
  weapon: WeaponId
}

/** A training on the in-browser host, played by the automatic player until `station` is the current one. */
function started(station: StationId): Started {
  const h = harness(browser)
  const me = h.connect()
  me.say({ t: "training", primary: "cramar" })
  const trainee = new Trainee(me.last("joined")!.you)
  for (let tick = 0; tick < 60 * 600; tick++) {
    const now = me.last("snap")?.training
    if (now?.tag === "station" && now.station === station && me.last("snap")!.you!.alive) break
    for (const msg of trainee.think(me.last("snap"))) me.say(msg)
    h.play(1)
  }
  expect(view(me)).toMatchObject({ tag: "station", station })
  // The weapon the client holds, as a player's client keeps it: what the station put in hand.
  const at = { ...h, me, weapon: arsenal(me).current }
  // Inputs the automatic player sent before the station's setup reached it still arrive: let them pass.
  drive(at, SETTLE_TICKS)
  return at
}

/** Ticks for inputs already in flight to arrive and a weapon change to finish. */
const SETTLE_TICKS = 40

/** Sends one input per tick, as a client does (with any other messages first); returns the training events those ticks brought. */
function drive(h: Started, ticks: number, act: (tick: number) => { input?: Partial<PlayerInput>; say?: readonly object[] } = () => ({})) {
  const events: GameEvent[] = []
  let seq = h.me.last("snap")!.you!.seq
  for (let i = 0; i < ticks; i++) {
    const snap = h.me.last("snap")!
    const { input, say } = act(i)
    if (input?.weapon) h.weapon = input.weapon
    for (const msg of say ?? []) h.me.say(msg)
    h.me.say({ t: "input", i: { ...IDLE_INPUT, ...input, weapon: h.weapon, seq: ++seq, view: snap.tick } })
    const before = h.me.got.length
    h.play(1)
    for (const m of h.me.got.slice(before)) if (m.t === "snap") events.push(...m.ev.filter((e) => e.t === "training"))
  }
  return events
}

const steps = (events: GameEvent[]) => events.flatMap((e) => (e.t === "training" && e.a === "step" ? [e.step] : []))

/** The other weapon of the two the trainee always carries, the Mandi and the mescul. */
const other = (h: Started): WeaponId => (h.weapon === "mandi" ? "mescul" : "mandi")

/** Changes weapon on the first tick, with `report` sent just before as the client does; then waits out the report's window. */
const switchWith = (h: Started, report: string | null) => {
  const weapon = other(h)
  return drive(h, REPORT_WINDOW_TICKS + 10, (i) => (i === 0 ? { input: { weapon }, say: report ? [{ t: "report", a: report }] : [] } : { input: { weapon } }))
}

describe("station 4: changing weapon", () => {
  test("each switching step completes only when the weapon was changed in its own way", () => {
    const h = started("switch")
    expect(view(h.me)).toMatchObject({ step: "bySlot", count: 0, target: 1 })
    // Changing weapon with no word of how, or saying so without changing it: neither completes the step.
    expect(steps(switchWith(h, null))).toEqual([])
    expect(steps(drive(h, REPORT_WINDOW_TICKS + 10, (i) => (i === 0 ? { say: [{ t: "report", a: "slot" }] } : {})))).toEqual([])
    // Another step's way is ignored.
    expect(steps(switchWith(h, "lastWeapon"))).toEqual([])
    expect(steps(switchWith(h, "cycle"))).toEqual([])
    expect(view(h.me)).toMatchObject({ step: "bySlot", count: 0 })
    expect(steps(switchWith(h, "slot"))).toEqual(["bySlot"])

    expect(view(h.me)).toMatchObject({ step: "lastWeapon", count: 0 })
    expect(steps(switchWith(h, "slot"))).toEqual([])
    expect(steps(switchWith(h, "lastWeapon"))).toEqual(["lastWeapon"])

    expect(view(h.me)).toMatchObject({ step: "cycle", count: 0 })
    expect(steps(switchWith(h, "lastWeapon"))).toEqual([])
    const events = switchWith(h, "cycle")
    expect(steps(events)).toEqual(["cycle"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "switch" })
  })

  test("a report long before the weapon changes does not count", () => {
    const h = started("switch")
    drive(h, 1, () => ({ say: [{ t: "report", a: "slot" }] }))
    drive(h, REPORT_WINDOW_TICKS + 5)
    expect(steps(switchWith(h, null))).toEqual([])
    expect(view(h.me)).toMatchObject({ step: "bySlot", count: 0 })
  })
})

describe("station 6: the armoury", () => {
  test("choosing the primary the station gave completes nothing; choosing another completes the station", () => {
    const h = started("armoury")
    expect(view(h.me)).toMatchObject({ step: "choosePrimary", count: 0, target: 1 })
    const given = arsenal(h.me).primary
    h.me.say({ t: "primary", p: given })
    expect(steps(drive(h, 10))).toEqual([])
    // An interface report is no way to choose a primary.
    h.me.say({ t: "report", a: "slot" })
    expect(steps(drive(h, 10))).toEqual([])
    expect(view(h.me)).toMatchObject({ step: "choosePrimary", count: 0 })
    const chosen = given === "doplete" ? "mulin" : "doplete"
    h.me.say({ t: "primary", p: chosen })
    const events = drive(h, 10)
    expect(steps(events)).toEqual(["choosePrimary"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "armoury" })
    expect(arsenal(h.me).primary).toBe(chosen)
  })
})

describe("the automatic player", () => {
  test("completes station 4 and station 6", () => {
    const h = harness(browser)
    const me = h.connect()
    me.say({ t: "training", primary: "cramar" })
    const trainee = new Trainee(me.last("joined")!.you)
    const events: GameEvent[] = []
    const done = (station: StationId) => events.some((e) => e.t === "training" && e.a === "station" && e.station === station)
    for (let tick = 0; tick < 60 * 600 && !done("armoury"); tick++) {
      for (const msg of trainee.think(me.last("snap"))) me.say(msg)
      const before = me.got.length
      h.play(1)
      for (const m of me.got.slice(before)) if (m.t === "snap") events.push(...m.ev.filter((e) => e.t === "training"))
    }
    const of = (station: StationId) => events.flatMap((e) => (e.t === "training" && e.a === "step" && e.station === station ? [e.step] : []))
    expect(of("switch")).toEqual(["bySlot", "lastWeapon", "cycle"])
    expect(of("armoury")).toEqual(["choosePrimary"])
    expect(done("switch") && done("armoury")).toBe(true)
  })
})

describe("the interface-step report", () => {
  test("outside a training it is refused, by the in-browser host and by the game server", () => {
    for (const make of [browser, (clock: Clock) => new Hub(clock)]) {
      const h = harness(make)
      const me = h.connect()
      const reach = make === browser ? { reach: "offline" } : { reach: "online", access: { kind: "open" } }
      me.say({ t: "create", ...reach, mode: "bataie", map: "glemone", minutes: 5, bots: 0, level: "zovin", ff: false, primary: "cramar" })
      expect(me.last("joined")).toBeDefined()
      h.play(5)
      me.say({ t: "report", a: "slot" })
      expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
    }
  })

  test("with no room it is refused", () => {
    const h = harness(browser)
    const me = h.connect()
    me.say({ t: "report", a: "slot" })
    expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
  })

  test("an action that is not an interface step's is invalid", () => {
    const h = started("switch")
    h.me.say({ t: "report", a: "jump" })
    expect(h.me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
  })
})
