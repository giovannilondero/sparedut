import { expect, test } from "bun:test"
import { initPhysics } from "../shared/physics.ts"
import { Room } from "../server/room.ts"
import type { ModeId } from "../shared/folklore.ts"

for (const mode of ["bataie", "frico", "culine"] as ModeId[]) {
  test(`i bot giocano una partita: ${mode}`, async () => {
    await initPhysics()
    const room = new Room("TEST", "nessuno", "Test", "lan", { mode, map: "glemone", minutes: 10, visibility: "code", level: "pari", ff: false })
    room.fillBots(6)
    room.start()
    const kinds = new Map<string, number>()
    const started = performance.now()
    const ticks = 60 * 90
    for (let i = 0; i < ticks; i++) {
      room.step()
    }
    const ms = (performance.now() - started) / ticks
    const v = room.sim.view()
    const kills = v.players.reduce((n, p) => n + p.stats.kills, 0)
    const caps = v.players.reduce((n, p) => n + p.stats.caps, 0)
    console.log(mode, { msPerTick: ms.toFixed(2), score: v.score, kills, caps, hill: v.hill })
    expect(kills).toBeGreaterThan(3)
    expect(ms).toBeLessThan(8)
    void kinds
  }, 120000)
}
