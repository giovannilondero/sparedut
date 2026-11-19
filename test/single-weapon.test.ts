/**
 * Single weapon: a room setting, off or one primary. Against both hosts, as a client sees it, and
 * through the simulation driven by inputs.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { Hub, type Clock } from "../server/hub.ts"
import { Room } from "../server/room.ts"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { turretRestSeat } from "../shared/map.ts"
import { GLEMONE } from "../shared/maps/glemone.ts"
import { MARAN } from "../shared/maps/maran.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"
import { FLAG_BIT } from "../shared/protocol.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { createSim, type Sim } from "../shared/sim/index.ts"
import { freshArsenal, owned, restock, SHIELD_TICKS } from "../shared/sim/rules.ts"
import { CLASSES, PRIMARIES, RAIBL_MINE, SGNAPE_BOMB, WEAPONS, type PrimaryId } from "../shared/weapons.ts"
import { harness } from "./harness.ts"
import { onlooker } from "./play.ts"

let glemone: PhysicsWorld
let maran: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  glemone = createPhysicsWorld(GLEMONE)
  maran = createPhysicsWorld(MARAN)
})

const HOSTS = [
  { name: "the game server", reach: "online", access: { access: { kind: "open" } }, make: (clock: Clock) => new Hub(clock) },
  { name: "the in-browser host", reach: "offline", access: {}, make: (clock: Clock) => createBrowserHost(clock) }
] as const

/** Where the Lanciafrico lies on Glemone, in the snapshot's pickup string. */
const LAUNCHER = GLEMONE.pickups.findIndex((p) => p.kind === "lanciafrico")

for (const host of HOSTS) {
  describe(`single weapon on ${host.name}`, () => {
    const create = { t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: host.reach, ...host.access, bots: 3, level: "pari", ff: false, primary: "cramar" }

    test("a create request without single weapon makes a room with it off", () => {
      const { connect } = harness(host.make)
      const me = connect()
      me.say(create)
      expect(me.last("joined")!.room.single).toBeNull()
    })

    test("the create request carries single weapon: every member and bot is shown with that primary, and enters with it", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say({ ...create, single: "mulin" })
      const { room } = me.last("joined")!
      expect(room.single).toBe("mulin")
      const roster = me.last("room")!.room.roster
      expect(roster.length).toBe(6)
      expect(roster.every((r) => r.primary === "mulin")).toBe(true)
      me.say({ t: "start" })
      play(10)
      const snap = me.last("snap")!
      expect(snap.phase.tag).toBe("Live")
      expect(snap.players.length).toBe(6)
      expect(snap.players.every((p) => p.f & FLAG_BIT.alive && p.w === "mulin")).toBe(true)
      expect(snap.you?.arsenal.primary).toBe("mulin")
    })

    test("a change of primary in the Muster of a single-weapon room is refused", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say({ ...create, single: "doplete" })
      const { you } = me.last("joined")!
      me.say({ t: "primary", p: "cjampanili" })
      expect(me.last("room")!.room.roster.find((r) => r.id === you)!.primary).toBe("doplete")
      me.say({ t: "start" })
      play(10)
      expect(me.last("snap")!.you?.arsenal.primary).toBe("doplete")
    })

    test("in a single-weapon match the Lanciafrico is not on the map, and the other pickups are", () => {
      const { connect, play } = harness(host.make)
      const me = connect()
      me.say({ ...create, single: "gjalinis" })
      play(2)
      // Not on the map ("-"), which is not taken and coming back ("0"): nothing is drawn there.
      const inMuster = me.last("snap")!.pickups
      expect(inMuster[LAUNCHER]).toBe("-")
      me.say({ t: "start" })
      play(10)
      const live = me.last("snap")!.pickups
      expect(live[LAUNCHER]).toBe("-")
      expect([...live].filter((_, i) => i !== LAUNCHER).every((c) => c === "1")).toBe(true)
    })

    test("a training request cannot carry single weapon", () => {
      const { hub, connect } = harness(host.make)
      const me = connect()
      me.say({ t: "training", primary: "cramar", single: "mulin" })
      expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
      expect(hub.rooms.size).toBe(0)
    })

    test("a create request with a single weapon that is not a primary is refused", () => {
      const { hub, connect } = harness(host.make)
      const me = connect()
      me.say({ ...create, single: "lanciafrico" })
      expect(me.got.at(-1)).toEqual({ t: "error", code: "invalid" })
      expect(hub.rooms.size).toBe(0)
    })
  })
}

