/**
 * Reading a player's `Controls`: which buttons this tick. Pure, with no simulation schema behind
 * it, so the training's step rules (`shared/training/`), which the client bundles too, can use it
 * without bringing the simulation with them.
 */
import { BUTTON, type ButtonName } from "../input.ts"
import type { ControlsValue } from "./schema.ts"

/** Button pressed this tick (not held from the previous one). */
export const justPressed = (c: ControlsValue, b: ButtonName) => (c.pressed & BUTTON[b]) !== 0 && (c.previous & BUTTON[b]) === 0
export const held = (c: ControlsValue, b: ButtonName) => (c.input.buttons & BUTTON[b]) !== 0
