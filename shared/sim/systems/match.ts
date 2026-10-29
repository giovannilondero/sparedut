/**
 * Il flusso della partita: riscaldamento → in corso → finita → di nuovo in corso.
 */
import { PICKUPS, TEAMS } from "../../map.ts"
import { NO_STATS, OVER_TICKS } from "../rules.ts"
import { Attackers, Flags, Game, Hill, Life, Match, Out, Pickups, Player, Rules, Score, StartMatch, Stats, Tick } from "../schema.ts"

export const AdvanceTick = Game.System(
  "Sparedut/AdvanceTick",
  { resources: { tick: Game.System.writeResource(Tick) } },
  ({ resources }) => {
    resources.tick.update((t) => t + 1)
  }
)

export const MatchFlow = Game.System(
  "Sparedut/MatchFlow",
  {
    queries: {
      players: Game.Query({
        selection: {
          player: Game.Query.read(Player),
          life: Game.Query.write(Life),
          stats: Game.Query.write(Stats),
          attackers: Game.Query.write(Attackers)
        }
      })
    },
    resources: {
      tick: Game.System.readResource(Tick),
      rules: Game.System.readResource(Rules),
      score: Game.System.writeResource(Score),
      flags: Game.System.writeResource(Flags),
      hill: Game.System.writeResource(Hill),
      pickups: Game.System.writeResource(Pickups)
    },
    events: { start: Game.System.readEvent(StartMatch), out: Game.System.writeEvent(Out) },
    machines: { match: Game.System.machine(Match) },
    nextMachines: { match: Game.System.nextState(Match) }
  },
  ({ queries, resources, events, machines, nextMachines }) => {
    const tick = resources.tick.get()
    const rules = resources.rules.get()
    const match = machines.match.get()
    const startRequested = events.start.all().length > 0

    const begin = () => {
      resources.score.set({ benandanti: 0, malandanti: 0 })
      resources.flags.set({ benandanti: { _tag: "base" }, malandanti: { _tag: "base" } })
      resources.hill.set({ owner: null, contested: false, ticks: 0 })
      resources.pickups.set(PICKUPS.map(() => ({ _tag: "up" })))
      for (const m of queries.players.each()) {
        m.data.stats.set(NO_STATS)
        m.data.attackers.set([])
        const life = m.data.life.get()
        if (life._tag === "Alive") m.data.life.transition({ from: "Alive", to: "Dead", data: { respawn: 1, killer: null } })
        else m.data.life.update({ state: "Dead", data: () => ({ respawn: 1, killer: null }) })
      }
      nextMachines.match.set({ _tag: "Live", ends: tick + rules.timeLimitTicks })
      events.out.emit({ t: "match", a: "start", winner: null })
    }

    switch (match._tag) {
      case "Warmup":
        if (startRequested) begin()
        return
      case "Live": {
        const score = resources.score.get()
        const reached = TEAMS.find((t) => score[t] >= rules.scoreLimit)
        if (reached || tick >= match.ends) {
          const winner = score.benandanti === score.malandanti ? "pari" : score.benandanti > score.malandanti ? "benandanti" : "malandanti"
          nextMachines.match.set({ _tag: "Over", winner, restarts: tick + OVER_TICKS })
          events.out.emit({ t: "match", a: "end", winner })
        } else if (startRequested) begin()
        return
      }
      case "Over":
        if (startRequested || tick >= match.restarts) begin()
        return
    }
  }
)
