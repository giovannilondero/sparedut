/**
 * The input devices a player can hold: keyboard and mouse, a controller, or touch. The active
 * one is whichever was used last (`Controls.device` in the client); prompts name its controls.
 * Shared so that the training's step table can say which devices have a control for a step.
 */
export const DEVICES = ["keyboard", "pad", "touch"] as const
export type Device = (typeof DEVICES)[number]
