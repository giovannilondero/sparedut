/** Station 10's instruction. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const MEDIC_TEXT: StepTexts<"medic"> = {
  fur: {
    heal: (c) => `Il to compagn al è ferît: tegnilu tal fas de Cassele dal Miedi cun ${c} fin che al torne in plene salût. Salût tornade:`
  },
  it: {
    heal: (c) => `Il tuo compagno è ferito: tienilo nel raggio della Cassele dal Miedi con ${c} finché torna in piena salute. Salute restituita:`
  }
}
