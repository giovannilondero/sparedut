/**
 * Turrets with the mitraie: mount with the "use" key while standing behind the gun,
 * dismount with "use" or by jumping. Whoever dies or leaves frees it. Heat drops
 * on its own; when overheated it won't fire until it has cooled down. Firing is done by
 * `UseWeapons`, holding the body in the seat by `MovePlayers`.
 */
import { Ops } from "@typeonce/ritmo"
import { turretSeat } from "../../map.ts"
import { MAPS } from "../../maps/index.ts"
import { TURRET } from "../../weapons.ts"
import { Controls, Game, Life, Match, Motion, Out, Player, Rules, Turrets, type TurretState } from "../schema.ts"
import { justPressed } from "./input.ts"

export const MountTurrets = Game.System(
  "Sparedut/MountTurrets",
  {
    queries: {
      players: Game.Query({
        selection: { player: Game.Query.read(Player), life: Game.Query.read(Life), controls: Game.Query.read(Controls), motion: Game.Query.read(Motion) }
      })
    },
    resources: { rules: Game.System.readResource(Rules), turrets: Game.System.writeResource(Turrets) },
    events: { out: Game.System.writeEvent(Out) },
    machines: { match: Game.System.machine(Match) }
  },
  ({ queries, resources, events, machines }) => {
    const spots = MAPS[resources.rules.get().map].turrets
    if (spots.length === 0) return
    const players = queries.players.each()
    const alive = new Set(players.filter((m) => m.data.life.get()._tag === "Alive").map((m) => m.data.player.get().session))

    // Cooling, next shot, and whoever is gone gives up the seat.
    const next: TurretState[] = resources.turrets.get().map((t, i) => {
      const heat = Math.max(0, t.heat - (t.jammed ? TURRET.jamCool : TURRET.cool))
      const jammed = t.jammed && heat > 0
      if (t.jammed && !jammed) events.out.emit({ t: "turret", i, s: t.gunner, a: "cool" })
      const gunner = t.gunner !== null && alive.has(t.gunner) ? t.gunner : null
      if (t.gunner !== null && gunner === null) events.out.emit({ t: "turret", i, s: t.gunner, a: "off" })
      return { gunner, heat, jammed, cooldown: Math.max(0, t.cooldown - 1) }
    })

    if (machines.match.get()._tag !== "Over") {
      for (const m of players) {
        const session = m.data.player.get().session
        if (!alive.has(session)) continue
        const controls = m.data.controls.get()
        const mounted = next.findIndex((t) => t.gunner === session)
        if (mounted >= 0) {
          if (justPressed(controls, "use") || justPressed(controls, "jump")) {
            next[mounted] = { ...next[mounted], gunner: null }
            events.out.emit({ t: "turret", i: mounted, s: session, a: "off" })
          }
          continue
        }
        if (!justPressed(controls, "use")) continue
        // The nearest free turret, if standing behind it.
        const body = m.data.motion.get().body
        let best = -1
        let bestD: number = TURRET.reach
        spots.forEach((spot, i) => {
          if (next[i].gunner !== null) return
          const seat = turretSeat(spot)
          const d = Ops.hypot(body.x - seat[0], body.z - seat[2])
          if (d <= bestD && Math.abs(body.y - seat[1]) < 1.2) {
            best = i
            bestD = d
          }
        })
        if (best >= 0) {
          next[best] = { ...next[best], gunner: session }
          events.out.emit({ t: "turret", i: best, s: session, a: "on" })
        }
      }
    }
    resources.turrets.set(next)
  }
)
