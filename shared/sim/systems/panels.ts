/**
 * The casot's panel, while a match is live: a section of wall torn off by holding "use" inside,
 * close to it and facing it, for `PANEL_TEAR_TICKS`; then it is its tearer's, in the Lanciafrico's
 * slot, and its gap stays open until the next match. Letting go, moving away or dying cancels the
 * tear, which then starts over. When its carrier dies it falls where they died, with the health it
 * had, and the first player to walk over it who has slot 3 free takes it. Bots never tear it off
 * nor pick it up. The damage it takes, and its breaking, are `ApplyDamage`'s. The physics world
 * follows the saved state every tick, as it does for the doors.
 */
import { facesPanel, type PanelDef } from "../../map.ts"
import { MAPS } from "../../maps/index.ts"
import { PANEL_HP, PANEL_TEAR_TICKS } from "../../weapons.ts"
import { panelOnWall } from "../rules.ts"
import { Arsenal, Controls, Game, Life, Match, Motion, Out, Panels, Physics, Player, Rules, type ArsenalValue, type PanelState } from "../schema.ts"
import { held } from "./input.ts"

/** How close (horizontally, and in height) a player walks to a lying panel to take it: as for the pickups. */
const TAKE_REACH = 1.5
const TAKE_HEIGHT = 1.6
/** How far below a fallen carrier the ground is looked for. */
const GROUND_BELOW = 6

export const PlayPanels = Game.System(
  "Sparedut/PlayPanels",
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
    const before = resources.panels.get()
    if (machines.match.get()._tag === "Live") {
      const { data } = queries.players
      const players = queries.players.each()
      type Member = (typeof players)[number]
      const free = (m: Member) => !data.player.get(m).bot && data.life.get(m)._tag === "Alive" && data.arsenal.get(m).power === null
      /** Who can be tearing panel `i` this tick: alive, human, slot 3 free, holding use, facing it. */
      const tearing = (m: Member, i: number) => {
        const controls = data.controls.get(m)
        return free(m) && held(controls, "use") && facesPanel(defs[i], data.motion.get(m).body, controls.input.yaw)
      }
      const take = (m: Member, a: ArsenalValue) => data.arsenal.set(m, { ...a, power: "panel", current: "panel", action: { _tag: "switch", ticks: 20 }, spin: 0 })
      /** Where a panel comes to rest from `at`: on the ground below, or, with none (fallen out of the map, gone), back in front of its gap. */
      const rest = (def: PanelDef, at: { readonly x: number; readonly y: number; readonly z: number } | null): { readonly x: number; readonly y: number; readonly z: number } => {
        const ground = at === null ? null : services.physics.raycast({ x: at.x, y: at.y + 0.5, z: at.z }, { x: 0, y: -1, z: 0 }, GROUND_BELOW)
        if (at !== null && ground !== null) return { x: at.x, y: at.y + 0.5 - ground.dist, z: at.z }
        const cx = (def.min[0] + def.max[0]) / 2 + def.inward[0] * 0.8
        const cz = (def.min[2] + def.max[2]) / 2 + def.inward[2] * 0.8
        const floor = services.physics.raycast({ x: cx, y: def.max[1], z: cz }, { x: 0, y: -1, z: 0 }, GROUND_BELOW)
        return { x: cx, y: floor === null ? def.min[1] : def.max[1] - floor.dist, z: cz }
      }
      const next = before.map((state, i): PanelState => {
        switch (state._tag) {
          case "wall": {
            const first = players.find((m) => tearing(m, i))
            return first === undefined ? state : { _tag: "tearing", by: data.player.get(first).session, ticks: 1 }
          }
          case "tearing": {
            const tearer = players.find((m) => data.player.get(m).session === state.by)
            if (tearer === undefined || !tearing(tearer, i)) return { _tag: "wall" }
            if (state.ticks + 1 < PANEL_TEAR_TICKS) return { _tag: "tearing", by: state.by, ticks: state.ticks + 1 }
            take(tearer, data.arsenal.get(tearer))
            events.out.emit({ t: "panel", i, s: state.by, a: "torn" })
            return { _tag: "carried", by: state.by, hp: PANEL_HP }
          }
          case "carried": {
            const carrier = players.find((m) => data.player.get(m).session === state.by)
            if (carrier !== undefined && data.life.get(carrier)._tag === "Alive" && data.arsenal.get(carrier).power === "panel") return state
            // Its carrier died (or left): it falls where they were, keeping its health.
            if (carrier !== undefined) {
              const a = data.arsenal.get(carrier)
              if (a.power === "panel") data.arsenal.set(carrier, { ...a, power: null, current: a.current === "panel" ? a.primary : a.current })
            }
            const at = rest(defs[i], carrier === undefined ? null : data.motion.get(carrier).body)
            return { _tag: "lying", x: at.x, y: at.y, z: at.z, hp: state.hp }
          }
          case "lying": {
            const taker = players.find((m) => {
              if (!free(m)) return false
              const b = data.motion.get(m).body
              const dx = b.x - state.x
              const dz = b.z - state.z
              return dx * dx + dz * dz <= TAKE_REACH * TAKE_REACH && Math.abs(b.y - state.y) <= TAKE_HEIGHT
            })
            if (taker === undefined) return state
            take(taker, data.arsenal.get(taker))
            const by = data.player.get(taker).session
            events.out.emit({ t: "panel", i, s: by, a: "taken" })
            return { _tag: "carried", by, hp: state.hp }
          }
          case "broken":
            return state
        }
      })
      if (next.some((s, i) => s !== before[i])) resources.panels.set(next)
    }
    services.physics.setPanels(resources.panels.get().map(panelOnWall))
  }
)
