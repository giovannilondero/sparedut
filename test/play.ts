/** Test helper: a full bot-only match on a map. */
import { Room } from "../server/room.ts"
import type { ModeId } from "../shared/folklore.ts"
import type { MapId } from "../shared/map.ts"

/**
 * Bots against bots for `seconds`. Kills are counted as they happen: a match that
 * ends and restarts (common in Tampieste) resets the stats.
 */
export function playBots(map: MapId, mode: ModeId, seconds = 90, perTeam = 6) {
  const room = new Room("TEST", "nessuno", "Test", "lan", { mode, map, minutes: 10, visibility: "code", level: "pari", ff: false })
  room.fillBots(perTeam)
  room.start()
  const started = performance.now()
  const ticks = 60 * seconds
  let kills = 0
  let seen = 0
  for (let i = 0; i < ticks; i++) {
    room.step()
    const now = room.sim.view().players.reduce((n, p) => n + p.stats.kills, 0)
    kills += Math.max(0, now - seen)
    seen = now
  }
  return { room, kills, view: room.sim.view(), msPerTick: (performance.now() - started) / ticks }
}
