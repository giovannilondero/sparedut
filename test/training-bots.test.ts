/**
 * Bots at the training's stations, and station 3, "Always with you", driven by protocol messages
 * to the in-browser host as the player's client drives it.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import type { Clock } from "../server/hub.ts"
import { IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import { initPhysics } from "../shared/physics.ts"
import { FLAG_BIT, type SnapOther, type Snapshot } from "../shared/protocol.ts"
import { RESPAWN_TICKS } from "../shared/sim/rules.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { STATION_IDS, STATIONS } from "../shared/training/index.ts"
import { MAX_STATION_BOTS } from "../shared/training/station.ts"
import { harness, type Client } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"

beforeAll(() => initPhysics())

const browser = (clock: Clock) => createBrowserHost(clock)
const ALWAYS = SAGRE_STATIONS.always
const BOTS = STATIONS.always.setup.bots

type Started = ReturnType<typeof started>

function started() {
  const h = harness(browser)
  const me = h.connect()
  me.say({ t: "training", primary: "cramar" })
  for (let i = 0; i < 120 && !me.last("snap")?.you?.alive; i++) h.play(1)
  return { ...h, me, id: me.last("joined")!.you }
}

/** Sends one input per tick, as a client does; returns the game events those ticks brought. */
function drive(h: Started, ticks: number, input: (snap: Snapshot, tick: number) => Partial<PlayerInput>, until?: (events: GameEvent[]) => boolean) {
  const events: GameEvent[] = []
  let seq = h.me.last("snap")!.you!.seq
  for (let i = 0; i < ticks; i++) {
    const snap = h.me.last("snap")!
    h.me.say({ t: "input", i: { ...IDLE_INPUT, weapon: snap.you!.arsenal.current, ...input(snap, i), seq: ++seq, view: snap.tick } })
    const before = h.me.got.length
    h.play(1)
    for (const m of h.me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
    if (until?.(events)) break
  }
  return events
}

/** Lets the automatic player play until `done` says so, at most `ticks` ticks. */
function autoplay(h: Started, ticks: number, done: (snap: Snapshot) => boolean) {
  const trainee = new Trainee(h.id)
  const events: GameEvent[] = []
  for (let i = 0; i < ticks && !done(h.me.last("snap")!); i++) {
    for (const msg of trainee.think(h.me.last("snap"))) h.me.say(msg)
    const before = h.me.got.length
    h.play(1)
    for (const m of h.me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
  }
  return events
}

const yawTo = (from: { x: number; z: number }, at: readonly number[]) => Math.atan2(-(at[0] - from.x), -(at[2] - from.z))
const station = (snap: Snapshot) => (snap.training?.tag === "station" ? snap.training.station : null)
const step = (snap: Snapshot) => (snap.training?.tag === "station" ? snap.training.step : null)

/**
 * The trainee at station 3's start, its first step current: the automatic player does the stations
 * before it, then it walks in (over the bar and under the beam, while station 2 has no steps of its own).
 */
function atAlways(): Started {
  const h = started()
  autoplay(h, 60 * 60, (snap) => station(snap) === "always")
  expect(station(h.me.last("snap")!)).toBe("always")
  drive(
    h,
    60 * 30,
    (snap) => {
      const b = snap.you!.body
      return {
        mz: 1,
        yaw: yawTo(b, ALWAYS.start.at),
        buttons: (b.x > -126.5 && b.x < -123 ? 4 : 0) | (b.x > -116.5 && b.x < -112.5 ? 8 : 0)
      }
    },
    () => h.me.last("snap")!.you!.body.x >= ALWAYS.start.at[0] - 0.5
  )
  // Face east again, standing; long enough for the bots to have arrived.
  drive(h, 60, () => ({ yaw: ALWAYS.start.yaw }))
  return h
}

const bots = (me: Client, id: string) => me.last("snap")!.players.filter((p) => p.id !== id)
const alive = (p: { f: number }) => (p.f & FLAG_BIT.alive) !== 0
const FIRE = 1
const AIM = 2
const RELOAD = 32

/** The look that faces a player's chest from the trainee, firing on every other tick. */
function shootAt(snap: Snapshot, target: SnapOther, tick: number, buttons = 0): Partial<PlayerInput> {
  const me = snap.you!.body
  const rise = target.y + 1.1 - (me.y + 1.6)
  return {
    yaw: yawTo(me, [target.x, target.y, target.z]),
    pitch: Math.atan2(rise, Math.hypot(target.x - me.x, target.z - me.z)),
    buttons: (tick % 2 === 0 ? FIRE : 0) | buttons
  }
}

/** The bot nearest the trainee, preferring one alive and unshielded (at the start, the mescul's target). */
const nearest = (snap: Snapshot, id: string) => {
  const me = snap.you!.body
  const others = snap.players.filter((p) => p.id !== id)
  const open = others.filter((p) => alive(p) && !(p.f & FLAG_BIT.shield))
  return (open.length ? open : others).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]
}

/** How far `p` is from a route: from its only point, or from the nearest point of any of its legs. */
function offRoute(p: { x: number; z: number }, route: readonly (readonly number[])[]) {
  let best = Math.hypot(p.x - route[0][0], p.z - route[0][2])
  for (let i = 1; i < route.length; i++) {
    const [ax, , az] = route[i - 1]
    const [bx, , bz] = route[i]
    const along = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)))
    best = Math.min(best, Math.hypot(p.x - (ax + along * (bx - ax)), p.z - (az + along * (bz - az))))
  }
  return best
}

