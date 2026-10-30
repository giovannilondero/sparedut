/**
 * I comandi arrivati dall'host diventano i passi del tick per ogni giocatore.
 *
 * Ogni comando del client è un passo di movimento, né più né meno: così il
 * server rifà esattamente ciò che la predizione del client ha già mostrato, anche
 * quando la rete ne consegna due in un tick e zero in quello dopo.
 */
import { BUTTON, type ButtonName, type PlayerInput } from "../../input.ts"
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
    const arrived = new Map<string, PlayerInput[]>()
    for (const e of events.inputs.all()) {
      const list = arrived.get(e.session)
      if (list) list.push(e.input)
      else arrived.set(e.session, [e.input])
    }
    for (const m of queries.players.each()) {
      const old = m.data.controls.get()
      const steps = arrived.get(m.data.player.get().session) ?? []
      const last = steps.length ? steps[steps.length - 1] : old.input
      let pressed = 0
      let weapon = old.input.weapon
      let switchTo: ControlsValue["switchTo"] = null
      for (const s of steps) {
        pressed |= s.buttons
        if (s.weapon !== weapon) switchTo = s.weapon
        weapon = s.weapon
      }
      m.data.controls.set({
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

/** Pulsante premuto in questo tick (non tenuto dal precedente). */
export const justPressed = (c: ControlsValue, b: ButtonName) => (c.pressed & BUTTON[b]) !== 0 && (c.previous & BUTTON[b]) === 0
export const held = (c: ControlsValue, b: ButtonName) => (c.input.buttons & BUTTON[b]) !== 0
