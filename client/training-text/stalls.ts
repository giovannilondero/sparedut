/** Station 5's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const STALLS_TEXT: StepTexts<"stalls"> = {
  fur: {
    cramar: (c) => `Al banc dal Mitra dal Cramâr colpìs il bersai che al cjamine: tire cun ${c}`,
    doplete: (c) => `Al banc de Dopiete di Pre Checo colpìs il bersai di dongje: tire cun ${c}`,
    cjampanili: (c) => `Al banc dal Cjampanili mire cun ${c} fin che tu viodis tal canocjâl, e colpìs il bersai lontan`,
    mulin: (c) => `Al banc dal Mulin ten fracât fin che al zire, po colpìs il bersai: tire cun ${c}`,
    gjalinis: (c) => `Al banc dal Cjanon des Gjalinis tire une gjaline: e cjate di bessole il bersai che al cjamine. Tire cun ${c}`
  },
  it: {
    cramar: (c) => `Al banco del Mitra dal Cramâr colpisci il bersaglio che cammina: spara con ${c}`,
    doplete: (c) => `Al banco della Dopiete di Pre Checo colpisci il bersaglio da vicino: spara con ${c}`,
    cjampanili: (c) => `Al banco del Cjampanili mira con ${c} finché vedi nel cannocchiale, e colpisci il bersaglio lontano`,
    mulin: (c) => `Al banco del Mulin tieni premuto finché gira, poi colpisci il bersaglio: spara con ${c}`,
    gjalinis: (c) => `Al banco del Cjanon des Gjalinis spara una gallina: trova da sola il bersaglio che cammina. Spara con ${c}`
  }
}
