/**
 * What the prompts say for the active device: the prompt to start playing, and near a turret
 * the control that mounts it or, while mounted, the one that dismounts. Plain lookups: the HUD
 * asks every frame, and nothing is allocated.
 */
import type { TrainingView } from "../shared/sim/view.ts"
import { stepRule, type StationId } from "../shared/training/index.ts"
import type { ControlId } from "../shared/training/station.ts"
import type { Device } from "./device.ts"
import type { Strings } from "./i18n.ts"
import type { StepText } from "./training-text/index.ts"

export const playPrompt = (s: Strings, device: Device): string => s.hud.play[device]

export const turretPrompt = (s: Strings, device: Device, mounted: boolean): string => (mounted ? s.hud.turretLeave : s.hud.turretUse)[device]

/**
 * The control a training step names, as the active device shows it: a key or mouse button, a
 * controller's button, the on-screen control. Null when the device has no control for it
 * (`CONTROL_DEVICES` in `shared/training/controls.ts`).
 */
export const trainingControl = (s: Strings, control: ControlId, device: Device): string | null => {
  const controls: Readonly<Record<ControlId, Readonly<Partial<Record<Device, string>>>>> = s.training.controls
  return controls[control][device] ?? null
}

/**
 * The current step's line in the training panel, for the active device: its instruction naming
 * the device's control and its count when it has one, or that the device cannot perform it. The
 * step's progress is the simulation's: a change of device changes only these words. Called only
 * when the panel changes, not every frame.
 */
export const trainingPrompt = (s: Strings, view: TrainingView, device: Device): string => {
  if (view.tag !== "station" || view.step === null) return ""
  const control = trainingControl(s, stepRule(view.station, view.step).control, device)
  if (control === null) return `<span class="unavailable">${s.training.unavailable}</span>`
  const steps: Readonly<Record<StationId, Readonly<Record<string, StepText>>>> = s.training.steps
  const instruction = steps[view.station][view.step]
  return `${instruction?.(control) ?? ""}${view.target > 1 ? ` <b class="count">${s.training.count(view.count, view.target)}</b>` : ""}`
}
