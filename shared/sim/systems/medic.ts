/**
 * The medic, the Miedi class's trait: whoever has the Cassele dal Miedi as primary slowly heals themselves
 * and nearby teammates. It only sends heals: `ApplyDamage` applies them.
 */
import { CLASSES, MEDIC_AURA } from "../../weapons.ts"
import { allied } from "../rules.ts"
import { Arsenal, Game, Heal, Life, Match, Motion, Player, Rules, TeamOf, Tick } from "../schema.ts"

export const MedicAura = Game.System(
  "Sparedut/MedicAura",
  {
    queries: {
      players: Game.Query({
        selection: {
          player: Game.Query.read(Player),
          team: Game.Query.read(TeamOf),
          motion: Game.Query.read(Motion),
          life: Game.Query.read(Life),
          arsenal: Game.Query.read(Arsenal)
        }
      })
    },
    resources: { tick: Game.System.readResource(Tick), rules: Game.System.readResource(Rules) },
    events: { heal: Game.System.writeEvent(Heal) },
    machines: { match: Game.System.machine(Match) }
  },
  ({ queries, resources, events, machines }) => {
    const { data } = queries.players
    if (machines.match.get()._tag === "Over" || resources.tick.get() % MEDIC_AURA.everyTicks !== 0) return
    const rules = resources.rules.get()
    const living = queries.players.each().filter((m) => data.life.get(m)._tag === "Alive")
    for (const medic of living) {
      if (CLASSES[data.arsenal.get(medic).primary].trait !== "medic") continue
      const healer = data.player.get(medic).session
      const team = data.team.get(medic)
      const at = data.motion.get(medic).body
      for (const m of living) {
        const session = data.player.get(m).session
        if (session !== healer && !allied(rules, team, data.team.get(m))) continue
        const b = data.motion.get(m).body
        const dx = b.x - at.x
        const dy = b.y - at.y
        const dz = b.z - at.z
        if (dx * dx + dy * dy + dz * dz > MEDIC_AURA.radius * MEDIC_AURA.radius) continue
        events.heal.emit({ target: session, healer, amount: MEDIC_AURA.amount })
      }
    }
  }
)
