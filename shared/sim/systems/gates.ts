/**
 * The training's gates: the physics closes each way that the training's progress keeps closed
 * (`shared/training/gates.ts`). Derived from the saved `Training` state every tick, before anyone
 * moves, so a restore, or a trainee sent to another station, finds the gates right by themselves.
 */
import { closedGates } from "../../training/gates.ts"
import { Game, Physics, Training } from "../schema.ts"

export const CloseGates = Game.System(
  "Sparedut/CloseGates",
  {
    services: { physics: Game.System.service(Physics) },
    machines: { training: Game.System.machine(Training) }
  },
  ({ services, machines }) => {
    const count = services.physics.map.gates?.length ?? 0
    if (count === 0) return
    const state = machines.training.get()
    const station = state._tag === "Arriving" || state._tag === "Step" ? state.station : null
    services.physics.setGates(closedGates(count, station))
  }
)
