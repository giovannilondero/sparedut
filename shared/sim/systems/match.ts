/**
 * Match flow: Muster → live → over → Muster again. The host's start begins the match from the
 * Muster; during a live match it ends it and sends the room back to the Muster.
 * Each mode decides when it ends and who wins.
 */
import { TEAMS } from "../../map.ts"
import { MAPS } from "../../maps/index.ts"
import type { Winner } from "../events.ts"
import { freshDoors, freshPanels, freshPickups, freshTurrets, FRESH_CART, FRESH_FLAGS, FRESH_HILL, NO_STATS, OVER_TICKS, RESPAWN_TICKS, START_GRACE_TICKS } from "../rules.ts"
import { Attackers, Cart, Doors, Flags, Game, Hill, Life, Match, Out, Panels, Pickups, Player, Rules, Score, StartMatch, Stats, Tick, Turrets } from "../schema.ts"

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
      cart: Game.System.writeResource(Cart),
      pickups: Game.System.writeResource(Pickups),
      turrets: Game.System.writeResource(Turrets),
      doors: Game.System.writeResource(Doors),
      panels: Game.System.writeResource(Panels)
    },
    events: { start: Game.System.readEvent(StartMatch), out: Game.System.writeEvent(Out) },
    machines: { match: Game.System.machine(Match) },
    nextMachines: { match: Game.System.nextState(Match) }
  },
  ({ queries, resources, events, machines, nextMachines }) => {
    const { data } = queries.players
    const tick = resources.tick.get()
    const rules = resources.rules.get()
    const match = machines.match.get()
    const startRequested = events.start.all().length > 0

    const begin = () => {
      resources.score.set({ benandanti: 0, malandanti: 0 })
      resources.flags.set(FRESH_FLAGS)
      resources.hill.set(FRESH_HILL)
      resources.cart.set(FRESH_CART)
      resources.pickups.set(freshPickups(MAPS[rules.map], rules))
      resources.turrets.set(freshTurrets(MAPS[rules.map]))
      resources.doors.set(freshDoors(MAPS[rules.map]))
      resources.panels.set(freshPanels(MAPS[rules.map]))
      for (const m of queries.players.each()) {
        data.stats.set(m, NO_STATS)
        data.attackers.set(m, [])
        const life = data.life.get(m)
        if (life._tag === "Alive") data.life.transition(m, { from: "Alive", to: "Dead", data: { respawn: 1, killer: null } })
        else data.life.update(m, { state: "Dead", data: () => ({ respawn: 1, killer: null }) })
      }
      nextMachines.match.transition({ from: "Muster", to: "Live", data: { ends: tick + rules.timeLimitTicks } })
      events.out.emit({ t: "match", a: "start", winner: null })
    }

    /**
     * Back to the Muster: everybody leaves the map, nobody credited with it. The wait is a whole
     * respawn's, so that nobody comes back in this tick, while the match is still live; the
     * Muster then holds everybody until the start.
     */
    const muster = (from: "Live" | "Over") => {
      const off = { respawn: RESPAWN_TICKS, killer: null }
      for (const m of queries.players.each()) {
        if (data.life.get(m)._tag === "Alive") data.life.transition(m, { from: "Alive", to: "Dead", data: off })
        else data.life.update(m, { state: "Dead", data: () => off })
      }
      nextMachines.match.transition({ from, to: "Muster" })
    }

    /** The winner if the match ended this tick, otherwise null. */
    const verdict = (ends: number): Winner | null => {
      const timeUp = tick >= ends
      const score = resources.score.get()
      switch (rules.mode) {
        case "tampieste": {
          // Last one standing; at least two participants are needed, otherwise play goes on.
          const all = queries.players.each()
          const alive = all.filter((m) => data.life.get(m)._tag === "Alive")
          const last = (): Winner => {
            let best: { player: string; name: string; hp: number } | null = null
            for (const m of alive) {
              const life = data.life.get(m)
              const hp = life._tag === "Alive" ? life.hp + life.armor : 0
              if (!best || hp > best.hp) best = { player: data.player.get(m).session, name: data.player.get(m).name, hp }
            }
            return best ? { player: best.player, name: best.name } : "pari"
          }
          if (tick - (ends - rules.timeLimitTicks) <= START_GRACE_TICKS) return null
          if (all.length >= 2 && alive.length <= 1) return last()
          return timeUp ? last() : null
        }
        case "dutrine":
          // The training ends when its last step completes, never by time or score.
          return null
        case "cjar":
          // The Benandanti win by reaching the end; when time runs out, the Malandanti have held.
          if (score.benandanti >= rules.scoreLimit) return "benandanti"
          return timeUp ? "malandanti" : null
        default: {
          const reached = TEAMS.find((t) => score[t] >= rules.scoreLimit)
          if (!reached && !timeUp) return null
          return score.benandanti === score.malandanti ? "pari" : score.benandanti > score.malandanti ? "benandanti" : "malandanti"
        }
      }
    }

    switch (match._tag) {
      case "Muster":
        // Only the host's start begins a match: the Muster never ends by itself.
        if (startRequested) begin()
        return
      case "Live": {
        const winner = verdict(match.ends)
        if (winner) {
          nextMachines.match.transition({ from: "Live", to: "Over", data: { winner, restarts: tick + OVER_TICKS } })
          events.out.emit({ t: "match", a: "end", winner })
        } else if (startRequested) muster("Live")
        return
      }
      case "Over":
        // The results are shown, then the Muster; the host's start goes there at once.
        if (startRequested || tick >= match.restarts) muster("Over")
        return
    }
  }
)
