/**
 * Il medico: chi ha la Cassele dal Miedi come arma principale cura piano sé stesso
 * e i compagni vicini. Manda solo cure: le applica `ApplyDamage`.
 */
import { MEDIC_AURA } from "../../weapons.ts"
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
    if (machines.match.get()._tag === "Over" || resources.tick.get() % MEDIC_AURA.everyTicks !== 0) return
    const rules = resources.rules.get()
    const living = queries.players.each().filter((m) => m.data.life.get()._tag === "Alive")
    for (const medic of living) {
      if (medic.data.arsenal.get().primary !== "miedi") continue
      const healer = medic.data.player.get().session
      const team = medic.data.team.get()
      const at = medic.data.motion.get().body
      for (const m of living) {
        const session = m.data.player.get().session
        if (session !== healer && !allied(rules, team, m.data.team.get())) continue
        const b = m.data.motion.get().body
        const dx = b.x - at.x
        const dy = b.y - at.y
        const dz = b.z - at.z
        if (dx * dx + dy * dy + dz * dz > MEDIC_AURA.radius * MEDIC_AURA.radius) continue
        events.heal.emit({ target: session, healer, amount: MEDIC_AURA.amount })
      }
    }
  }
)
