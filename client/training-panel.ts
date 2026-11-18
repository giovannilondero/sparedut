/**
 * The training's panel with no DOM: the current station's steps as small marks, done, current or
 * to do, so the player sees which step they are on and how many are left. `Hud.training` writes it
 * only when the station or the step changes, and a step it was not showing calls for attention.
 */
import type { TrainingView } from "../shared/sim/view.ts"
import { stepsOf } from "../shared/training/index.ts"
import type { Strings } from "./i18n.ts"

/** A step of the current station, as its mark shows it. */
export const STEP_MARKS = ["done", "current", "todo"] as const
export type StepMark = (typeof STEP_MARKS)[number]

const NO_MARKS: readonly StepMark[] = []

/** Where the panel says the trainee is: a station and its step to do, when there is one. */
export interface PanelPlace {
  readonly station: string
  readonly step: string | null
}

/** The panel showing nothing: outside a training, and before its first station. */
export const NOT_SHOWN: PanelPlace = { station: "", step: null }

/**
 * Whether the panel calls for attention: it has a step to do that it was not showing just before.
 * A count going up, another device or another language change what it says, not what there is to do.
 */
export const announcesStep = (shown: PanelPlace, next: PanelPlace): boolean => next.step !== null && (next.station !== shown.station || next.step !== shown.step)

/** The current station's steps in order, each with its mark; none outside a station's step. */
export function stepMarks(view: TrainingView | null): readonly StepMark[] {
  if (view?.tag !== "station" || view.step === null) return NO_MARKS
  const steps: readonly string[] = stepsOf(view.station)
  const at = steps.indexOf(view.step)
  return steps.map((_, i) => (i < at ? "done" : i === at ? "current" : "todo"))
}

/** The marks' markup, read aloud as "step n of total". */
export function stepMarksHtml(view: TrainingView | null, s: Strings): string {
  const marks = stepMarks(view)
  if (marks.length === 0) return ""
  const label = s.training.step(marks.indexOf("current") + 1, marks.length)
  return `<span class="step-marks" role="img" aria-label="${label}" title="${label}">${marks.map((m) => `<span class="step-mark is-${m}"></span>`).join("")}</span>`
}
