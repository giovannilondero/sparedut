/**
 * The casot's panel: a section of wall torn off by holding "use" inside, close to it and facing it,
 * for `PANEL_TEAR_TICKS`; then it is its tearer's, in the Lanciafrico's slot, and its gap stays open
 * until the next match. Letting go, moving away or dying cancels the tear, which then starts over.
 * Bots never tear it off, and nor does a player who already has something in slot 3. The physics
 * world follows the saved state every tick, as it does for the doors.
 */
import { facesPanel } from "../../map.ts"
import { MAPS } from "../../maps/index.ts"
import { PANEL_TEAR_TICKS } from "../../weapons.ts"
import { Arsenal, Controls, Game, Life, Match, Motion, Out, Panels, Physics, Player, Rules, type PanelState } from "../schema.ts"
import { held } from "./input.ts"

export const TearPanels = Game.System(
  "Sparedut/TearPanels",
  {
    queries: {
      players: Game.Query({
        selection: {
          player: Game.Query.read(Player),
          life: Game.Query.read(Life),
          controls: Game.Query.read(Controls),
          motion: Game.Query.read(Motion),
          arsenal: Game.Query.write(Arsenal)
        }
      })
    },
    resources: { rules: Game.System.readResource(Rules), panels: Game.System.writeResource(Panels) },
    services: { physics: Game.System.service(Physics) },
    events: { out: Game.System.writeEvent(Out) },
    machines: { match: Game.System.machine(Match) }
  },
  ({ queries, resources, services, events, machines }) => {
    const defs = MAPS[resources.rules.get().map].panels ?? []
    if (defs.length === 0) return
    const { data } = queries.players
    const players = queries.players.each()
    const before = resources.panels.get()
    const playing = machines.match.get()._tag !== "Over"
    /** Who can be tearing panel `i` this tick: alive, human, slot 3 free, holding use, facing it. */
    const tearing = (m: (typeof players)[number], i: number) => {
      const info = data.player.get(m)
      const controls = data.controls.get(m)
      const motion = data.motion.get(m)
      return (
        !info.bot &&
        data.life.get(m)._tag === "Alive" &&
        data.arsenal.get(m).power === null &&
        held(controls, "use") &&
        facesPanel(defs[i], motion.body, controls.input.yaw)
      )
    }
    const next: PanelState[] = before.map((state, i): PanelState => {
      if (!playing || state._tag === "off") return state
      if (state._tag === "tearing") {
        const tearer = players.find((m) => data.player.get(m).session === state.by)
        if (tearer === undefined || !tearing(tearer, i)) return { _tag: "wall" }
        if (state.ticks + 1 < PANEL_TEAR_TICKS) return { _tag: "tearing", by: state.by, ticks: state.ticks + 1 }
        data.arsenal.update(tearer, (a) => ({ ...a, power: "panel", current: "panel", action: { _tag: "switch", ticks: 20 }, spin: 0 }))
        events.out.emit({ t: "panel", i, s: state.by, a: "torn" })
        return { _tag: "off" }
      }
      const first = players.find((m) => tearing(m, i))
      return first === undefined ? state : { _tag: "tearing", by: data.player.get(first).session, ticks: 1 }
    })
    if (next.some((s, i) => s !== before[i])) resources.panels.set(next)
    services.physics.setPanels(next.map((s) => s._tag !== "off"))
  }
)
