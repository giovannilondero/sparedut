/**
 * Commands arriving from the host become each player's steps for the tick.
 *
 * Each client command is one movement step, no more, no less: that way the
 * server replays exactly what client prediction has already shown, even
 * when the network delivers two in one tick and zero in the next.
 */
import type { PlayerInput } from "../../input.ts"
import { Controls, Game, InputArrived, Player, type ControlsValue } from "../schema.ts"

export const ApplyInputs = Game.System(
  "Sparedut/ApplyInputs",
  {
    queries: {
      players: Game.Query({ selection: { player: Game.Query.read(Player), controls: Game.Query.write(Controls) } })
    },
    events: { inputs: Game.System.readEvent(InputArrived) }
  },
  ({ queries, events }) => {
    const { data } = queries.players
    const arrived = new Map<string, PlayerInput[]>()
    for (const e of events.inputs.all()) {
      const list = arrived.get(e.session)
      if (list) list.push(e.input)
      else arrived.set(e.session, [e.input])
    }
    for (const m of queries.players.each()) {
      const old = data.controls.get(m)
      const steps = arrived.get(data.player.get(m).session) ?? []
      const last = steps.length ? steps[steps.length - 1] : old.input
      let pressed = 0
      let weapon = old.input.weapon
      let switchTo: ControlsValue["switchTo"] = null
      for (const s of steps) {
        pressed |= s.buttons
        if (s.weapon !== weapon) switchTo = s.weapon
        weapon = s.weapon
      }
      data.controls.set(m, {
        input: last,
        previous: old.input.buttons,
        pressed: pressed | last.buttons,
        steps,
        switchTo,
        starved: steps.length ? 0 : old.starved + 1
      })
    }
  }
)

export { held, justPressed } from "../controls.ts"
