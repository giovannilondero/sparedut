/**
 * The Motosee, the chainsaw primary: driven through the simulation's inputs and read through its
 * view and events. Players stand on posts so that distances are exact.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { Hub, type Clock } from "../server/hub.ts"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { G_DUOMO, GLEMONE } from "../shared/maps/glemone.ts"
import { CASOT, MARAN } from "../shared/maps/maran.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { createSim, type Sim } from "../shared/sim/index.ts"
import { SHIELD_TICKS } from "../shared/sim/rules.ts"
import type { PostValue } from "../shared/sim/schema.ts"
import { CLASSES, PRIMARIES, WEAPONS, type PrimaryId } from "../shared/weapons.ts"
import { harness } from "./harness.ts"

let glemone: PhysicsWorld
let maran: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  glemone = createPhysicsWorld(GLEMONE)
  maran = createPhysicsWorld(MARAN)
})

type Team = "benandanti" | "malandanti"
interface Member {
  readonly id: string
  readonly team: Team
  readonly primary: PrimaryId
  readonly post: PostValue
}

/** On the sagrato, facing south (yaw π: towards +z), where the ground is open and flat. */
const SAGRATO = { x: 15, z: -40 }
const onSagrato = (dz: number, hp = 1000): PostValue => ({ at: [SAGRATO.x, G_DUOMO, SAGRATO.z + dz], yaw: Math.PI, hp })
const SOUTH = Math.PI

/** A match under way, with everyone on their post and past their spawn protection. */
function match(physics: PhysicsWorld, members: Member[], o: { ff?: boolean } = {}) {
  const sim = createSim({ mode: "bataie", minutes: 10, seed: 5, physics, friendlyFire: o.ff ?? false })
  for (const m of members) sim.join(m.id, m.id, m.team, false, m.primary, m.post)
  sim.start()
  sim.step()
  for (let i = 0; i < SHIELD_TICKS + 5; i++) {
    for (const m of members) sim.input(m.id, stand(sim, m.id))
    sim.step()
  }
  return sim
}

let seq = 0
const me = (sim: Sim, id: string) => sim.view().players.find((p) => p.session === id)!
const stand = (sim: Sim, id: string, extra: Partial<PlayerInput> = {}): PlayerInput => ({
  ...IDLE_INPUT,
  seq: ++seq,
  yaw: SOUTH,
  weapon: me(sim, id).arsenal.current,
  view: sim.view().tick,
  ...extra
})

/** The cutter holds the trigger for `ticks` ticks, facing `yaw`, and the others stand still: the events of each tick. */
function cut(sim: Sim, cutter: string, ticks: number, others: string[], yaw = SOUTH): GameEvent[][] {
  const out: GameEvent[][] = []
  for (let i = 0; i < ticks; i++) {
    sim.input(cutter, stand(sim, cutter, { yaw, pitch: -0.1, weapon: "motosee", buttons: BUTTON.fire }))
    for (const o of others) sim.input(o, stand(sim, o))
    out.push(sim.step())
  }
  return out
}
const hitsOn = (ticks: GameEvent[][], victim: string) =>
  ticks.flatMap((events, tick) => events.flatMap((e) => (e.t === "hit" && e.v === victim ? [{ tick, d: e.d }] : [])))

const cutter = (post = onSagrato(0)): Member => ({ id: "toni", team: "benandanti", primary: "motosee", post })

describe("the Motosee as a primary", () => {
  test("it is a primary and its class has 125 health and base speed 1.12", () => {
    expect(PRIMARIES).toContain("motosee")
    expect(CLASSES.motosee).toEqual({ hp: 125, speed: 1.12, trait: null })
  })

  test("its player spawns holding the Motosee", () => {
    const sim = match(glemone, [cutter()])
    expect(me(sim, "toni").arsenal.current).toBe("motosee")
  })
})

