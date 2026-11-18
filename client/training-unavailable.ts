/**
 * A training step the active device has no control for (`shared/training/controls.ts`): the HUD
 * shows it as not available, and once it has been shown for a moment the client tells the host,
 * which completes it. The host checks the step table itself and takes the word only for the
 * current step: the client never advances the training.
 */
import type { Device } from "../shared/devices.ts"
import type { ClientMessage } from "../shared/protocol.ts"
import type { TrainingView } from "../shared/sim/view.ts"
import { hasControl } from "../shared/training/controls.ts"
import { stepRule } from "../shared/training/index.ts"

/** How long a step is shown as not available before the client says so, and between tellings while it stays current (ms). */
export const UNAVAILABLE_SHOWN_MS = 2000

type Unavailable = Extract<ClientMessage, { t: "unavailable" }>

/** Asked every frame; allocates only on the frame it has something to send. */
export class UnavailableSteps {
  private station: string | null = null
  private step: string | null = null
  private device: Device | null = null
  /** When the current unavailable step was first shown on this device, and when it was last told. */
  private since = 0
  private told = -Infinity

  /** The message to send now, or null. `now` is in milliseconds. */
  check(view: TrainingView | null, device: Device, now: number): Unavailable | null {
    if (view?.tag !== "station" || view.step === null || hasControl(stepRule(view.station, view.step).control, device)) {
      this.station = null
      return null
    }
    if (view.station !== this.station || view.step !== this.step || device !== this.device) {
      this.station = view.station
      this.step = view.step
      this.device = device
      this.since = now
      this.told = -Infinity
    }
    if (now - this.since < UNAVAILABLE_SHOWN_MS || now - this.told < UNAVAILABLE_SHOWN_MS) return null
    this.told = now
    return { t: "unavailable", station: view.station, step: view.step, device }
  }
}
