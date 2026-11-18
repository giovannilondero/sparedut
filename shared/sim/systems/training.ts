/**
 * The training's progress: the trainee performs the current step, the step completes, the station
 * completes, the next station's setup is applied. Steps say what completes them
 * (`shared/training/`); this system only feeds them what the trainee did this tick.
 *
 * It runs last, after every system that publishes game events, so a step sees the whole tick.
 * It is not gated on the `Training` machine: it reads `Out`, and a reader that never ran would
 * keep a regular room's events waiting for it.
 */
import { MAPS } from "../../maps/index.ts"
import { SAGRE_STATIONS } from "../../maps/sagre.ts"
import { STATION_IDS, STATIONS, stepRule, stepsOf, TRAINING } from "../../training/index.ts"
import type { Seen, StepRule } from "../../training/station.ts"
import { hasControl } from "../../training/controls.ts"
import { RAIBL_MINE, SGNAPE_BOMB, WEAPON_IDS } from "../../weapons.ts"
import { freshArsenal, freshDoors, FRESH_CART, FRESH_FLAGS, FRESH_HILL, hpFor, maxHp, stormOnCourse } from "../rules.ts"
import {
  Arsenal,
  Cart,
  Controls,
  Doors,
  Flags,
  Game,
  GoToStation,
  Hill,
  Life,
  Motion,
  Objective,
  Out,
  Pickups,
  Player,
  Post,
  ReportInterface,
  Score,
  StepUnavailable,
  StormCourse,
  Tick,
  Training,
  Turrets,
  type ArrivalPlace,
  type ArsenalValue
} from "../schema.ts"

