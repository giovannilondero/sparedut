/**
 * The player's intent for one tick: clients and bots send it the same way.
 */
import { z } from "zod"
import { WEAPON_IDS, type WeaponId } from "./weapons.ts"

export const BUTTON = {
  fire: 1,
  aim: 2,
  jump: 4,
  crouch: 8,
  sprint: 16,
  reload: 32,
  bomb: 64,
  mine: 128,
  /** Mounts or dismounts a turret. */
  use: 256
} as const

export type ButtonName = keyof typeof BUTTON

export interface PlayerInput {
  /** Client sequence number: the server acknowledges the last one applied. */
  readonly seq: number
  /** Strafe (-1 left, 1 right) and forward (1) / back (-1). */
  readonly mx: number
  readonly mz: number
  /** Yaw (0 faces north, -z) and pitch (positive is up), in radians. */
  readonly yaw: number
  readonly pitch: number
  readonly buttons: number
  readonly weapon: WeaponId
  /** The server tick the client was showing: used for lag compensation. */
  readonly view: number
}

export const PlayerInputSchema = z.object({
  seq: z.number().int().nonnegative(),
  mx: z.number().min(-1).max(1),
  mz: z.number().min(-1).max(1),
  yaw: z.number().finite(),
  pitch: z.number().min(-1.56).max(1.56),
  buttons: z.number().int().min(0).max(511),
  weapon: z.enum(WEAPON_IDS as [WeaponId, ...WeaponId[]]),
  view: z.number().int().nonnegative()
})

export const IDLE_INPUT: PlayerInput = { seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0, weapon: "mandi", view: 0 }

export const pressed = (input: PlayerInput, b: ButtonName) => (input.buttons & BUTTON[b]) !== 0
