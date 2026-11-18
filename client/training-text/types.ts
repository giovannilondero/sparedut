import type { StationId, StepOf } from "../../shared/training/index.ts"
import type { Lang } from "../i18n.ts"

/** A step's instruction: `control` is the control it names, as markup (`<kbd>…</kbd>`). */
export type StepText = (control: string) => string

/** The instructions of every step of station `S`, in both languages: a new step does not compile until it has both. */
export type StepTexts<S extends StationId> = { readonly [L in Lang]: { readonly [K in StepOf<S>]: StepText } }