describe("bots at a station", () => {
  // By the time the trainee has walked in, a bot with a route is somewhere along it, not at its start.
  test("entering station 3 brings its bots, alive on their routes", () => {
    const h = started()
    expect(bots(h.me, h.id)).toEqual([])
    const there = atAlways()
    const present = bots(there.me, there.id)
    expect(present).toHaveLength(BOTS.length)
    for (const bot of BOTS) {
      expect(present.some((p) => alive(p) && p.hp === bot.hp && offRoute(p, bot.route) < 1)).toBe(true)
    }
  })
})

describe("bots at a station, under fire", () => {
  test("a bot at a station never fires, whatever the player does", () => {
    const h = atAlways()
    const ids = bots(h.me, h.id).map((p) => p.id)
    // Shoots them, walks up to them, kicks them, stands among them.
    const events = [
      ...drive(h, 60 * 5, (snap, i) => shootAt(snap, nearest(snap, h.id), i)),
      ...drive(h, 60 * 5, (snap, i) => {
        const b = nearest(snap, h.id)
        const me = snap.you!.body
        return Math.hypot(b.x - me.x, b.z - me.z) > 1.2 ? { mz: 1, yaw: yawTo(me, [b.x, b.y, b.z]), weapon: "mescul" } : { ...shootAt(snap, b, i), weapon: "mescul" }
      }),
      ...drive(h, 60 * 5, () => ({}))
    ]
    expect(events.some((e) => e.t === "hit" && e.a === h.id)).toBe(true)
    expect(events.filter((e) => (e.t === "shot" || e.t === "melee" || e.t === "launch" || e.t === "hit") && ids.includes(e.t === "hit" ? (e.a ?? "") : e.s))).toEqual([])
    expect(h.me.last("snap")!.you!.hp).toBe(100)
  })

  test("a killed bot comes back at its post after the usual delay, with its health", () => {
    const h = atAlways()
    const target = nearest(h.me.last("snap")!, h.id)
    const post = { x: target.x, z: target.z }
    const shot = drive(h, 60 * 20, (snap, i) => shootAt(snap, snap.players.find((p) => p.id === target.id)!, i), (ev) => ev.some((e) => e.t === "kill" && e.v === target.id))
    expect(shot.some((e) => e.t === "kill" && e.v === target.id)).toBe(true)
    const killedAt = h.me.last("snap")!.tick
    // Still dead a little before the delay is up, back once it is.
    const waited = drive(h, RESPAWN_TICKS + 30, () => ({}), (ev) => ev.some((e) => e.t === "spawn" && e.s === target.id))
    expect(waited.some((e) => e.t === "spawn" && e.s === target.id)).toBe(true)
    expect(h.me.last("snap")!.tick - killedAt).toBeGreaterThanOrEqual(RESPAWN_TICKS - 4)
    const back = h.me.last("snap")!.players.find((p) => p.id === target.id)!
    expect(alive(back)).toBe(true)
    expect(back.hp).toBe(100)
    expect(Math.hypot(back.x - post.x, back.z - post.z)).toBeLessThan(0.5)
  })

  test("no station lists more bots than may be alive at once", () => {
    for (const id of STATION_IDS) expect(STATIONS[id].setup.bots.length).toBeLessThanOrEqual(MAX_STATION_BOTS)
  })
})