/** Where the trainee is after a station completes: at the next station's first step, or done. */
type Next = { readonly _tag: "Step"; readonly station: number; readonly step: number; readonly count: number; readonly mark: number; readonly unlocked: number; readonly completed: boolean } | { readonly _tag: "Complete" }

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
          post: Game.Query.optional(Post),
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
      doors: Game.System.writeResource(Doors),
      score: Game.System.readResource(Score),
      flags: Game.System.writeResource(Flags),
      hill: Game.System.writeResource(Hill),
      cart: Game.System.writeResource(Cart),
      stormCourse: Game.System.writeResource(StormCourse),
      turrets: Game.System.writeResource(Turrets)
    },
    events: {
      happened: Game.System.readEvent(Out),
      out: Game.System.writeEvent(Out),
      reports: Game.System.readEvent(ReportInterface),
      goTo: Game.System.readEvent(GoToStation),
      unavailable: Game.System.readEvent(StepUnavailable)
    },
    machines: { training: Game.System.updateMachine(Training) },
    nextMachines: { training: Game.System.nextState(Training) }
  },
  ({ queries, resources, events, machines, nextMachines }) => {
    // Reports are read every tick, so that one never waits for a later tick: outside a training's step they are ignored.
    const reports = events.reports.all()
    const unavailable = events.unavailable.all()
    const goes = events.goTo.all()
    const state = machines.training.get()
    if (state._tag === "Off") return
    const { data } = queries.players

    // Going to a station (the current one: restarting it) or starting over: the next tick arrives
    // there, placed at its start. A locked station is refused. The last intent of the tick wins.
    let go: (typeof goes)[number]["to"] | null = null
    for (const g of goes) if (queries.players.each().some((m) => !data.player.get(m).bot && data.player.get(m).session === g.session)) go = g.to
    if (go !== null) {
      const unlocked = state._tag === "Complete" ? STATION_IDS.length : state.unlocked
      const completed = state._tag === "Complete" || state.completed
      const to =
        go._tag === "startOver" ? { station: 0, unlocked: 1, completed: false, place: "keepingLook" as const }
        : go.station >= 0 && go.station < unlocked ? { station: go.station, unlocked, completed, place: "keepingLook" as const }
        : null
      if (to !== null) {
        if (state._tag === "Arriving") machines.training.update({ state: "Arriving", data: () => to })
        else if (state._tag === "Step") nextMachines.training.transition({ from: "Step", to: "Arriving", data: to })
        else nextMachines.training.transition({ from: "Complete", to: "Arriving", data: to })
        return
      }
    }
    if (state._tag === "Complete") return
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

    /** The storm's safe circle while it is the objective in force on a course of the training's (#49). */
    const storm = () => {
      const course = resources.stormCourse.get()
      return resources.objective.get() === "storm" && course ? stormOnCourse(course, resources.tick.get()) : null
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
        reported: rule ? reported(rule.report) : 0,
        score: resources.score.get(),
        storm: storm()
      }
    }

    // A step's `given`, applied on the tick the step becomes current: a primary and the weapon in hand
    // with ammunition refilled (#44, the stalls), the objective in force (#48).
    const give = (rule: StepRule) => {
      const given = rule.given
      if (given === undefined) return
      if (given.primary !== undefined || given.hold !== undefined) {
        const now = data.arsenal.get(trainee)
        const primary = given.primary ?? now.primary
        const fresh = freshArsenal(primary)
        data.arsenal.set(trainee, { ...fresh, nextPrimary: now.nextPrimary, power: now.power, current: given.hold ?? (given.primary ? primary : now.current) })
        const life = data.life.get(trainee)
        if (life._tag === "Alive") data.life.update(trainee, { state: "Alive", data: (l) => ({ hp: hpFor(primary, l.hp), armor: l.armor, shield: l.shield }) })
      }
      if (given.pickups) {
        const back = given.pickups
        resources.pickups.set(resources.pickups.get().map((p, i) => (back.includes(i) ? { _tag: "up" as const } : p)))
      }
      const objective = given.objective
      if (objective === undefined) return
      resources.objective.set(objective)
      if (objective === "frico") resources.flags.set(FRESH_FLAGS)
      if (objective === "placute") resources.hill.set(FRESH_HILL)
      if (objective === "cjar") resources.cart.set(FRESH_CART)
      // #49: the storm starts closing on its course now.
      const course = objective === "storm" ? given.storm : undefined
      resources.stormCourse.set(course ? { x: course.at[0], z: course.at[2], from: course.from, to: course.to, start: resources.tick.get(), ticks: course.ticks } : null)
    }

    /** Arrives at station `from` (and past any station with no steps): its setup applied, its first step begun. */
    const arrive = (from: number, unlocked: number, completed: boolean, place: ArrivalPlace): Next => {
      let index = from
      let open = unlocked
      while (index < STATION_IDS.length && stepsOf(STATION_IDS[index]).length === 0) {
        events.out.emit({ t: "training", a: "station", station: STATION_IDS[index] })
        index++
        open = Math.max(open, index + 1)
      }
      if (index >= STATION_IDS.length) {
        // A completed training teaches no objective: none is left in force (#48).
        resources.objective.set("none")
        resources.stormCourse.set(null)
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
      // A station that fixes the trainee's health wins over the class; otherwise the class's is full.
      data.life.update(trainee, { state: "Alive", data: (alive) => ({ hp: setup.hp ?? maxHp(given.primary), armor: setup.armor ?? 0, shield: alive.shield }) })
      if (place !== "walked") {
        // Placed away from a turret it was manning (restarting the turret's station): off it.
        if (resources.turrets.get().some((t) => t.gunner === session)) resources.turrets.set(resources.turrets.get().map((t) => (t.gunner === session ? { ...t, gunner: null } : t)))
        const start = SAGRE_STATIONS[id].start
        const motion = data.motion.get(trainee)
        data.motion.set(trainee, {
          body: { x: start.at[0], y: start.at[1], z: start.at[2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false },
          yaw: place === "facingStart" ? start.yaw : motion.yaw,
          pitch: place === "facingStart" ? 0 : motion.pitch
        })
      }
      // Placed at a station (restarting it included), its bots are back at their posts with their
      // starting health: the scene is set again. A dead one comes back at its post next tick. Walking
      // in, the bots there are still the last station's, and the host replaces them.
      if (place !== "walked") for (const m of queries.players.each()) {
        const post = data.post?.get(m)
        if (post === undefined) continue
        if (data.life.get(m)._tag === "Dead") {
          data.life.update(m, { state: "Dead", data: (dead) => ({ respawn: 1, killer: dead.killer }) })
          continue
        }
        data.life.update(m, { state: "Alive", data: (alive) => ({ hp: post.hp, armor: 0, shield: alive.shield }) })
        data.motion.set(m, { body: { x: post.at[0], y: post.at[1], z: post.at[2], vx: 0, vy: 0, vz: 0, grounded: true, crouch: false }, yaw: post.yaw, pitch: 0 })
      }
      const first = stepRule(id, stepsOf(id)[0])
      give(first)
      const begun = first.begin(seen(null))
      return { _tag: "Step", station: index, step: 0, count: begun.count, mark: begun.mark, unlocked: Math.min(STATION_IDS.length, open), completed }
    }

    // The doors (station 3's shed): whole whenever the trainee arrives at a station, and standing
    // again at once when broken by anything that does not complete the current step, so a step
    // that asks for one broken never lacks it.
    const standDoors = (all: boolean) => {
      const hp = resources.doors.get()
      if (hp.some((left) => all || left <= 0)) resources.doors.set(freshDoors(MAPS[TRAINING.map]).map((full, i) => (all || (hp[i] ?? 0) <= 0 ? full : hp[i])))
    }

    if (state._tag === "Arriving") {
      standDoors(true)
      const next = arrive(state.station, state.unlocked, state.completed, state.place)
      if (next._tag === "Complete") nextMachines.training.transition({ from: "Arriving", to: "Complete" })
      else nextMachines.training.transition({ from: "Arriving", to: "Step", data: { station: next.station, step: next.step, count: next.count, mark: next.mark, unlocked: next.unlocked, completed: next.completed } })
      return
    }

    const id = STATION_IDS[state.station]
    const steps = stepsOf(id)
    const rule = stepRule(id, steps[state.step])

    // A station that restocks gives bombs and mines back as soon as the last one is used.
    if (STATIONS[id].setup.restock) {
      const a = data.arsenal.get(trainee)
      if (a.bombs === 0 || a.mines === 0) data.arsenal.set(trainee, { ...a, bombs: a.bombs || SGNAPE_BOMB.perLife, mines: a.mines || RAIBL_MINE.perLife })
    }

    const now = rule.advance(seen(rule), { count: state.count, mark: state.mark })
    // A step the client's active device has no control for completes itself (#50): only the
    // trainee's word for this very step counts, and only if the step table agrees.
    const skipped = unavailable.some((u) => u.session === session && u.station === id && u.step === steps[state.step] && !hasControl(rule.control, u.device))
    const count = skipped ? rule.target : Math.min(rule.target, now.count)
    let next: Next
    if (count < rule.target) {
      standDoors(false)
      next = { _tag: "Step", station: state.station, step: state.step, count, mark: now.mark, unlocked: state.unlocked, completed: state.completed }
    } else {
      events.out.emit({ t: "training", a: "step", station: id, step: steps[state.step] })
      if (state.step + 1 < steps.length) {
        const following = stepRule(id, steps[state.step + 1])
        give(following)
        const begun = following.begin(seen(null))
        next = { _tag: "Step", station: state.station, step: state.step + 1, count: begun.count, mark: begun.mark, unlocked: state.unlocked, completed: state.completed }
      } else {
        events.out.emit({ t: "training", a: "station", station: id })
        next = arrive(state.station + 1, Math.max(state.unlocked, state.station + 2), state.completed, "walked")
      }
    }
    if (next._tag === "Complete") nextMachines.training.transition({ from: "Step", to: "Complete" })
    else {
      const { station, step, count: done, mark, unlocked, completed } = next
      machines.training.update({ state: "Step", data: () => ({ station, step, count: done, mark, unlocked, completed }) })
    }
  }
)
