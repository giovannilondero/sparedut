/**
 * Raccolte: frico (salute), gubane (corazza), sgnape (velocità), munizions, lanciafrico.
 */
import { PICKUPS, type PickupKind } from "../../map.ts"
import { WEAPON_IDS, WEAPONS } from "../../weapons.ts"
import { MAX_ARMOR, MAX_HP, SGNAPE_TICKS } from "../rules.ts"
import { Arsenal, Game, Life, Match, Motion, Out, Pickups, Player, type ArsenalValue } from "../schema.ts"

export const RESPAWN_OF = {
  frico: 20 * 60,
  gubane: 30 * 60,
  sgnape: 40 * 60,
  munizions: 15 * 60,
  lanciafrico: 45 * 60
} as const satisfies Record<PickupKind, number>

const ammoFull = (a: ArsenalValue) => WEAPON_IDS.every((id) => !(id === a.primary || id === "mandi" || (id === "lanciafrico" && a.launcher)) || a.ammo[id].reserve >= WEAPONS[id].reserve)

export const CollectPickups = Game.System(
  "Sparedut/CollectPickups",
  {
    queries: {
      players: Game.Query({
        selection: { player: Game.Query.read(Player), motion: Game.Query.read(Motion), life: Game.Query.write(Life), arsenal: Game.Query.write(Arsenal) }
      })
    },
    resources: { pickups: Game.System.writeResource(Pickups) },
    events: { out: Game.System.writeEvent(Out) },
    machines: { match: Game.System.machine(Match) }
  },
  ({ queries, resources, events, machines }) => {
    if (machines.match.get()._tag === "Over") return
    const states = resources.pickups.get()
    const next = states.map((s) => (s._tag === "down" ? (s.ticks <= 1 ? { _tag: "up" as const } : { _tag: "down" as const, ticks: s.ticks - 1 }) : s))
    const players = queries.players.each()
    PICKUPS.forEach((spot, i) => {
      if (next[i]._tag !== "up") return
      for (const m of players) {
        const life = m.data.life.get()
        if (life._tag !== "Alive") continue
        const b = m.data.motion.get().body
        const dx = b.x - spot.at[0]
        const dz = b.z - spot.at[2]
        if (dx * dx + dz * dz > 1.5 * 1.5 || Math.abs(b.y - spot.at[1]) > 1.6) continue
        const a = m.data.arsenal.get()
        let used = true
        switch (spot.kind) {
          case "frico":
            if (life.hp >= MAX_HP) used = false
            else m.data.life.update({ state: "Alive", data: (l) => ({ hp: Math.min(MAX_HP, l.hp + 40), armor: l.armor, shield: l.shield }) })
            break
          case "gubane":
            if (life.armor >= MAX_ARMOR) used = false
            else m.data.life.update({ state: "Alive", data: (l) => ({ hp: l.hp, armor: Math.min(MAX_ARMOR, l.armor + 50), shield: l.shield }) })
            break
          case "sgnape":
            m.data.arsenal.set({ ...a, sgnape: SGNAPE_TICKS })
            break
          case "munizions": {
            if (ammoFull(a) && a.bombs >= 2) {
              used = false
              break
            }
            const ammo = { ...a.ammo }
            for (const id of WEAPON_IDS) ammo[id] = { mag: ammo[id].mag, reserve: Math.max(ammo[id].reserve, WEAPONS[id].reserve) }
            m.data.arsenal.set({ ...a, ammo, bombs: Math.max(a.bombs, 2) })
            break
          }
          case "lanciafrico":
            m.data.arsenal.set({
              ...a,
              launcher: true,
              current: "lanciafrico",
              action: { _tag: "switch", ticks: 20 },
              ammo: { ...a.ammo, lanciafrico: { mag: WEAPONS.lanciafrico.magazine, reserve: WEAPONS.lanciafrico.reserve } }
            })
            break
        }
        if (!used) continue
        next[i] = { _tag: "down", ticks: RESPAWN_OF[spot.kind] }
        events.out.emit({ t: "pick", s: m.data.player.get().session, k: spot.kind })
        break
      }
    })
    resources.pickups.set(next)
  }
)