describe("station 3: always with you", () => {
  test("the automatic player completes station 3; leaving it removes its bots, which never fired and were never more than four", () => {
    const h = atAlways()
    const ids = bots(h.me, h.id).map((p) => p.id)
    let most = 0
    const trainee = new Trainee(h.id)
    const events: GameEvent[] = []
    for (let i = 0; i < 60 * 90 && station(h.me.last("snap")!) === "always"; i++) {
      for (const msg of trainee.think(h.me.last("snap"))) h.me.say(msg)
      const before = h.me.got.length
      h.play(1)
      for (const m of h.me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
      most = Math.max(most, bots(h.me, h.id).filter(alive).length)
    }
    const done = events.flatMap((e) => (e.t === "training" && e.a === "step" ? [e.step] : []))
    expect(done).toEqual(["mandiHit", "aimedHit", "reload", "mesculHit", "doorDown"])
    expect(events).toContainEqual({ t: "training", a: "station", station: "always" })
    expect(most).toBeLessThanOrEqual(4)
    expect(events.filter((e) => (e.t === "shot" || e.t === "melee" || e.t === "launch") && ids.includes(e.s))).toEqual([])
    expect(h.me.last("snap")!.you!.hp).toBe(100)
    h.play(2)
    expect(bots(h.me, h.id).filter((p) => ids.includes(p.id))).toEqual([])
  })
})

const stepsIn = (events: GameEvent[]) => events.flatMap((e) => (e.t === "training" && e.a === "step" ? [e.step] : []))
const stepDone = (events: GameEvent[]) => stepsIn(events).length > 0
const DOOR_FRONT = ALWAYS.doorFront
const doorHp = (h: Started) => h.me.last("snap")!.doors[ALWAYS.door]

describe("station 3's steps complete only with their own action", () => {
  test("a Mandi hit, then one while aiming, then a reload, then a mescul hit", () => {
    const h = atAlways()
    const target = (snap: Snapshot) => nearest(snap, h.id)
    // Firing at the sky hits nobody.
    expect(stepsIn(drive(h, 60, (_, i) => ({ pitch: 1.2, buttons: i % 2 === 0 ? FIRE : 0 })))).toEqual([])
    expect(step(h.me.last("snap")!)).toBe("mandiHit")
    // A hit, not aiming: the first step, and only that.
    expect(stepsIn(drive(h, 60 * 5, (snap, i) => shootAt(snap, target(snap), i), stepDone))).toEqual(["mandiHit"])
    // More hits without aiming are not the aimed hit.
    const unaimed = drive(h, 40, (snap, i) => shootAt(snap, target(snap), i))
    expect(unaimed.some((e) => e.t === "hit" && e.a === h.id)).toBe(true)
    expect(stepsIn(unaimed)).toEqual([])
    expect(stepsIn(drive(h, 60 * 5, (snap, i) => shootAt(snap, target(snap), i, AIM), stepDone))).toEqual(["aimedHit"])
    // Firing is not reloading; pressing reload is.
    expect(stepsIn(drive(h, 10, (_, i) => ({ pitch: 1.2, buttons: i % 2 === 0 ? FIRE : 0 })))).toEqual([])
    expect(stepsIn(drive(h, 10, (_, i) => ({ buttons: i % 2 === 0 ? RELOAD : 0 }), stepDone))).toEqual(["reload"])
    // Mandi hits and a mescul swung at nobody are not a mescul hit.
    drive(h, 120, () => ({}))
    const mandi = drive(h, 60, (snap, i) => shootAt(snap, target(snap), i))
    expect(mandi.some((e) => e.t === "hit" && e.a === h.id)).toBe(true)
    expect(stepsIn(mandi)).toEqual([])
    expect(stepsIn(drive(h, 60, (_, i) => ({ weapon: "mescul", yaw: Math.PI, buttons: i % 2 === 0 ? FIRE : 0 })))).toEqual([])
    const kicked = drive(
      h,
      60 * 10,
      (snap, i) => {
        const b = target(snap)
        const me = snap.you!.body
        return Math.hypot(b.x - me.x, b.z - me.z) > 1.2 ? { mz: 1, yaw: yawTo(me, [b.x, b.y, b.z]), weapon: "mescul" } : { ...shootAt(snap, b, i), weapon: "mescul" }
      },
      stepDone
    )
    expect(stepsIn(kicked)).toEqual(["mesculHit"])
    expect(step(h.me.last("snap")!)).toBe("doorDown")
  })

  test("the door broken down by Mandi shots stands again and does not complete the step; the mescul does", () => {
    const h = atAlways()
    autoplay(h, 60 * 60, (snap) => step(snap) === "doorDown")
    expect(step(h.me.last("snap")!)).toBe("doorDown")
    drive(h, 60 * 10, (snap) => ({ mz: 1, yaw: yawTo(snap.you!.body, DOOR_FRONT), weapon: "mandi" }), () => {
      const b = h.me.last("snap")!.you!.body
      return Math.hypot(b.x - DOOR_FRONT[0], b.z - DOOR_FRONT[2]) < 0.3
    })
    // Facing the door, to the north, the Mandi shoots it down: the step does not complete and the door is back.
    const shot = drive(h, 60 * 10, (_, i) => ({ weapon: "mandi", yaw: 0, buttons: i % 2 === 0 ? FIRE : 0 }), (ev) => ev.some((e) => e.t === "door" && e.a === "broken"))
    expect(shot).toContainEqual({ t: "door", i: ALWAYS.door, s: h.id, a: "broken" })
    expect(stepsIn(shot)).toEqual([])
    h.play(2)
    expect(doorHp(h)).toBeGreaterThan(0)
    const kicked = drive(h, 60 * 10, (_, i) => ({ weapon: "mescul", yaw: 0, buttons: i % 2 === 0 ? FIRE : 0 }), stepDone)
    expect(kicked).toContainEqual({ t: "door", i: ALWAYS.door, s: h.id, a: "broken" })
    expect(stepsIn(kicked)).toEqual(["doorDown"])
  })
})
