/**
 * The instruction of every training step, in both languages, one file per station. `i18n.ts` puts
 * them in `Strings.training.steps`.
 */
import { STATION_IDS, type StationId } from "../../shared/training/index.ts"
import type { Lang } from "../i18n.ts"
import { ALWAYS_TEXT } from "./always.ts"
import { ARMOURY_TEXT } from "./armoury.ts"
import { COURSE_TEXT } from "./course.ts"
import { LOOK_TEXT } from "./look.ts"
import { MEDIC_TEXT } from "./medic.ts"
import { MODES_TEXT } from "./modes.ts"
import { PICKUPS_TEXT } from "./pickups.ts"
import { SKIRMISH_TEXT } from "./skirmish.ts"
import { STALLS_TEXT } from "./stalls.ts"
import { SWITCH_TEXT } from "./switch.ts"
import { THROW_TEXT } from "./throw.ts"
import { TURRET_TEXT } from "./turret.ts"
import type { StepTexts } from "./types.ts"

const TEXTS: { readonly [S in StationId]: StepTexts<S> } = {
  look: LOOK_TEXT,
  course: COURSE_TEXT,
  always: ALWAYS_TEXT,
  switch: SWITCH_TEXT,
  stalls: STALLS_TEXT,
  armoury: ARMOURY_TEXT,
  throw: THROW_TEXT,
  pickups: PICKUPS_TEXT,
  turret: TURRET_TEXT,
  medic: MEDIC_TEXT,
  modes: MODES_TEXT,
  skirmish: SKIRMISH_TEXT
}

/** Every station's step instructions in one language. */
export type StepsIn = { readonly [S in StationId]: StepTexts<S>[Lang] }

export const stepsIn = (lang: Lang): StepsIn => Object.fromEntries(STATION_IDS.map((s) => [s, TEXTS[s][lang]])) as unknown as StepsIn

export type { StepText, StepTexts } from "./types.ts"
