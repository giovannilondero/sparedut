/** Station 11's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const MODES_TEXT: StepTexts<"modes"> = {
  fur: {
    frico: (c) => `Cjape il frico dai Malandants (${c}) e puartilu te tô base`,
    placute: (c) => `Va su la plaçute (${c}) e tegnile fin che e fâs pont`
  },
  it: {
    frico: (c) => `Prendi il frico dei Malandanti (${c}) e portalo alla tua base`,
    placute: (c) => `Sali sulla plaçute (${c}) e tienila finché fa punti`
  }
}
