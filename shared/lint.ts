/** Ingresso per `ritmo-devtools lint`: il runtime della stanza e il suo schedule. */
import { HostClock } from "@typeonce/ritmo"
import { ChangePrimary, ChangeTeam, Game, InputArrived, Join, Leave, Out, StartMatch } from "./sim/schema.ts"
import { makeRuntime, simulate } from "./sim/index.ts"

/** L'host legge gli eventi `Out` (con l'inspector `ReadOutbox`) e li gira ai client. */
const HostReadsOut = Game.System("Sparedut/HostReadsOut", { events: { out: Game.System.readEvent(Out) } }, ({ events }) => {
  events.out.all()
})

export const lintTarget = async () => {
  // La fisica è un servizio dell'host: si carica qui dentro.
  const { createPhysicsWorld, initPhysics } = await import("./physics.ts")
  await initPhysics()
  const runtime = makeRuntime({ mode: "bataie", minutes: 10, seed: 1, physics: createPhysicsWorld() }, { hostClock: HostClock.test() })
  return {
    runtime,
    schedules: { simulate },
    describe: { host: Game.Schedule(HostReadsOut) },
    hostEvents: [Join, Leave, InputArrived, ChangeTeam, ChangePrimary, StartMatch]
  }
}
