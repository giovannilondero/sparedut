/**
 * Match flow: warmup → live → over → live again.
 * Each mode decides when it ends and who wins.
 */
import { TEAMS } from "../../map.ts"
import { MAPS } from "../../maps/index.ts"
import type { Winner } from "../events.ts"
import { freshDoors, freshTurrets, NO_STATS, OVER_TICKS, START_GRACE_TICKS, WARMUP_TICKS } from "../rules.ts"
import { Attackers, Cart, Doors, Flags, Game, Hill, Life, Match, Out, Pickups, Player, Rules, Score, StartMatch, Stats, Tick, Turrets } from "../schema.ts"

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
      doors: Game.System.writeResource(Doors)
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
      resources.cart.set({ d: 0, pushers: 0, contested: false, idle: 0 })
      resources.pickups.set(MAPS[rules.map].pickups.map(() => ({ _tag: "up" })))
      resources.turrets.set(freshTurrets(MAPS[rules.map]))
      resources.doors.set(freshDoors(MAPS[rules.map]))
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

    /** The winner if the match ended this tick, otherwise null. */
    const verdict = (ends: number): Winner | null => {
      const timeUp = tick >= ends
      const score = resources.score.get()
      switch (rules.mode) {
        case "tampieste": {
          // Last one standing; at least two participants are needed, otherwise play goes on.
          const all = queries.players.each()
          const alive = all.filter((m) => m.data.life.get()._tag === "Alive")
          const last = (): Winner => {
            let best: { player: string; name: string; hp: number } | null = null
            for (const m of alive) {
              const life = m.data.life.get()
              const hp = life._tag === "Alive" ? life.hp + life.armor : 0
              if (!best || hp > best.hp) best = { player: m.data.player.get().session, name: m.data.player.get().name, hp }
            }
            return best ? { player: best.player, name: best.name } : "pari"
          }
          if (tick - (ends - rules.timeLimitTicks) <= START_GRACE_TICKS) return null
          if (all.length >= 2 && alive.length <= 1) return last()
          return timeUp ? last() : null
        }
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
      case "Warmup":
        // Without this, if the host never presses "start" points never count.
        if (startRequested || tick >= WARMUP_TICKS) begin()
        return
      case "Live": {
        const winner = verdict(match.ends)
        if (winner) {
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
