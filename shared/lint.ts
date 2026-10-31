/** Entry point for `ritmo-devtools lint`: the room's runtime and its schedule. */
import { HostClock } from "@typeonce/ritmo"
import { ChangePrimary, ChangeTeam, Game, InputArrived, Join, Leave, Out, StartMatch } from "./sim/schema.ts"
import { makeRuntime, simulate } from "./sim/index.ts"

/** The host reads `Out` events (with the `ReadOutbox` inspector) and forwards them to clients. */
const HostReadsOut = Game.System("Sparedut/HostReadsOut", { events: { out: Game.System.readEvent(Out) } }, ({ events }) => {
  events.out.all()
})

export const lintTarget = async () => {
  // Physics is a host service: it's loaded in here.
  const { createPhysicsWorld, initPhysics } = await import("./physics.ts")
  const { GLEMONE } = await import("./maps/glemone.ts")
  await initPhysics()
  const runtime = makeRuntime({ mode: "bataie", minutes: 10, seed: 1, physics: createPhysicsWorld(GLEMONE) }, { hostClock: HostClock.test() })
  return {
    runtime,
    schedules: { simulate },
    describe: { host: Game.Schedule(HostReadsOut) },
    hostEvents: [Join, Leave, InputArrived, ChangeTeam, ChangePrimary, StartMatch]
  }
}
