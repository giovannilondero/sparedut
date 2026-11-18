/**
 * The training: its twelve stations in order, each with its steps, defined once. The simulation
 * advances through them (`shared/sim/systems/training.ts`), the host and the client read them.
 *
 * A station's steps and setup live in its own file in `stations/`. Every table that must cover a
 * step is keyed by `StationId` and then by `StepOf<S>`, so a new step does not compile until it has
 * its text in both languages (`client/training-text/`), its control (on the rule) and its
 * completion rule (`advance`), and the automatic player can perform it (`test/trainee/`).
 */
import type { MapId } from "../map.ts"
import type { ModeId } from "../folklore.ts"
import { SAGRE_STATIONS } from "../maps/sagre.ts"
import type { StationDef, StepRule } from "./station.ts"
import { ALWAYS_STATION } from "./stations/always.ts"
import { ARMOURY_STATION } from "./stations/armoury.ts"
import { COURSE_STATION } from "./stations/course.ts"
import { LOOK_STATION } from "./stations/look.ts"
import { MEDIC_STATION } from "./stations/medic.ts"
import { MODES_STATION } from "./stations/modes.ts"
import { PICKUPS_STATION } from "./stations/pickups.ts"
import { SKIRMISH_STATION } from "./stations/skirmish.ts"
import { STALLS_STATION } from "./stations/stalls.ts"
import { SWITCH_STATION } from "./stations/switch.ts"
import { THROW_STATION } from "./stations/throw.ts"
import { TURRET_STATION } from "./stations/turret.ts"

/** The training's mode and map: fixed by the training request, never chosen by a regular room. */
export const TRAINING = { mode: "dutrine", map: "sagre" } as const satisfies { readonly mode: ModeId; readonly map: MapId }

/** The stations, in the order a first run goes through them. Index `i` is station `i + 1` and `SAGRE_STATIONS[i]` on the map. */
export const STATION_IDS = ["look", "course", "always", "switch", "stalls", "armoury", "throw", "pickups", "turret", "medic", "modes", "skirmish"] as const
export type StationId = (typeof STATION_IDS)[number]

export const STATIONS = {
  look: LOOK_STATION,
  course: COURSE_STATION,
  always: ALWAYS_STATION,
  switch: SWITCH_STATION,
  stalls: STALLS_STATION,
  armoury: ARMOURY_STATION,
  throw: THROW_STATION,
  pickups: PICKUPS_STATION,
  turret: TURRET_STATION,
  medic: MEDIC_STATION,
  modes: MODES_STATION,
  skirmish: SKIRMISH_STATION
} as const satisfies Record<StationId, StationDef>

/** The steps of station `S`. */
export type StepOf<S extends StationId> = keyof (typeof STATIONS)[S]["steps"] & string
/** Any step of any station. */
export type StepId = { [S in StationId]: StepOf<S> }[StationId]

/** Every station has its place on the fair: one entry of `SAGRE_STATIONS` per station, in the same order. */
const _placed: (typeof SAGRE_STATIONS)["length"] = STATION_IDS.length
void _placed

/** A station's steps, in order. */
export const stepsOf = <S extends StationId>(station: S): readonly StepOf<S>[] => Object.keys(STATIONS[station].steps) as StepOf<S>[]

/** The rule of one step of a station. */
export const stepRule = (station: StationId, step: StepId): StepRule => (STATIONS[station].steps as Readonly<Record<string, StepRule>>)[step]
