import { expect, test } from "bun:test"
import { initPhysics } from "../shared/physics.ts"
import { Room } from "../server/room.ts"
import { ROOM_MODE_IDS } from "../shared/folklore.ts"
import { onlooker } from "./play.ts"

for (const mode of ROOM_MODE_IDS) {
  test(`bots play a match: ${mode}`, async () => {
    await initPhysics()
    const room = new Room("TEST", "nessuno", "Test", "lan", { mode, map: "glemone", minutes: 10, reach: "online", access: { kind: "open" }, level: "pari", ff: false, single: null })
    room.fillBots(6)
    room.start()
    const feed = onlooker(room)
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
    // Kills with the Motosee: one or two bots out of twelve carry it, so this is reported, not asserted.
    const cuts = feed.filter((e) => e.t === "kill" && e.w === "motosee").length
    console.log(mode, { msPerTick: ms.toFixed(2), score: v.score, kills, cuts, caps, hill: v.hill, cart: maxCart.toFixed(2), alive, phase: v.phase.tag })
    expect(kills).toBeGreaterThan(3)
    expect(ms).toBeLessThan(8)
    if (mode === "cjar") expect(maxCart).toBeGreaterThan(0.05)
    if (mode === "tampieste") {
      // A single life: either it ended with a winner, or the number alive has dropped.
      if (over && v.phase.tag === "Over") expect(v.phase.winner).not.toBe(null)
      else expect(alive).toBeLessThan(12)
    }
  }, 120000)
}

for (const mode of ROOM_MODE_IDS) {
  test(`bots carrying the Motosee close in and cut: ${mode}`, async () => {
    await initPhysics()
    const room = new Room("TEST", "nessuno", "Test", "lan", { mode, map: "glemone", minutes: 10, reach: "online", access: { kind: "open" }, level: "pari", ff: false, single: "motosee" })
    room.fillBots(4)
    room.start()
    const feed = onlooker(room)
    const started = performance.now()
    let ticks = 0
    for (; ticks < 60 * 90 && room.sim.view().phase.tag !== "Over"; ticks++) room.step()
    const ms = (performance.now() - started) / ticks
    const cuts = feed.filter((e) => e.t === "kill" && e.w === "motosee").length
    console.log(`motosee ${mode}`, { msPerTick: ms.toFixed(2), cuts, ticks })
    expect(cuts).toBeGreaterThan(0)
    expect(ms).toBeLessThan(8)
  }, 120000)
}
