/**
 * L'intento del giocatore per un tick: lo mandano client e bot, uguale.
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
  mine: 128
} as const

export type ButtonName = keyof typeof BUTTON

export interface PlayerInput {
  /** Numero progressivo del client: il server conferma l'ultimo applicato. */
  readonly seq: number
  /** Laterale (-1 sinistra, 1 destra) e avanti (1) / indietro (-1). */
  readonly mx: number
  readonly mz: number
  /** Imbardata (0 guarda verso nord, -z) e beccheggio (positivo in su), radianti. */
  readonly yaw: number
  readonly pitch: number
  readonly buttons: number
  readonly weapon: WeaponId
  /** Il tick del server che il client stava mostrando: serve a compensare la latenza. */
  readonly view: number
}

export const PlayerInputSchema = z.object({
  seq: z.number().int().nonnegative(),
  mx: z.number().min(-1).max(1),
  mz: z.number().min(-1).max(1),
  yaw: z.number().finite(),
  pitch: z.number().min(-1.56).max(1.56),
  buttons: z.number().int().min(0).max(255),
  weapon: z.enum(WEAPON_IDS as [WeaponId, ...WeaponId[]]),
  view: z.number().int().nonnegative()
})

export const IDLE_INPUT: PlayerInput = { seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0, weapon: "mandi", view: 0 }

export const pressed = (input: PlayerInput, b: ButtonName) => (input.buttons & BUTTON[b]) !== 0
