/** What a step's driver sees and does, and the moves most drivers are made of. */
import type { PlayerInput } from "../../shared/input.ts"
import type { V3 } from "../../shared/map.ts"
import type { SnapSelf, Snapshot } from "../../shared/protocol.ts"
import type { StationId, StepOf } from "../../shared/training/index.ts"

/** What the trainee knows this tick: the latest snapshot, itself in it, where it looks. */
export interface Sight {
  readonly snap: Snapshot
  readonly you: SnapSelf
  /** The trainee's own look, as its last input sent it. */
  readonly yaw: number
  readonly pitch: number
  /** Ticks since the current step began. */
  readonly ticks: number
}

/**
 * What the trainee does this tick: an input's movement, look, buttons and weapon (what is left out
 * stays idle, the look stays where it is), and any other protocol messages to send first.
 */
export interface Act {
  readonly input?: Partial<Pick<PlayerInput, "mx" | "mz" | "yaw" | "pitch" | "buttons" | "weapon">>
  readonly say?: readonly object[]
}

/** How the trainee performs one step. */
export type Driver = (sight: Sight) => Act

/** A driver for every step of station `S`: a new step does not compile until the trainee can perform it. */
export type Drivers<S extends StationId> = { readonly [K in StepOf<S>]: Driver }

/** The yaw that faces `at` from the trainee (0 faces north, -z). */
export const yawTo = (sight: Sight, at: V3) => Math.atan2(-(at[0] - sight.you.body.x), -(at[2] - sight.you.body.z))

/** Walks straight at a point, facing it. */
export const walkTo = (sight: Sight, at: V3): Act => ({ input: { mz: 1, yaw: yawTo(sight, at) } })

/** Turns the view by `radians` this tick, standing still. */
export const turn = (sight: Sight, radians: number): Act => ({ input: { yaw: sight.yaw + radians } })
