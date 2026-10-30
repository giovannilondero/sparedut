/**
 * Obiettivi: Cjape il Frico (bandiera) e Re de Plaçute (collina).
 */
import { TEAMS, type Team } from "../../map.ts"
import { MAPS } from "../../maps/index.ts"
import { FLAG_RETURN_TICKS, otherTeam } from "../rules.ts"
import { Flags, Game, Hill, Life, Match, Motion, Out, Player, Rules, Score, Stats, TeamOf, type FlagState } from "../schema.ts"

const TOUCH = 1.8

export const PlayObjectives = Game.System(
  "Sparedut/PlayObjectives",
  {
    queries: {
      players: Game.Query({
        selection: {
          player: Game.Query.read(Player),
          team: Game.Query.read(TeamOf),
          motion: Game.Query.read(Motion),
          life: Game.Query.read(Life),
          stats: Game.Query.write(Stats)
        }
      })
    },
    resources: {
      rules: Game.System.readResource(Rules),
      flags: Game.System.writeResource(Flags),
      hill: Game.System.writeResource(Hill),
      score: Game.System.writeResource(Score)
    },
    events: { out: Game.System.writeEvent(Out) },
    machines: { match: Game.System.machine(Match) }
  },
  ({ queries, resources, events, machines }) => {
    const rules = resources.rules.get()
    const phase = machines.match.get()._tag
    if (phase === "Over") return
    const live = phase === "Live"
    const { flagBases: FLAG_BASES, hill: HILL } = MAPS[rules.map]
    const players = queries.players.each().map((m) => ({
      m,
      session: m.data.player.get().session,
      team: m.data.team.get(),
      body: m.data.motion.get().body,
      alive: m.data.life.get()._tag === "Alive"
    }))
    const near = (b: { x: number; y: number; z: number }, at: readonly [number, number, number], r: number) => {
      const dx = b.x - at[0]
      const dz = b.z - at[2]
      return dx * dx + dz * dz < r * r && Math.abs(b.y - at[1]) < 2.2
    }

    if (rules.mode === "frico") {
      const flags: Record<Team, FlagState> = { ...resources.flags.get() }
      for (const team of TEAMS) {
        const flag = flags[team]
        const enemies = players.filter((p) => p.alive && p.team !== team)
        const friends = players.filter((p) => p.alive && p.team === team)
        switch (flag._tag) {
          case "base": {
            const thief = enemies.find((p) => near(p.body, FLAG_BASES[team], TOUCH))
            if (thief) {
              flags[team] = { _tag: "carried", by: thief.session }
              events.out.emit({ t: "flag", team, a: "taken", s: thief.session })
            }
            break
          }
          case "carried": {
            const carrier = players.find((p) => p.session === flag.by)
            if (!carrier || !carrier.alive) {
              const b = carrier?.body ?? { x: FLAG_BASES[team][0], y: FLAG_BASES[team][1], z: FLAG_BASES[team][2] }
              flags[team] = { _tag: "dropped", x: b.x, y: Math.max(b.y, -2), z: b.z, ticks: FLAG_RETURN_TICKS }
              events.out.emit({ t: "flag", team, a: "dropped", s: flag.by })
              break
            }
            const home = otherTeam(team)
            if (near(carrier.body, FLAG_BASES[home], TOUCH + 0.4) && flags[home]._tag === "base") {
              flags[team] = { _tag: "base" }
              if (live) resources.score.update((s) => ({ ...s, [home]: s[home] + 1 }))
              carrier.m.data.stats.update((s) => ({ ...s, caps: s.caps + 1, score: s.score + 300 }))
              events.out.emit({ t: "flag", team, a: "captured", s: carrier.session })
            }
            break
          }
          case "dropped": {
            const at = [flag.x, flag.y, flag.z] as const
            const friend = friends.find((p) => near(p.body, at, TOUCH))
            const enemy = enemies.find((p) => near(p.body, at, TOUCH))
            if (friend) {
              flags[team] = { _tag: "base" }
              friend.m.data.stats.update((s) => ({ ...s, score: s.score + 50 }))
              events.out.emit({ t: "flag", team, a: "returned", s: friend.session })
            } else if (enemy) {
              flags[team] = { _tag: "carried", by: enemy.session }
              events.out.emit({ t: "flag", team, a: "taken", s: enemy.session })
            } else if (flag.ticks <= 1) {
              flags[team] = { _tag: "base" }
              events.out.emit({ t: "flag", team, a: "returned", s: null })
            } else flags[team] = { ...flag, ticks: flag.ticks - 1 }
            break
          }
        }
      }
      resources.flags.set(flags)
    }

    if (rules.mode === "culine") {
      const inside = players.filter((p) => p.alive && near(p.body, HILL.at, HILL.radius))
      const teams = new Set(inside.map((p) => p.team))
      const hill = resources.hill.get()
      const owner = teams.size === 1 ? [...teams][0] : teams.size === 0 ? null : hill.owner
      const contested = teams.size > 1
      if (owner !== hill.owner) events.out.emit({ t: "hill", team: owner })
      const ticks = owner && !contested ? (owner === hill.owner ? hill.ticks + 1 : 1) : 0
      if (owner && !contested && ticks % 60 === 0) {
        if (live) resources.score.update((s) => ({ ...s, [owner]: s[owner] + 1 }))
        for (const p of inside) p.m.data.stats.update((s) => ({ ...s, score: s.score + 5 }))
      }
      resources.hill.set({ owner, contested, ticks })
    }
  }
)
