/** Station 11's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const MODES_TEXT: StepTexts<"modes"> = {
  fur: {
    frico: (c) => `Cjape il frico dai Malandants (${c}) e puartilu te tô base`,
    placute: (c) => `Va su la plaçute (${c}) e tegnile fin che e fâs pont`,
    cjar: (c) => `Sta dongje dal cjar (${c}) e sburtilu fin insom de strade`,
    storm: (c) => `Reste dentri dal cercli de tampieste (${c}) intant che si strenç`
  },
  it: {
    frico: (c) => `Prendi il frico dei Malandanti (${c}) e portalo alla tua base`,
    placute: (c) => `Sali sulla plaçute (${c}) e tienila finché fa punti`,
    cjar: (c) => `Stai accanto al cjar (${c}) e spingilo fino in fondo al percorso`,
    storm: (c) => `Resta dentro il cerchio della tempesta (${c}) mentre si stringe`
  }
}
