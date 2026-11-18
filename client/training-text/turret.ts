/** Station 9's instructions. The Friulian is provisional: the owner reviews it. */
import type { StepTexts } from "./types.ts"

export const TURRET_TEXT: StepTexts<"turret"> = {
  fur: {
    mount: (c) => `Va daûr de mitraie e montile cun ${c}`,
    overheat: (c) => `Tire cun ${c} fin che la mitraie si scjalde masse`,
    dismount: (c) => `Dismonte de mitraie cun ${c}`,
    pickLanciafrico: (c) => `Cjape il Lanciafrico cun ${c}`,
    fireLanciafrico: (c) => `Tire cul Lanciafrico cun ${c}`
  },
  it: {
    mount: (c) => `Mettiti dietro la mitragliatrice e montala con ${c}`,
    overheat: (c) => `Spara con ${c} finché la mitragliatrice si surriscalda`,
    dismount: (c) => `Smonta dalla mitragliatrice con ${c}`,
    pickLanciafrico: (c) => `Prendi il Lanciafrico con ${c}`,
    fireLanciafrico: (c) => `Spara con il Lanciafrico con ${c}`
  }
}
