/**
 * The whole training, played by the automatic player on the in-browser host: from the first
 * station to the completion event, within a time bound, every station and every step in order. It
 * catches a step made impossible by a change to a weapon, a map or a rule, and reports what a host
 * tick costs during the training.
 */
import { beforeAll, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { initPhysics } from "../shared/physics.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import { STATION_IDS, stepsOf } from "../shared/training/index.ts"
import { harness } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"

beforeAll(() => initPhysics())

/** The game time the automatic player has to complete the training in (ticks). */
const BOUND_TICKS = 60 * 60 * 6
/** What a host tick may cost, on average, in milliseconds: well under a 60 Hz tick's 16.7. */
const TICK_BUDGET_MS = 4

test("the automatic player completes the whole training, every step in order, within the bound", () => {
  const h = harness(createBrowserHost)
  const me = h.connect()
  me.say({ t: "training", primary: "cramar" })
  const auto = new Trainee(me.last("joined")!.you)
  const events: GameEvent[] = []
  let hostMs = 0
  let ticks = 0
  while (ticks < BOUND_TICKS && !events.some((e) => e.t === "training" && e.a === "complete")) {
    for (const msg of auto.think(me.last("snap"))) me.say(msg)
    const before = me.got.length
    const started = performance.now()
    h.play(1)
    hostMs += performance.now() - started
    ticks++
    for (const m of me.got.slice(before)) if (m.t === "snap") events.push(...m.ev.filter((e) => e.t === "training"))
  }
  const msPerTick = hostMs / ticks
  console.log("training", { seconds: (ticks / 60).toFixed(0), msPerTick: msPerTick.toFixed(2) })

  const expected = STATION_IDS.flatMap((station) => [
    ...stepsOf(station).map((step): GameEvent => ({ t: "training", a: "step", station, step })),
    { t: "training", a: "station", station } as GameEvent
  ])
  expect(events).toEqual([...expected, { t: "training", a: "complete" }])
  expect(me.last("snap")!.training).toEqual({ tag: "complete" })
  expect(msPerTick).toBeLessThan(TICK_BUDGET_MS)
}, 120_000)
