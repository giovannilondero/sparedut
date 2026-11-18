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
import type { Seen, StepRule } from "../../training/station.ts"
import { WEAPON_IDS } from "../../weapons.ts"
import { freshArsenal, freshDoors, MAX_HP } from "../rules.ts"
import { Arsenal, Controls, Doors, Game, Life, Motion, Objective, Out, Pickups, Player, ReportInterface, Tick, Training, type ArsenalValue } from "../schema.ts"

/** Where the trainee is after a station completes: at the next station's first step, or done. */
type Next = { readonly _tag: "Step"; readonly station: number; readonly step: number; readonly count: number; readonly mark: number; readonly unlocked: number } | { readonly _tag: "Complete" }

/** An arsenal with only what is in each magazine: no reserve, no bombs or mines (a station's `ammo: "loaded"`). */
const onlyLoaded = (a: ArsenalValue): ArsenalValue => {
  const ammo = { ...a.ammo }
  for (const id of WEAPON_IDS) ammo[id] = { mag: ammo[id].mag, reserve: 0 }
  return { ...a, ammo, bombs: 0, mines: 0 }
}

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
    resources: {
      tick: Game.System.readResource(Tick),
      objective: Game.System.writeResource(Objective),
      pickups: Game.System.writeResource(Pickups),
      doors: Game.System.writeResource(Doors)
    },
    events: { happened: Game.System.readEvent(Out), out: Game.System.writeEvent(Out), reports: Game.System.readEvent(ReportInterface) },
    machines: { training: Game.System.updateMachine(Training) },
    nextMachines: { training: Game.System.nextState(Training) }
  },
  ({ queries, resources, events, machines, nextMachines }) => {
    // Reports are read every tick, so that one never waits for a later tick: outside a training's step they are ignored.
    const reports = events.reports.all()
    const state = machines.training.get()
    if (state._tag === "Off" || state._tag === "Complete") return
    const { data } = queries.players
    const trainee = queries.players.each().find((m) => !data.player.get(m).bot && data.life.get(m)._tag === "Alive")
    if (trainee === undefined) return
    const happened = events.happened.all()
    const session = data.player.get(trainee).session

    /** The trainee's reports of `action` this tick: an interface step accepts only its own (`StepRule.report`). */
    const reported = (action: StepRule["report"]) => {
      if (action === undefined) return 0
      let n = 0
      for (const r of reports) if (r.session === session && r.action === action) n++
      return n
    }

    /** What the current step sees; `null` while a step begins, when no report is its own yet. */
    const seen = (rule: StepRule | null): Seen => {
      const life = data.life.get(trainee)
      const motion = data.motion.get(trainee)
      return {
        tick: resources.tick.get(),
        me: {
          session,
          body: motion.body,
          yaw: motion.yaw,
          pitch: motion.pitch,
          hp: life._tag === "Alive" ? life.hp : 0,
          armor: life._tag === "Alive" ? life.armor : 0,
          controls: data.controls.get(trainee),
          arsenal: data.arsenal.get(trainee)
        },
        events: happened,
        reported: rule ? reported(rule.report) : 0
      }
    }

    /** What a step gives as it begins (`StepRule.given`): a primary and the weapon in hand, ammunition refilled. */
    const give = (rule: StepRule) => {
      const given = rule.given
      if (given?.primary === undefined && given?.hold === undefined) return
      const now = data.arsenal.get(trainee)
      const primary = given.primary ?? now.primary
      const fresh = freshArsenal(primary)
      data.arsenal.set(trainee, { ...fresh, nextPrimary: now.nextPrimary, launcher: now.launcher, current: given.hold ?? (given.primary ? primary : now.current) })
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
      const own = data.arsenal.get(trainee).nextPrimary
      // A station's primary (the medic's Cassele) is lent: the trainee's own stays the next one.
      const fresh = setup.primary ? { ...freshArsenal(setup.primary), nextPrimary: own } : freshArsenal(own)
      const given = setup.ammo === "loaded" ? onlyLoaded(fresh) : fresh
      data.arsenal.set(trainee, setup.hold ? { ...given, current: setup.hold } : given)
      if (setup.pickups) {
        const back = setup.pickups
        resources.pickups.set(resources.pickups.get().map((p, i) => (back.includes(i) ? { _tag: "up" as const } : p)))
      }
      data.life.update(trainee, { state: "Alive", data: (alive) => ({ hp: setup.hp ?? MAX_HP, armor: setup.armor ?? 0, shield: alive.shield }) })
      if (place) {
        const start = SAGRE_STATIONS[index].start
        data.motion.set(trainee, {
          body: { x: start.at[0], y: start.at[1], z: start.at[2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false },
          yaw: start.yaw,
          pitch: 0
        })
      }
      const first = stepRule(id, stepsOf(id)[0])
      give(first)
      const begun = first.begin(seen(null))
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
    const now = rule.advance(seen(rule), { count: state.count, mark: state.mark })
    const count = Math.min(rule.target, now.count)
    let next: Next
    if (count < rule.target) {
      standDoors(false)
      next = { _tag: "Step", station: state.station, step: state.step, count, mark: now.mark, unlocked: state.unlocked }
    } else {
      events.out.emit({ t: "training", a: "step", station: id, step: steps[state.step] })
      if (state.step + 1 < steps.length) {
        const following = stepRule(id, steps[state.step + 1])
        give(following)
        const begun = following.begin(seen(null))
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
