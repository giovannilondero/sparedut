/**
 * The training's panel with no DOM: the current station's steps as small marks, done, current or
 * to do, so the player sees which step they are on and how many are left. `Hud.training` writes it
 * only when the station or the step changes.
 */
import type { TrainingView } from "../shared/sim/view.ts"
import { stepsOf } from "../shared/training/index.ts"
import type { Strings } from "./i18n.ts"

/** A step of the current station, as its mark shows it. */
export const STEP_MARKS = ["done", "current", "todo"] as const
export type StepMark = (typeof STEP_MARKS)[number]

const NO_MARKS: readonly StepMark[] = []

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
