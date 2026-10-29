/**
 * Applica i danni del tick: corazza, morti, uccisioni, assist, serie, punti.
 */
import { STREAKS } from "../../folklore.ts"
import { absorb, ASSIST_WINDOW_TICKS, RESPAWN_TICKS } from "../rules.ts"
import { Attackers, Damage, Game, Life, Match, Motion, Out, Player, Rules, Score, Stats, TeamOf, Tick } from "../schema.ts"

export const ApplyDamage = Game.System(
  "Sparedut/ApplyDamage",
  {
    queries: {
      players: Game.Query({
        selection: {
          player: Game.Query.read(Player),
          team: Game.Query.read(TeamOf),
          life: Game.Query.write(Life),
          stats: Game.Query.write(Stats),
          attackers: Game.Query.write(Attackers),
          motion: Game.Query.write(Motion)
        }
      })
    },
    resources: {
      tick: Game.System.readResource(Tick),
      rules: Game.System.readResource(Rules),
      score: Game.System.writeResource(Score)
    },
    events: { damage: Game.System.thisTick(Game.System.readEvent(Damage)), out: Game.System.writeEvent(Out) },
    machines: { match: Game.System.machine(Match) }
  },
  ({ queries, resources, events, machines }) => {
    const hits = events.damage.all()
    if (hits.length === 0) return
    const tick = resources.tick.get()
    const rules = resources.rules.get()
    const live = machines.match.get()._tag === "Live"
    const bySession = new Map(queries.players.each().map((m) => [m.data.player.get().session, m]))

    for (const hit of hits) {
      const victim = bySession.get(hit.victim)
      if (!victim) continue
      const life = victim.data.life.get()
      if (life._tag !== "Alive") continue
      const attacker = hit.attacker === null ? undefined : bySession.get(hit.attacker)
      const self = hit.attacker === hit.victim
      const victimTeam = victim.data.team.get()
      if (attacker && !self && !rules.friendlyFire && attacker.data.team.get() === victimTeam) continue
      if (life.shield > 0 && hit.weapon !== "fall") continue

      if (hit.push) {
        const push = hit.push
        victim.data.motion.update((mo) => ({ ...mo, body: { ...mo.body, vx: mo.body.vx + push.x, vy: Math.max(mo.body.vy, 0) + push.y, vz: mo.body.vz + push.z, grounded: false } }))
      }

      const after = absorb(life.hp, life.armor, hit.amount)
      const dead = after.hp <= 0
      if (attacker && !self) {
        victim.data.attackers.update((list) => [...list.filter((x) => x.session !== hit.attacker), { session: hit.attacker ?? "", tick }])
        attacker.data.stats.update((s) => ({ ...s, damage: s.damage + Math.min(hit.amount, life.hp + life.armor) }))
      }
      events.out.emit({ t: "hit", a: hit.attacker, v: hit.victim, d: Math.round(hit.amount), h: hit.head, kill: dead })

      if (!dead) {
        victim.data.life.update({ state: "Alive", data: (l) => ({ hp: after.hp, armor: after.armor, shield: l.shield }) })
        continue
      }

      const killer = attacker && !self ? attacker : undefined
      victim.data.life.transition({ from: "Alive", to: "Dead", data: { respawn: RESPAWN_TICKS, killer: killer ? hit.attacker : null } })
      victim.data.stats.update((s) => ({ ...s, deaths: s.deaths + 1, streak: 0 }))

      let streak = 0
      if (killer) {
        const ks = killer.data.stats.get()
        streak = ks.streak + 1
        killer.data.stats.set({
          ...ks,
          kills: ks.kills + 1,
          headshots: ks.headshots + (hit.head ? 1 : 0),
          streak,
          best: Math.max(ks.best, streak),
          score: ks.score + 100
        })
        if (live && rules.mode === "bataie") {
          const team = killer.data.team.get()
          resources.score.update((s) => ({ ...s, [team]: s[team] + 1 }))
        }
        if (STREAKS[streak]) events.out.emit({ t: "streak", s: hit.attacker ?? "", n: streak })
      } else if (live && rules.mode === "bataie" && (self || hit.weapon === "fall")) {
        // Suicidio: il punto va agli altri. Lo sbilf ride.
        const other = victimTeam === "benandanti" ? "malandanti" : "benandanti"
        resources.score.update((s) => ({ ...s, [other]: s[other] + 1 }))
      }

      for (const a of victim.data.attackers.get()) {
        if (a.session === hit.attacker || tick - a.tick > ASSIST_WINDOW_TICKS) continue
        bySession.get(a.session)?.data.stats.update((s) => ({ ...s, assists: s.assists + 1, score: s.score + 50 }))
      }
      victim.data.attackers.set([])

      events.out.emit({ t: "kill", k: killer ? hit.attacker : null, v: hit.victim, w: self && hit.weapon !== "sgnape" && hit.weapon !== "lanciafrico" ? "fall" : hit.weapon, h: hit.head, n: streak })
    }
  }
)
