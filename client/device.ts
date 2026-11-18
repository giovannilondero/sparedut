/**
 * The input devices a player can hold: keyboard and mouse, a controller, or touch. The active
 * one is whichever was used last (`Controls.device`); prompts name its controls.
 */
export const DEVICES = ["keyboard", "pad", "touch"] as const
export type Device = (typeof DEVICES)[number]

/** The device a pointer belongs to: a finger or a pen is touch, a mouse goes with the keyboard. */
export const pointerDevice = (pointerType: string): Device | null =>
  pointerType === "touch" || pointerType === "pen" ? "touch" : pointerType === "mouse" ? "keyboard" : null
