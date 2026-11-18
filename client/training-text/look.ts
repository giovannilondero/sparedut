/** Station 1's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const LOOK_TEXT: StepTexts<"look"> = {
  fur: {
    lookAround: (c) => `Cjale ator: volte la viste cun ${c}`,
    walkToMarker: (c) => `Va fin al segnâl dongje de bancjarele cun ${c}`
  },
  it: {
    lookAround: (c) => `Guardati intorno: gira la visuale con ${c}`,
    walkToMarker: (c) => `Raggiungi il segnale accanto alla bancarella con ${c}`
  }
}
