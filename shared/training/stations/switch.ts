/**
 * Station 4, changing weapon: by its slot, back to the previous weapon, by cycling. The simulation
 * sees the weapon change but not how it was chosen, so each step is an interface step: it
 * completes when the weapon changes within a moment of the client reporting that way.
 */
import type { InterfaceAction } from "../interface.ts"
import { station, type Seen, type StepRule } from "../station.ts"

/** How long after its report a weapon change still counts as done that way (ticks): the report travels ahead of the input that changes weapon. */
export const REPORT_WINDOW_TICKS = 30

/** No report accepted yet. */
const NO_REPORT = -1

/** The weapon in hand changed this tick. */
const switched = (seen: Seen) => {
  const { controls, arsenal } = seen.me
  return controls.switchTo !== null && controls.switchTo === arsenal.current && arsenal.action._tag === "switch"
}

/** A step done by changing weapon in the way `action` names. `mark` is the tick of its last report. */
const switchedBy = (action: InterfaceAction): StepRule => ({
  control: action,
  target: 1,
  report: action,
  begin: () => ({ count: 0, mark: NO_REPORT }),
  advance: (seen, now) => {
    const mark = seen.reported > 0 ? seen.tick : now.mark
    const done = mark !== NO_REPORT && seen.tick - mark <= REPORT_WINDOW_TICKS && switched(seen)
    return { count: now.count + (done ? 1 : 0), mark }
  }
})

export const SWITCH_STATION = station({
  setup: { hold: "mandi", objective: "none", bots: [] },
  steps: {
    bySlot: switchedBy("slot"),
    lastWeapon: switchedBy("lastWeapon"),
    cycle: switchedBy("cycle")
  }
})
