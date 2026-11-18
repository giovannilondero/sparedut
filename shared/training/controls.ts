/**
 * Which devices have a control for which step. A step names a control (`StepRule.control`); a
 * device either has a key, button or on-screen control for it, or none. A step whose control the
 * active device lacks cannot be performed on it: the HUD says so, and it completes itself (#50).
 */
import { DEVICES, type Device } from "../devices.ts"
import { stepRule, type StationId, type StepId } from "./index.ts"
import type { ControlId } from "./station.ts"

const EVERY = DEVICES

/**
 * The devices that have each control. Today a controller has no quick phrases (no button is
 * free), and neither a controller nor touch has a control for the previous weapon (`Q`).
 */
export const CONTROL_DEVICES = {
  look: EVERY,
  move: EVERY,
  jump: EVERY,
  crouch: EVERY,
  sprint: EVERY,
  fire: EVERY,
  aim: EVERY,
  reload: EVERY,
  slot: EVERY,
  lastWeapon: ["keyboard"],
  cycle: EVERY,
  armoury: EVERY,
  bomb: EVERY,
  mine: EVERY,
  use: EVERY,
  board: EVERY,
  phrases: ["keyboard", "touch"]
} as const satisfies Record<ControlId, readonly Device[]>

/** The devices that have control `C`: the prompt tables name it for these and only these. */
export type DevicesWith<C extends ControlId> = (typeof CONTROL_DEVICES)[C][number]

/** Whether `device` has a control for `control`. Allocates nothing: the HUD may ask every frame. */
const DEVICES_OF: Readonly<Record<ControlId, readonly Device[]>> = CONTROL_DEVICES
export const hasControl = (control: ControlId, device: Device): boolean => DEVICES_OF[control].includes(device)

/** Whether a step can be performed on `device`: false means it is shown as not available there. */
export const stepAvailable = (station: StationId, step: StepId, device: Device): boolean => hasControl(stepRule(station, step).control, device)
