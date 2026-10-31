/**
 * Breakable doors: shots, mescul kicks and explosions splinter them
 * (`DoorHit`), and at zero health they give way. The physics world follows the saved state every
 * tick: after a restore or a new match the doors come back by themselves.
 */
import { DoorHit, Doors, Game, Out, Physics } from "../schema.ts"

export const BreakDoors = Game.System(
  "Sparedut/BreakDoors",
  {
    resources: { doors: Game.System.writeResource(Doors) },
    services: { physics: Game.System.service(Physics) },
    events: { hits: Game.System.thisTick(Game.System.readEvent(DoorHit)), out: Game.System.writeEvent(Out) }
  },
  ({ resources, services, events }) => {
    const hits = events.hits.all()
    if (hits.length > 0) {
      const hp = [...resources.doors.get()]
      for (const h of hits) {
        const left = hp[h.door]
        if (left === undefined || left <= 0) continue
        hp[h.door] = Math.max(0, left - h.amount)
        events.out.emit({ t: "door", i: h.door, s: h.by, a: hp[h.door] === 0 ? "broken" : "hit" })
      }
      resources.doors.set(hp)
    }
    services.physics.setDoors(resources.doors.get().map((hp) => hp > 0))
  }
)
