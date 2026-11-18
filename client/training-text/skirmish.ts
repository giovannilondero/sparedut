/** Station 12's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const SKIRMISH_TEXT: StepTexts<"skirmish"> = {
  fur: {
    win: (c) => `Vinç la Bataie di Gnot: bute jù i Malandants tirant cun ${c}`,
    board: (c) => `Vierç la classifiche cun ${c}`,
    phrases: (c) => `Mande une frase svelte: vierç la liste cun ${c} e sielzint une`,
    chat: (c) => `Scrîf un messaç: vierç la chat cun ${c}, scrîf e mande cun <kbd>Enter</kbd>`
  },
  it: {
    win: (c) => `Vinci la Bataie di Gnot: abbatti i Malandanti sparando con ${c}`,
    board: (c) => `Apri la classifica con ${c}`,
    phrases: (c) => `Manda una frase rapida: apri l'elenco con ${c} e scegline una`,
    chat: (c) => `Scrivi un messaggio: apri la chat con ${c}, scrivi e invia con <kbd>Invio</kbd>`
  }
}
