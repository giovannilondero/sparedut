/**
 * A training on the in-browser host, played by the automatic player until a station (or one of its
 * steps) is current, then driven by hand as a client drives it.
 */
import { expect } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import type { V3 } from "../shared/map.ts"
import type { GameEvent } from "../shared/sim/events.ts"
import type { StationId, StepId } from "../shared/training/index.ts"
import { harness } from "./harness.ts"
import { Trainee } from "./trainee/index.ts"
import { alongTheStreet } from "./trainee/pickups.ts"

/**
 * Plays the automatic player until `station` is current (and its step `step`, when given); `seen`
 * gets every snapshot's station and objective on the way, before the station.
 */
export function reach(station: StationId, seen?: (station: string, objective: string) => void, step?: StepId) {
  const h = harness(createBrowserHost)
  const me = h.connect()
  me.say({ t: "training", primary: "cramar" })
  for (let i = 0; i < 120 && !me.last("snap")?.you?.alive; i++) h.play(1)
  const you = me.last("joined")!.you
  const auto = new Trainee(you)
  for (let tick = 0; tick < 60 * 900; tick++) {
    const now = me.last("snap")!
    if (now.training?.tag === "station") {
      if (now.training.station === station && (step === undefined || now.training.step === step)) break
      if (now.training.station !== station) seen?.(now.training.station, now.objective)
    }
    for (const msg of auto.think(me.last("snap"))) me.say(msg)
    h.play(1)
  }
  expect(me.last("snap")!.training).toMatchObject(step === undefined ? { tag: "station", station } : { tag: "station", station, step })
  let seq = me.last("snap")!.you!.seq
  const snap = () => me.last("snap")!
  /** Sends one input per tick, as a client does; returns every event those ticks brought. */
  const drive = (ticks: number, input: (tick: number) => Partial<PlayerInput>, until?: (events: GameEvent[]) => boolean) => {
    const events: GameEvent[] = []
    for (let i = 0; i < ticks; i++) {
      me.say({ t: "input", i: { ...IDLE_INPUT, weapon: snap().you!.arsenal.current, ...input(i), seq: ++seq, view: snap().tick } })
      const before = me.got.length
      h.play(1)
      for (const m of me.got.slice(before)) if (m.t === "snap") events.push(...m.ev)
      if (until?.(events)) break
    }
    return events
  }
  /** Walks to a point and stops on it. */
  const walkTo = (to: V3, ticks = 60 * 30) =>
    drive(ticks, () => alongTheStreet(snap().you!.body, to), () => {
      const b = snap().you!.body
      return Math.hypot(b.x - to[0], b.z - to[2]) < 0.4
    })
  /** Stands still for a while. */
  const wait = (ticks: number) => drive(ticks, () => ({}))
  return { ...h, me, you, snap, drive, walkTo, wait }
}

/** The training steps completed among `events`, in order. */
export const steps = (events: GameEvent[]) => events.flatMap((e) => (e.t === "training" && e.a === "step" ? [e.step] : []))
