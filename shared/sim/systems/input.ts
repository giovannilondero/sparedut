/**
 * Gli ingressi arrivati dall'host diventano i comandi del tick per ogni giocatore.
 * Chi non ha mandato niente tiene l'ultimo ingresso (ma nessuna nuova pressione).
 */
import { BUTTON, type ButtonName } from "../../input.ts"
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
    const latest = new Map<string, ControlsValue["input"]>()
    for (const e of events.inputs.all()) latest.set(e.session, e.input)
    for (const m of queries.players.each()) {
      const old = m.data.controls.get()
      const input = latest.get(m.data.player.get().session) ?? old.input
      m.data.controls.set({ input, previous: old.input.buttons })
    }
  }
)

/** Pulsante premuto in questo tick (non tenuto dal precedente). */
export const justPressed = (c: ControlsValue, b: ButtonName) => (c.input.buttons & BUTTON[b]) !== 0 && (c.previous & BUTTON[b]) === 0
export const held = (c: ControlsValue, b: ButtonName) => (c.input.buttons & BUTTON[b]) !== 0
