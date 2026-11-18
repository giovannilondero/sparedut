/** The input devices (defined in `shared/devices.ts`, where the training's step table reads them too). */
import type { Device } from "../shared/devices.ts"

export { DEVICES, type Device } from "../shared/devices.ts"

/** The device a pointer belongs to: a finger or a pen is touch, a mouse goes with the keyboard. */
export const pointerDevice = (pointerType: string): Device | null =>
  pointerType === "touch" || pointerType === "pen" ? "touch" : pointerType === "mouse" ? "keyboard" : null
