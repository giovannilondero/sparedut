/**
 * La Tampieste: fuori dal cerchio sicuro la grandine fa male. Il cerchio è ricavato
 * dal tempo di partita (`stormAt`), non si salva.
 */
import { MAPS } from "../../maps/index.ts"
import { outsideStorm, STORM_DAMAGE, STORM_EVERY, stormAt } from "../rules.ts"
import { Damage, Game, Life, Match, Motion, Player, Rules, Tick } from "../schema.ts"

export const StormDamage = Game.System(
  "Sparedut/StormDamage",
  {
    queries: {
      players: Game.Query({ selection: { player: Game.Query.read(Player), motion: Game.Query.read(Motion), life: Game.Query.read(Life) } })
    },
    resources: { tick: Game.System.readResource(Tick), rules: Game.System.readResource(Rules) },
    events: { damage: Game.System.writeEvent(Damage) },
    machines: { match: Game.System.machine(Match) }
  },
  ({ queries, resources, events, machines }) => {
    const match = machines.match.get()
    const rules = resources.rules.get()
    const tick = resources.tick.get()
    if (match._tag !== "Live" || rules.mode !== "tampieste" || tick % STORM_EVERY !== 0) return
    const storm = stormAt(MAPS[rules.map], rules, match.ends - rules.timeLimitTicks, tick)
    for (const m of queries.players.each()) {
      if (m.data.life.get()._tag !== "Alive" || !outsideStorm(storm, m.data.motion.get().body)) continue
      events.damage.emit({ victim: m.data.player.get().session, attacker: null, amount: STORM_DAMAGE, weapon: "tampieste", head: false, push: null })
    }
  }
)
