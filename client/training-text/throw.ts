/** Station 7's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const THROW_TEXT: StepTexts<"throw"> = {
  fur: {
    bomb: (c) => `Tire une bombe di sgnape cun ${c} sui Malandants in fonts de strade`,
    mine: (c) => `Plante une mine di Raibl cun ${c} li che al passe il Malandant, e spiete che i ledi parsore`
  },
  it: {
    bomb: (c) => `Lancia una bomba di sgnape con ${c} sui Malandanti in fondo alla strada`,
    mine: (c) => `Piazza una mina di Raibl con ${c} dove passa il Malandante, e aspetta che ci cammini sopra`
  }
}
