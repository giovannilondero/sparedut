/**
 * The automatic player: a client of a training that reads the current step from its snapshots and
 * performs it with ordinary inputs, one per tick, as a player's client would. Each station's
 * drivers are in their own file here; `Drivers<S>` makes a new step need one.
 */
import { IDLE_INPUT, type PlayerInput } from "../../shared/input.ts"
import type { Snapshot } from "../../shared/protocol.ts"
import type { StationId, StepId } from "../../shared/training/index.ts"
import { ALWAYS } from "./always.ts"
import { ARMOURY } from "./armoury.ts"
import { COURSE } from "./course.ts"
import { LOOK } from "./look.ts"
import { MEDIC } from "./medic.ts"
import { MODES } from "./modes.ts"
import type { Act, Driver, Drivers } from "./moves.ts"
import { PICKUPS } from "./pickups.ts"
import { SKIRMISH } from "./skirmish.ts"
import { STALLS } from "./stalls.ts"
import { SWITCH } from "./switch.ts"
import { THROW } from "./throw.ts"
import { TURRET } from "./turret.ts"

const DRIVERS: { readonly [S in StationId]: Drivers<S> } = {
  look: LOOK,
  course: COURSE,
  always: ALWAYS,
  switch: SWITCH,
  stalls: STALLS,
  armoury: ARMOURY,
  throw: THROW,
  pickups: PICKUPS,
  turret: TURRET,
  medic: MEDIC,
  modes: MODES,
  skirmish: SKIRMISH
}

const driverOf = (station: StationId, step: StepId): Driver => (DRIVERS[station] as Readonly<Record<string, Driver>>)[step]

export class Trainee {
  private seq = 0
  private yaw = 0
  private pitch = 0
  private alive = false
  private step: string | null = null
  private since = 0

  constructor(private readonly id: string) {}

  /** This tick's messages: what the current step's driver does, ending with one input. Idle when there is no step to do. */
  think(snap: Snapshot | undefined): object[] {
    const you = snap?.you
    if (!snap || !you) return []
    if (you.alive && !this.alive) {
      // Spawned or placed by the server: look where it says.
      this.yaw = snap.players.find((p) => p.id === this.id)?.yaw ?? this.yaw
      this.pitch = 0
    }
    this.alive = you.alive
    const training = snap.training
    const key = training?.tag === "station" && training.step ? `${training.station}/${training.step}` : null
    if (key !== this.step) {
      this.step = key
      this.since = 0
    } else this.since++
    const act: Act =
      training?.tag === "station" && training.step && you.alive
        ? driverOf(training.station, training.step)({ snap, you, yaw: this.yaw, pitch: this.pitch, ticks: this.since })
        : {}
    const input: PlayerInput = { ...IDLE_INPUT, yaw: this.yaw, pitch: this.pitch, weapon: you.arsenal.current, ...act.input, seq: ++this.seq, view: snap.tick }
    this.yaw = input.yaw
    this.pitch = input.pitch
    return [...(act.say ?? []), { t: "input", i: input }]
  }
}
