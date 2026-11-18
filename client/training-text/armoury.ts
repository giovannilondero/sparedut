/** Station 6's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const ARMOURY_TEXT: StepTexts<"armoury"> = {
  fur: {
    // Only the training changes the primary on the spot: a match fixes it in the Muster.
    choosePrimary: (c) => `Vierç la armarie cun ${c} e sielç une altre arme principâl. In partide si le sielç te Adunade e e reste fin ae fin.`
  },
  it: {
    choosePrimary: (c) => `Apri l'armeria con ${c} e scegli un'altra arma principale. In partita si sceglie all'Adunata e resta fino alla fine.`
  }
}