describe("single weapon in the room list", () => {
  test("the room list shows whether a room has single weapon on, and which", () => {
    const { connect } = harness(HOSTS[0].make)
    const base = { t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: "online", access: { kind: "open" }, bots: 0, level: "pari", ff: false, primary: "cramar" }
    connect().say({ ...base, single: "cjampanili" })
    connect().say(base)
    const browsing = connect()
    browsing.say({ t: "list" })
    expect(browsing.last("rooms")!.rooms.map((r) => r.single).sort()).toEqual(["cjampanili", null])
  })

  test("a member who joins a single-weapon room is shown with its primary, whatever they asked for", () => {
    const { connect } = harness(HOSTS[0].make)
    const host = connect()
    host.say({ t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: "online", access: { kind: "open" }, bots: 0, level: "pari", ff: false, primary: "cramar", single: "miedi" })
    const other = connect()
    other.say({ t: "join", code: host.last("joined")!.room.code, primary: "mulin" })
    const { room, you } = other.last("joined")!
    expect(room.roster.find((r) => r.id === you)!.primary).toBe("miedi")
  })
})

describe("single weapon for a member joining a match already on", () => {
  test("they enter the map with the setting's primary, whatever they asked for", () => {
    const { connect, play } = harness(HOSTS[0].make)
    const host = connect()
    host.say({ t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: "online", access: { kind: "open" }, bots: 1, level: "pari", ff: false, primary: "cramar", single: "gjalinis" })
    host.say({ t: "start" })
    play(10)
    const other = connect()
    other.say({ t: "join", code: host.last("joined")!.room.code, primary: "mulin" })
    other.say({ t: "primary", p: "doplete" })
    other.say({ t: "enter" })
    play(200)
    expect(other.last("snap")!.you?.arsenal.primary).toBe("gjalinis")
  })
})

// --- The simulation ------------------------------------------------------------------------

/** A match with one player, past the spawn shield; `single`, the room's setting. */
function match(physics: PhysicsWorld, primary: PrimaryId, single: PrimaryId | null, team: "benandanti" | "malandanti" = "benandanti") {
  const sim = createSim({ mode: "bataie", minutes: 5, seed: 3, physics, single })
  sim.join("a", "Toni", team, false, primary)
  sim.start(true)
  for (let i = 0; i < SHIELD_TICKS + 30; i++) sim.step()
  return sim
}

let seq = 0
const me = (sim: Sim) => sim.view().players.find((p) => p.session === "a")!
const command = (sim: Sim, extra: Partial<PlayerInput>): PlayerInput => ({ ...IDLE_INPUT, seq: ++seq, yaw: me(sim).yaw, weapon: me(sim).arsenal.current, view: sim.view().tick, ...extra })
const steps = (sim: Sim, n: number, extra: (i: number) => Partial<PlayerInput> = () => ({})) => {
  const events: GameEvent[] = []
  for (let i = 0; i < n; i++) {
    sim.input("a", command(sim, extra(i)))
    events.push(...sim.step())
  }
  return events
}

