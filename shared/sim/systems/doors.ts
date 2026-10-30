/**
 * Le porte da sfondare: spari, pedate col mescul ed esplosioni le scheggiano
 * (`DoorHit`), a salute zero cedono. Il mondo fisico segue lo stato salvato a ogni
 * tick: dopo un ripristino o una partita nuova le porte tornano da sé.
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
