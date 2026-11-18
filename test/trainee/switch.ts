/** Station 4: change weapon by slot, back to the previous one, by cycling; each time reporting how, as the client does. */
import type { InterfaceAction } from "../../shared/training/interface.ts"
import type { Act, Driver, Drivers, Sight } from "./moves.ts"

/** How often the trainee tries again while a step is still current (ticks). */
const EVERY = 20

/** The other of the two weapons the trainee always carries. */
const other = (sight: Sight) => (sight.you.arsenal.current === "mandi" ? "mescul" : "mandi")

/** Reports `action` and changes weapon, once every `EVERY` ticks; holds the weapon in hand in between. */
const switchBy =
  (action: InterfaceAction): Driver =>
  (sight): Act =>
    sight.ticks % EVERY === 0 ? { input: { weapon: other(sight) }, say: [{ t: "report", a: action }] } : {}

export const SWITCH: Drivers<"switch"> = {
  bySlot: switchBy("slot"),
  lastWeapon: switchBy("lastWeapon"),
  cycle: switchBy("cycle")
}