describe("cutting", () => {
  const victim: Member = { id: "bepi", team: "malandanti", primary: "cramar", post: onSagrato(1.6) }

  test("nothing before the rev, then 14 damage every 4 ticks for as long as the trigger is held", () => {
    const sim = match(glemone, [cutter(), victim])
    const hits = hitsOn(cut(sim, "toni", 60, ["bepi"]), "bepi")
    expect(hits.length).toBeGreaterThan(5)
    // The rev: 20 ticks of holding before the first bite.
    expect(hits[0].tick).toBeGreaterThanOrEqual(19)
    expect(hits[0].tick).toBeLessThanOrEqual(21)
    for (const h of hits) expect(h.d).toBe(14)
    for (let i = 1; i < hits.length; i++) expect(hits[i].tick - hits[i - 1].tick).toBe(4)
  })

  test("letting go stops it, and it has to rev again", () => {
    const sim = match(glemone, [cutter(), victim])
    cut(sim, "toni", 40, ["bepi"])
    for (let i = 0; i < 60; i++) {
      sim.input("toni", stand(sim, "toni", { weapon: "motosee" }))
      sim.input("bepi", stand(sim, "bepi"))
      expect(sim.step().some((e) => e.t === "hit")).toBe(false)
    }
    const again = hitsOn(cut(sim, "toni", 40, ["bepi"]), "bepi")
    expect(again[0].tick).toBeGreaterThanOrEqual(19)
  })

  test("it uses no ammunition", () => {
    const sim = match(glemone, [cutter(), victim])
    expect(WEAPONS.motosee.magazine).toBe(0)
    expect(WEAPONS.motosee.reserve).toBe(0)
    const before = me(sim, "toni").arsenal.ammo.motosee
    expect(hitsOn(cut(sim, "toni", 200, ["bepi"]), "bepi").length).toBeGreaterThan(20)
    expect(me(sim, "toni").arsenal.ammo.motosee).toEqual(before)
    expect(sim.step().some((e) => e.t === "reload")).toBe(false)
  })

  test("it never reaches a player beyond its reach", () => {
    const far: Member = { ...victim, post: onSagrato(WEAPONS.motosee.range + 0.8) }
    const sim = match(glemone, [cutter(), far])
    expect(hitsOn(cut(sim, "toni", 120, ["bepi"]), "bepi")).toEqual([])
  })

  test("it never reaches anyone behind its carrier", () => {
    const behind: Member = { ...victim, post: onSagrato(-1.6) }
    const sim = match(glemone, [cutter(), behind])
    expect(hitsOn(cut(sim, "toni", 120, ["bepi"]), "bepi")).toEqual([])
  })

  test("it spares a teammate without friendly fire, and cuts them with it", () => {
    const mate: Member = { ...victim, team: "benandanti" }
    expect(hitsOn(cut(match(glemone, [cutter(), mate]), "toni", 120, ["bepi"]), "bepi")).toEqual([])
    expect(hitsOn(cut(match(glemone, [cutter(), mate], { ff: true }), "toni", 120, ["bepi"]), "bepi").length).toBeGreaterThan(0)
  })

  test("no extra damage to the head", () => {
    expect(WEAPONS.motosee.headMultiplier).toBe(1)
  })

  test("a kill with it has its own cause and counts in the statistics", () => {
    const sim = match(glemone, [cutter(), { ...victim, post: onSagrato(1.6, 40) }])
    const kills = cut(sim, "toni", 60, ["bepi"]).flat().filter((e) => e.t === "kill")
    expect(kills).toEqual([expect.objectContaining({ k: "toni", v: "bepi", w: "motosee" })])
    expect(me(sim, "toni").stats.kills).toBe(1)
    expect(me(sim, "bepi").stats.deaths).toBe(1)
  })
})

describe("the Motosee on a door", () => {
  test("it cuts the casot door down in about a second", () => {
    // Outside the casot's door, facing it (east, towards +x).
    const post: PostValue = { at: [CASOT.minX - 0.8, CASOT.floor, 27], yaw: -Math.PI / 2, hp: 1000 }
    const sim = match(maran, [cutter(post)])
    expect(sim.view().doors[0]).toBeGreaterThan(0)
    const ticks = cut(sim, "toni", 120, [], -Math.PI / 2)
    const broken = ticks.findIndex((events) => events.some((e) => e.t === "door" && e.a === "broken" && e.s === "toni"))
    // From the first touch of the trigger, rev included: between 0.75 and 1.25 seconds.
    expect(broken).toBeGreaterThanOrEqual(45)
    expect(broken).toBeLessThanOrEqual(75)
    expect(sim.view().doors[0]).toBe(0)
  })
})

/** The same protocol messages, sent to both hosts, as `hosts.test.ts` does. */
const HOSTS = [
  { name: "the game server", reach: "online", access: { access: { kind: "open" } }, make: (clock: Clock) => new Hub(clock) },
  { name: "the in-browser host", reach: "offline", access: {}, make: (clock: Clock) => createBrowserHost(clock) }
] as const

for (const host of HOSTS) {
  describe(`the Motosee in the Muster, on ${host.name}`, () => {
    const create = { t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: host.reach, ...host.access, bots: 7, level: "pari", ff: false, primary: "cramar" }

    test("a member chooses it, or creates the room with it, and enters the match holding it", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say(create)
      const { you } = me.last("joined")!
      me.say({ t: "primary", p: "motosee" })
      expect(me.last("room")!.room.roster.find((r) => r.id === you)!.primary).toBe("motosee")
      me.say({ t: "start" })
      play(30)
      expect(me.last("snap")!.you?.arsenal.primary).toBe("motosee")

      const other = harness(host.make).connect()
      other.say({ ...create, primary: "motosee" })
      expect(other.last("room")!.room.roster.find((r) => r.id === other.last("joined")!.you)!.primary).toBe("motosee")
    })

    test("no bot takes it", () => {
      const { connect } = harness(host.make)
      const me = connect()
      me.say(create)
      for (let i = 0; i < 8; i++) me.say({ t: "bot", team: i % 2 ? "benandanti" : "malandanti", delta: 1 })
      const bots = me.last("room")!.room.roster.filter((r) => r.bot)
      expect(bots.length).toBeGreaterThan(8)
      expect(bots.map((b) => b.primary)).not.toContain("motosee")
    })
  })
}
