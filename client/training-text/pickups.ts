/** Station 8's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const PICKUPS_TEXT: StepTexts<"pickups"> = {
  fur: {
    frico: (c) => `Tu sês ferît: cjape il frico cun ${c} par tornâ in salût`,
    gubane: (c) => `Cence armadure: cjape la gubane cun ${c}`,
    sgnape: (c) => `Cjape la sgnape cun ${c}: tu corarâs plui svelt par un pôc`,
    munizions: (c) => `Tu âs pocjis munizions: cjapilis cun ${c}`
  },
  it: {
    frico: (c) => `Sei ferito: prendi il frico con ${c} per tornare in salute`,
    gubane: (c) => `Senza armatura: prendi la gubane con ${c}`,
    sgnape: (c) => `Prendi la sgnape con ${c}: correrai più veloce per un po'`,
    munizions: (c) => `Hai poche munizioni: prendile con ${c}`
  }
}
