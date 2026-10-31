/**
 * The dead count down ticks and respawn at their team's safest point.
 * In a live Tampieste there's no respawning: one life only.
 */
import { Random } from "@typeonce/ritmo"
import { IDLE_INPUT } from "../../input.ts"
import { chooseSpawn, everyoneAlone, START_GRACE_TICKS, freshArsenal, hostile, MAX_HP, SHIELD_TICKS, spawnsFor } from "../rules.ts"
import { MAPS } from "../../maps/index.ts"
import { Arsenal, Attackers, Controls, Game, Life, Match, Motion, Out, Player, Rng, Rules, TeamOf, Tick } from "../schema.ts"

export const Respawn = Game.System(
  "Sparedut/Respawn",
  {
    queries: {
      players: Game.Query({
        selection: {
          player: Game.Query.read(Player),
          team: Game.Query.read(TeamOf),
          life: Game.Query.write(Life),
          motion: Game.Query.write(Motion),
          controls: Game.Query.write(Controls),
          arsenal: Game.Query.write(Arsenal),
          attackers: Game.Query.write(Attackers)
        }
      })
    },
    resources: { tick: Game.System.readResource(Tick), rules: Game.System.readResource(Rules), rng: Game.System.writeResource(Rng) },
    events: { out: Game.System.writeEvent(Out) },
    machines: { match: Game.System.machine(Match) }
  },
  ({ queries, resources, events, machines }) => {
    const match = machines.match.get()
    const rules = resources.rules.get()
    const map = MAPS[rules.map]
    // Match start respawns everyone (Tampieste included); after that, whoever dies stays to watch.
    const started = match._tag === "Live" && resources.tick.get() - (match.ends - rules.timeLimitTicks) > START_GRACE_TICKS
    const hold = match._tag === "Over" || (started && everyoneAlone(rules))
    const all = queries.players.each()
    const rng = Random.draw(resources.rng)
    for (const m of all) {
      const life = m.data.life.get()
      if (life._tag !== "Dead") {
        if (life.shield > 0) m.data.life.update({ state: "Alive", data: (a) => ({ hp: a.hp, armor: a.armor, shield: a.shield - 1 }) })
        continue
      }
      if (life.respawn > 1 || hold) {
        m.data.life.update({ state: "Dead", data: (d) => ({ respawn: Math.max(1, d.respawn - 1), killer: d.killer }) })
        continue
      }
      const team = m.data.team.get()
      const enemies = all
        .filter((o) => o !== m && hostile(rules, team, o.data.team.get()) && o.data.life.get()._tag === "Alive")
        .map((o) => o.data.motion.get().body)
      const spot = chooseSpawn(spawnsFor(map, rules, team), enemies, rng.next() * 1000)
      m.data.life.transition({ from: "Dead", to: "Alive", data: { hp: MAX_HP, armor: 0, shield: SHIELD_TICKS } })
      m.data.motion.set({
        body: { x: spot.at[0], y: spot.at[1], z: spot.at[2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false },
        yaw: spot.yaw,
        pitch: 0
      })
      const arsenal = m.data.arsenal.get()
      m.data.arsenal.set(freshArsenal(arsenal.nextPrimary))
      m.data.controls.update((c) => ({
        input: { ...IDLE_INPUT, seq: c.input.seq, view: c.input.view, yaw: spot.yaw, weapon: arsenal.nextPrimary },
        previous: c.input.buttons,
        pressed: 0,
        steps: [],
        switchTo: null,
        starved: 0
      }))
      m.data.attackers.set([])
      events.out.emit({ t: "spawn", s: m.data.player.get().session })
    }
  }
)