describe("single weapon in the simulation", () => {
  test("a player joins with the setting's primary, whatever they prefer, and a change of primary does nothing", () => {
    const sim = match(glemone, "cramar", "cjampanili")
    expect(me(sim).arsenal.primary).toBe("cjampanili")
    sim.primary("a", "mulin")
    steps(sim, 5)
    expect(me(sim).arsenal.primary).toBe("cjampanili")
  })

  test("a player's class is the single weapon's: they spawn with its health, whatever they prefer", () => {
    const sim = match(glemone, "cramar", "mulin")
    expect(me(sim).hp).toBe(CLASSES.mulin.hp)
  })

  test("a player owns only the primary and the Mescul: selecting the pistol does nothing", () => {
    const sim = match(glemone, "cramar", "doplete")
    steps(sim, 40, () => ({ weapon: "mandi" }))
    expect(me(sim).arsenal.current).toBe("doplete")
    steps(sim, 40, () => ({ weapon: "mescul" }))
    expect(me(sim).arsenal.current).toBe("mescul")
  })

  test("no bomb and no mine can be thrown", () => {
    const sim = match(glemone, "cramar", "doplete")
    expect(me(sim).arsenal).toMatchObject({ bombs: 0, mines: 0 })
    const events = steps(sim, 120, (i) => ({ buttons: i % 20 < 10 ? BUTTON.bomb | BUTTON.mine : 0 }))
    expect(sim.view().projectiles).toEqual([])
    expect(events.filter((e) => e.t === "launch")).toEqual([])
  })

  test("a player respawns with the same kit: the primary and the Mescul, no bomb, no mine", () => {
    const sim = match(glemone, "cramar", "mulin")
    sim.start(true) // ends the match: back to the Muster
    sim.step()
    sim.start(true)
    for (let i = 0; i < SHIELD_TICKS + 30; i++) sim.step()
    const a = me(sim).arsenal
    expect(a.primary).toBe("mulin")
    expect(owned(a, "mandi")).toBe(false)
    expect(a).toMatchObject({ bombs: 0, mines: 0 })
  })

  test("without single weapon a player keeps the primary they chose, the pistol, the bombs and the mines", () => {
    const sim = match(glemone, "cramar", null)
    const a = me(sim).arsenal
    expect(a.primary).toBe("cramar")
    expect(owned(a, "mandi")).toBe(true)
    expect(a).toMatchObject({ bombs: SGNAPE_BOMB.perLife, mines: RAIBL_MINE.perLife })
    expect(sim.view().pickups[GLEMONE.pickups.findIndex((p) => p.kind === "lanciafrico")]).toBe("up")
  })

  test("the Lanciafrico is not on the map, from the Muster to the next match", () => {
    const sim = match(glemone, "cramar", "miedi")
    const launchers = GLEMONE.pickups.flatMap((p, i) => (p.kind === "lanciafrico" ? [i] : []))
    expect(launchers.length).toBeGreaterThan(0)
    const check = () => {
      const pickups = sim.view().pickups
      expect(launchers.every((i) => pickups[i] === "absent")).toBe(true)
      expect(pickups.filter((_, i) => !launchers.includes(i)).every((p) => p === "up")).toBe(true)
    }
    check()
    sim.start(true)
    sim.step()
    sim.start(true)
    sim.step()
    check()
  })

  test("ammunition refills the primary and gives no bomb and no mine", () => {
    const used = { ...freshArsenal("doplete", "single"), ammo: { ...freshArsenal("doplete", "single").ammo, doplete: { mag: 0, reserve: 0 } } }
    const after = restock(used)!
    expect(after.ammo.doplete.reserve).toBe(WEAPONS.doplete.reserve)
    expect(after).toMatchObject({ bombs: 0, mines: 0 })
    // Full on what it owns: the pickup stays for someone else.
    expect(restock(freshArsenal("doplete", "single"))).toBeNull()
  })

  test("a turret still works in a single-weapon match", () => {
    const sim = match(maran, "cramar", "cjampanili", "malandanti")
    const spot = MARAN.turrets[1]
    const [sx, , sz] = turretRestSeat(spot)
    const start = me(sim).body
    const route: [number, number][] = start.z < 73 ? [[start.x, 66], [sx, 66], [sx, sz]] : [[start.x, 82], [-22, 82], [-22, 66], [sx, 66], [sx, sz]]
    for (let i = 0; i < 3000 && route.length; i++) {
      const p = me(sim).body
      if (Math.hypot(route[0][0] - p.x, route[0][1] - p.z) < (route.length === 1 ? 0.3 : 0.5)) {
        route.shift()
        continue
      }
      const close = route.length === 1 && Math.hypot(route[0][0] - p.x, route[0][1] - p.z) < 0.4
      sim.input("a", command(sim, { mz: close ? 0 : 1, yaw: Math.atan2(-(route[0][0] - p.x), -(route[0][1] - p.z)) }))
      sim.step()
    }
    expect(route).toEqual([])
    const events = steps(sim, 1, () => ({ buttons: BUTTON.use }))
    expect(events.some((e) => e.t === "turret" && e.a === "on" && e.s === "a")).toBe(true)
    const fired = steps(sim, 30, () => ({ buttons: BUTTON.fire, yaw: spot.yaw }))
    expect(fired.some((e) => e.t === "shot" && e.s === "a" && e.w === "mitraie")).toBe(true)
  })
})

// --- Whole matches between bots --------------------------------------------------------------

describe("single weapon between bots", () => {
  for (const primary of PRIMARIES) {
    test(`a whole match with ${primary} as the single weapon is played to its end`, () => {
      const room = new Room("TEST", "nessuno", "Test", "lan", { mode: "bataie", map: "glemone", minutes: 2, reach: "online", access: { kind: "open" }, level: "pari", ff: false, single: primary })
      room.fillBots(4)
      room.start()
      const feed = onlooker(room)
      const started = performance.now()
      let ticks = 0
      for (; ticks < 60 * 60 * 3 && room.sim.view().phase.tag !== "Over"; ticks++) room.step()
      const ms = (performance.now() - started) / ticks
      const v = room.sim.view()
      const kills = v.players.reduce((n, p) => n + p.stats.kills, 0)
      console.log(`single ${primary}`, { msPerTick: ms.toFixed(2), kills, score: v.score })
      expect(v.phase.tag).toBe("Over")
      expect(v.players.every((p) => p.arsenal.primary === primary)).toBe(true)
      expect(room.info().roster.every((r) => r.primary === primary)).toBe(true)
      expect(kills).toBeGreaterThan(0)
      // Bots with the Motosee close in and cut with it, rather than falling back to the Mescul.
      if (primary === "motosee") expect(feed.filter((e) => e.t === "kill" && e.w === "motosee").length).toBeGreaterThan(0)
      expect(ms).toBeLessThan(8)
    }, 120000)
  }
})
