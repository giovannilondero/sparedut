/**
 * Applies the tick's heals and damage: it's the only system that touches the health of the living
 * after respawn. Armor, deaths, kills, assists, streaks, points.
 */
import { STREAK_AT } from "../../folklore.ts"
import { killsScore, spared, SPARED_HP } from "../../training/spared.ts"
import type { KillCause } from "../events.ts"
import { absorb, ASSIST_WINDOW_TICKS, currentStation, hostile, MAX_HP, RESPAWN_TICKS } from "../rules.ts"
import { Attackers, Damage, Game, Heal, Life, Match, Motion, Out, Player, Rules, Score, Stats, TeamOf, Tick, Training } from "../schema.ts"

/** Causes that can also hit whoever launched them (the others, on oneself, count as a fall). */
const SELF_HARM: ReadonlySet<KillCause> = new Set(["sgnape", "lanciafrico", "mine", "tampieste"])
/** Points to the medic for each health point restored to a teammate. */
const HEAL_SCORE = 0.25

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
    events: {
      damage: Game.System.thisTick(Game.System.readEvent(Damage)),
      heal: Game.System.thisTick(Game.System.readEvent(Heal)),
      out: Game.System.writeEvent(Out)
    },
    machines: { match: Game.System.machine(Match), training: Game.System.machine(Training) }
  },
  ({ queries, resources, events, machines }) => {
    const { data } = queries.players
    const hits = events.damage.all()
    const heals = events.heal.all()
    if (hits.length === 0 && heals.length === 0) return
    const tick = resources.tick.get()
    const rules = resources.rules.get()
    const live = machines.match.get()._tag === "Live"
    const bySession = new Map(queries.players.each().map((m) => [data.player.get(m).session, m]))
    // The training spares the trainee (the one player who is not a bot) before the skirmish.
    const training = machines.training.get()
    const station = currentStation(training)
    const sparing = station !== null && spared(station)
    // Kills score in a Bataie di Gnot, and in the training's skirmish, which is one.
    const scoring = rules.mode === "bataie" || (training._tag === "Step" && killsScore(training.station))

    for (const h of heals) {
      const target = bySession.get(h.target)
      if (!target) continue
      const life = data.life.get(target)
      if (life._tag !== "Alive" || life.hp >= MAX_HP) continue
      const gained = Math.min(MAX_HP - life.hp, h.amount)
      data.life.update(target, { state: "Alive", data: (l) => ({ hp: l.hp + gained, armor: l.armor, shield: l.shield }) })
      if (h.healer !== h.target) {
        const healer = bySession.get(h.healer)
        if (healer) data.stats.update(healer, (s) => ({ ...s, score: s.score + gained * HEAL_SCORE }))
        events.out.emit({ t: "heal", s: h.healer, v: h.target, n: gained })
      }
    }

    for (const hit of hits) {
      const victim = bySession.get(hit.victim)
      if (!victim) continue
      const life = data.life.get(victim)
      if (life._tag !== "Alive") continue
      const attacker = hit.attacker === null ? undefined : bySession.get(hit.attacker)
      const self = hit.attacker === hit.victim
      const victimTeam = data.team.get(victim)
      if (attacker && !self && !hostile(rules, data.team.get(attacker), victimTeam)) continue
      if (life.shield > 0 && hit.weapon !== "fall") continue

      if (hit.push) {
        const push = hit.push
        data.motion.update(victim, (mo) => ({ ...mo, body: { ...mo.body, vx: mo.body.vx + push.x, vy: Math.max(mo.body.vy, 0) + push.y, vz: mo.body.vz + push.z, grounded: false } }))
      }

      const absorbed = absorb(life.hp, life.armor, hit.amount)
      const after = sparing && absorbed.hp <= 0 && !data.player.get(victim).bot ? { hp: SPARED_HP, armor: absorbed.armor } : absorbed
      const dead = after.hp <= 0
      if (attacker && !self) {
        data.attackers.update(victim, (list) => [...list.filter((x) => x.session !== hit.attacker), { session: hit.attacker ?? "", tick }])
        data.stats.update(attacker, (s) => ({ ...s, damage: s.damage + Math.min(hit.amount, life.hp + life.armor) }))
      }
      events.out.emit({ t: "hit", a: hit.attacker, v: hit.victim, d: Math.round(hit.amount), h: hit.head, kill: dead })

      if (!dead) {
        data.life.update(victim, { state: "Alive", data: (l) => ({ hp: after.hp, armor: after.armor, shield: l.shield }) })
        continue
      }

      const killer = attacker && !self ? attacker : undefined
      data.life.transition(victim, { from: "Alive", to: "Dead", data: { respawn: RESPAWN_TICKS, killer: killer ? hit.attacker : null } })
      data.stats.update(victim, (s) => ({ ...s, deaths: s.deaths + 1, streak: 0 }))

      let streak = 0
      if (killer) {
        const ks = data.stats.get(killer)
        streak = ks.streak + 1
        data.stats.set(killer, {
          ...ks,
          kills: ks.kills + 1,
          headshots: ks.headshots + (hit.head ? 1 : 0),
          streak,
          best: Math.max(ks.best, streak),
          score: ks.score + 100
        })
        if (live && scoring) {
          const team = data.team.get(killer)
          resources.score.update((s) => ({ ...s, [team]: s[team] + 1 }))
        }
        if (STREAK_AT.has(streak)) events.out.emit({ t: "streak", s: hit.attacker ?? "", n: streak })
      } else if (live && scoring && (self || hit.weapon === "fall")) {
        // Suicide: the point goes to the other team. The sbilf laughs.
        const other = victimTeam === "benandanti" ? "malandanti" : "benandanti"
        resources.score.update((s) => ({ ...s, [other]: s[other] + 1 }))
      }

      for (const a of data.attackers.get(victim)) {
        if (a.session === hit.attacker || tick - a.tick > ASSIST_WINDOW_TICKS) continue
        const helper = bySession.get(a.session)
        if (helper) data.stats.update(helper, (s) => ({ ...s, assists: s.assists + 1, score: s.score + 50 }))
      }
      data.attackers.set(victim, [])

      events.out.emit({ t: "kill", k: killer ? hit.attacker : null, v: hit.victim, w: self && !SELF_HARM.has(hit.weapon) ? "fall" : hit.weapon, h: hit.head, n: streak })
    }
  }
)
