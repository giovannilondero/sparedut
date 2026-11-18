/** Station 4's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const SWITCH_TEXT: StepTexts<"switch"> = {
  fur: {
    bySlot: (c) => `Cambie arme cul so numar: ${c}`,
    lastWeapon: (c) => `Torne ae arme di prime cun ${c}`,
    cycle: (c) => `Passe di une arme a chê altre cun ${c}`
  },
  it: {
    bySlot: (c) => `Cambia arma con il suo numero: ${c}`,
    lastWeapon: (c) => `Torna all'arma di prima con ${c}`,
    cycle: (c) => `Passa da un'arma all'altra con ${c}`
  }
}
