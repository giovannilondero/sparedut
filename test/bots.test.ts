import { expect, test } from "bun:test"
import { initPhysics } from "../shared/physics.ts"
import { Room } from "../server/room.ts"
import { MODE_IDS } from "../shared/folklore.ts"

for (const mode of MODE_IDS) {
  test(`i bot giocano una partita: ${mode}`, async () => {
    await initPhysics()
    const room = new Room("TEST", "nessuno", "Test", "lan", { mode, map: "glemone", minutes: 10, visibility: "code", level: "pari", ff: false })
    room.fillBots(6)
    room.start()
    const started = performance.now()
    const ticks = 60 * 90
    let maxCart = 0
    let over = false
    for (let i = 0; i < ticks; i++) {
      room.step()
      const v = room.sim.view()
      maxCart = Math.max(maxCart, v.cart?.progress ?? 0)
      if (v.phase.tag === "Over") {
        over = true
        break
      }
    }
    const ms = (performance.now() - started) / ticks
    const v = room.sim.view()
    const kills = v.players.reduce((n, p) => n + p.stats.kills, 0)
    const caps = v.players.reduce((n, p) => n + p.stats.caps, 0)
    const alive = v.players.filter((p) => p.alive).length
    console.log(mode, { msPerTick: ms.toFixed(2), score: v.score, kills, caps, hill: v.hill, cart: maxCart.toFixed(2), alive, phase: v.phase.tag })
    expect(kills).toBeGreaterThan(3)
    expect(ms).toBeLessThan(8)
    if (mode === "cjar") expect(maxCart).toBeGreaterThan(0.05)
    if (mode === "tampieste") {
      // Una vita sola: o è finita con un vincitore, o i vivi sono calati.
      if (over && v.phase.tag === "Over") expect(v.phase.winner).not.toBe(null)
      else expect(alive).toBeLessThan(12)
    }
  }, 120000)
}
