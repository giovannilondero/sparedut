/** Station 2's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const COURSE_TEXT: StepTexts<"course"> = {
  fur: {
    jumpBar: (c) => `Salte la stangje cun ${c}`,
    crouchBeam: (c) => `Sbassiti cun ${c} e passe sot dal trâf`,
    sprintToLine: (c) => `Cor fin ae rie: ten fracât ${c} e va indenant`
  },
  it: {
    jumpBar: (c) => `Salta la sbarra con ${c}`,
    crouchBeam: (c) => `Accovacciati con ${c} e passa sotto la trave`,
    sprintToLine: (c) => `Scatta fino alla linea: tieni ${c} e vai avanti`
  }
}
