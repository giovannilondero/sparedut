/**
 * The training's progress: the trainee performs the current step, the step completes, the station
 * completes, the next station's setup is applied. Steps say what completes them
 * (`shared/training/`); this system only feeds them what the trainee did this tick.
 *
 * It runs last, after every system that publishes game events, so a step sees the whole tick.
 * It is not gated on the `Training` machine: it reads `Out`, and a reader that never ran would
 * keep a regular room's events waiting for it.
 */
import { SAGRE, SAGRE_STATIONS } from "../../maps/sagre.ts"
import { STATION_IDS, STATIONS, stepRule, stepsOf } from "../../training/index.ts"
import type { Seen } from "../../training/station.ts"
import { freshArsenal, freshDoors, MAX_HP } from "../rules.ts"
import { Arsenal, Controls, Doors, Game, Life, Motion, Objective, Out, Player, Tick, Training } from "../schema.ts"

/** Where the trainee is after a station completes: at the next station's first step, or done. */
type Next = { readonly _tag: "Step"; readonly station: number; readonly step: number; readonly count: number; readonly mark: number; readonly unlocked: number } | { readonly _tag: "Complete" }

export const PlayTraining = Game.System(
  "Sparedut/PlayTraining",
  {
    queries: {
      players: Game.Query({
        selection: {
          player: Game.Query.read(Player),
          controls: Game.Query.read(Controls),
          motion: Game.Query.write(Motion),
          life: Game.Query.write(Life),
          arsenal: Game.Query.write(Arsenal)
        }
      })
    },
    resources: { tick: Game.System.readResource(Tick), objective: Game.System.writeResource(Objective), doors: Game.System.writeResource(Doors) },
    events: { happened: Game.System.readEvent(Out), out: Game.System.writeEvent(Out) },
    machines: { training: Game.System.updateMachine(Training) },
    nextMachines: { training: Game.System.nextState(Training) }
  },
  ({ queries, resources, events, machines, nextMachines }) => {
    const state = machines.training.get()
    if (state._tag === "Off" || state._tag === "Complete") return
    const { data } = queries.players
    const trainee = queries.players.each().find((m) => !data.player.get(m).bot && data.life.get(m)._tag === "Alive")
    if (trainee === undefined) return
    const happened = events.happened.all()

    const seen = (): Seen => {
      const life = data.life.get(trainee)
      const motion = data.motion.get(trainee)
      return {
        tick: resources.tick.get(),
        me: {
          session: data.player.get(trainee).session,
          body: motion.body,
          yaw: motion.yaw,
          pitch: motion.pitch,
          hp: life._tag === "Alive" ? life.hp : 0,
          armor: life._tag === "Alive" ? life.armor : 0,
          controls: data.controls.get(trainee),
          arsenal: data.arsenal.get(trainee)
        },
        events: happened
      }
    }

    /** Arrives at station `from` (and past any station with no steps): its setup applied, its first step begun. */
    const arrive = (from: number, unlocked: number, place: boolean): Next => {
      let index = from
      let open = unlocked
      while (index < STATION_IDS.length && stepsOf(STATION_IDS[index]).length === 0) {
        events.out.emit({ t: "training", a: "station", station: STATION_IDS[index] })
        index++
        open = Math.max(open, index + 1)
      }
      if (index >= STATION_IDS.length) {
        events.out.emit({ t: "training", a: "complete" })
        return { _tag: "Complete" }
      }
      const id = STATION_IDS[index]
      const setup = STATIONS[id].setup
      resources.objective.set(setup.objective)
      const fresh = freshArsenal(data.arsenal.get(trainee).nextPrimary)
      data.arsenal.set(trainee, setup.hold ? { ...fresh, current: setup.hold } : fresh)
      data.life.update(trainee, { state: "Alive", data: (alive) => ({ hp: setup.hp ?? MAX_HP, armor: setup.armor ?? 0, shield: alive.shield }) })
      if (place) {
        const start = SAGRE_STATIONS[index].start
        data.motion.set(trainee, {
          body: { x: start.at[0], y: start.at[1], z: start.at[2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false },
          yaw: start.yaw,
          pitch: 0
        })
      }
      const begun = stepRule(id, stepsOf(id)[0]).begin(seen())
      return { _tag: "Step", station: index, step: 0, count: begun.count, mark: begun.mark, unlocked: Math.min(STATION_IDS.length, open) }
    }

    // The doors (station 3's shed): whole whenever the trainee arrives at a station, and standing
    // again at once when broken by anything that does not complete the current step, so a step
    // that asks for one broken never lacks it.
    const standDoors = (all: boolean) => {
      const hp = resources.doors.get()
      if (hp.some((left) => all || left <= 0)) resources.doors.set(freshDoors(SAGRE).map((full, i) => (all || (hp[i] ?? 0) <= 0 ? full : hp[i])))
    }

    if (state._tag === "Arriving") {
      standDoors(true)
      const next = arrive(state.station, state.unlocked, state.place)
      if (next._tag === "Complete") nextMachines.training.transition({ from: "Arriving", to: "Complete" })
      else nextMachines.training.transition({ from: "Arriving", to: "Step", data: { station: next.station, step: next.step, count: next.count, mark: next.mark, unlocked: next.unlocked } })
      return
    }

    const id = STATION_IDS[state.station]
    const steps = stepsOf(id)
    const rule = stepRule(id, steps[state.step])
    const now = rule.advance(seen(), { count: state.count, mark: state.mark })
    const count = Math.min(rule.target, now.count)
    let next: Next
    if (count < rule.target) {
      standDoors(false)
      next = { _tag: "Step", station: state.station, step: state.step, count, mark: now.mark, unlocked: state.unlocked }
    } else {
      events.out.emit({ t: "training", a: "step", station: id, step: steps[state.step] })
      if (state.step + 1 < steps.length) {
        const begun = stepRule(id, steps[state.step + 1]).begin(seen())
        next = { _tag: "Step", station: state.station, step: state.step + 1, count: begun.count, mark: begun.mark, unlocked: state.unlocked }
      } else {
        events.out.emit({ t: "training", a: "station", station: id })
        next = arrive(state.station + 1, Math.max(state.unlocked, state.station + 2), false)
      }
    }
    if (next._tag === "Complete") nextMachines.training.transition({ from: "Step", to: "Complete" })
    else {
      const { station, step, count: done, mark, unlocked } = next
      machines.training.update({ state: "Step", data: () => ({ station, step, count: done, mark, unlocked }) })
    }
  }
)
