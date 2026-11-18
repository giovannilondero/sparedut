/**
 * The instruction of every training step, in both languages, one file per station. `i18n.ts` puts
 * them in `Strings.training.steps`.
 */
import type { StationId } from "../../shared/training/index.ts"
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

export const stepsIn = (lang: Lang): StepsIn => ({
  look: TEXTS.look[lang],
  course: TEXTS.course[lang],
  always: TEXTS.always[lang],
  switch: TEXTS.switch[lang],
  stalls: TEXTS.stalls[lang],
  armoury: TEXTS.armoury[lang],
  throw: TEXTS.throw[lang],
  pickups: TEXTS.pickups[lang],
  turret: TEXTS.turret[lang],
  medic: TEXTS.medic[lang],
  modes: TEXTS.modes[lang],
  skirmish: TEXTS.skirmish[lang]
})

export type { StepText, StepTexts } from "./types.ts"
