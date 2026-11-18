/** Station 3's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const ALWAYS_TEXT: StepTexts<"always"> = {
  fur: {
    mandiHit: (c) => `Colpìs un bersai cul Mandi: tire cun ${c}`,
    aimedHit: (c) => `Mire cun ${c} e colpìs un bersai`,
    reload: (c) => `Ricjarie cun ${c}`,
    mesculHit: (c) => `Cjape il mescul cun ${c} e colpìs un bersai di dongje`,
    doorDown: (c) => `Bute jù la puarte dal casot a colps di mescul cun ${c}`
  },
  it: {
    mandiHit: (c) => `Colpisci un bersaglio con il Mandi: spara con ${c}`,
    aimedHit: (c) => `Mira con ${c} e colpisci un bersaglio`,
    reload: (c) => `Ricarica con ${c}`,
    mesculHit: (c) => `Prendi il mescul con ${c} e colpisci un bersaglio da vicino`,
    doorDown: (c) => `Butta giù la porta del casotto a colpi di mescul con ${c}`
  }
}
