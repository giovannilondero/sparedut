/** Station 6's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const ARMOURY_TEXT: StepTexts<"armoury"> = {
  fur: {
    choosePrimary: (c) => `Vierç la armarie cun ${c} e sielç une altre arme principâl`
  },
  it: {
    choosePrimary: (c) => `Apri l'armeria con ${c} e scegli un'altra arma principale`
  }
}
