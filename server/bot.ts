/**
 * Bots: they read the world view and produce the same intent a person would.
 */
import type { BotLevel } from "../shared/folklore.ts"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import type { Team, V3 } from "../shared/map.ts"
import { eyeHeight } from "../shared/movement.ts"
import type { PhysicsWorld } from "../shared/physics.ts"
import { allied, outsideStorm, owned } from "../shared/sim/rules.ts"
import type { PlayerView, WorldView } from "../shared/sim/view.ts"
import { usesAmmo, WEAPONS, type WeaponId } from "../shared/weapons.ts"
import { nearestNode, route, type NavGraph } from "./nav.ts"

const SKILL = {
  zovin: { reaction: 34, aimSpeed: 3.2, error: 0.09, sight: 55, burst: 0.55 },
  pari: { reaction: 18, aimSpeed: 6, error: 0.045, sight: 80, burst: 0.8 },
  plevan: { reaction: 8, aimSpeed: 11, error: 0.018, sight: 140, burst: 1 }
} as const satisfies Record<BotLevel, unknown>

/**
 * A bot with the Motosee (held melee) runs at its enemy: within this distance it holds the trigger,
 * so that the rev is done by the time it is within reach. Starting value.
 */
const REV_FROM = 6
/** And it keeps the trigger held this many ticks after losing its enemy, so that a rev is not dropped between two targets. */
const REV_HOLD = 30

const wrap = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

export class BotBrain {
  private path: number[] = []
  private goal: V3 | null = null
  private target: string | null = null
  private seen = 0
  private yaw = 0
  private pitch = 0
  private strafe = 1
  private strafeTimer = 0
  private stuckTimer = 0
  private lastPos = { x: 0, z: 0 }
  private seq = 0
  private tick = 0
  private fireHeld = false
  private revHold = 0
  private role: "attack" | "defend"
  private roam = 0

  constructor(
    readonly id: string,
    public level: BotLevel,
    private readonly graph: NavGraph,
    private readonly physics: PhysicsWorld,
    seed: number
  ) {
    this.role = seed % 3 === 0 ? "defend" : "attack"
    this.roam = seed * 7
  }

  think(world: WorldView): PlayerInput {
    this.tick++
    const me = world.players.find((p) => p.session === this.id)
    if (!me || !me.alive) {
      this.path = []
      this.target = null
      this.seen = 0
      this.revHold = 0
      if (me) this.yaw = me.yaw
      return { ...IDLE_INPUT, seq: ++this.seq, yaw: this.yaw, weapon: me?.arsenal.nextPrimary ?? "cramar", view: world.tick }
    }
    const skill = SKILL[this.level]
    const eye = { x: me.body.x, y: me.body.y + eyeHeight(me.body), z: me.body.z }

    // Target: the nearest visible enemy.
    let enemy: PlayerView | null = null
    let enemyDist = Infinity
    for (const p of world.players) {
      if (!p.alive || p.session === me.session || allied(world.rules, me.team, p.team)) continue
      const d = Math.hypot(p.body.x - me.body.x, p.body.y - me.body.y, p.body.z - me.body.z)
      if (d > skill.sight || d >= enemyDist) continue
      const chest = { x: p.body.x, y: p.body.y + (p.body.crouch ? 0.8 : 1.2), z: p.body.z }
      if (!this.physics.lineOfSight(eye, chest)) continue
      enemy = p
      enemyDist = d
    }
    if (enemy && enemy.session === this.target) this.seen++
    else {
      this.target = enemy?.session ?? null
      this.seen = 0
    }

    // Weapon: the lanciafrico if there is one, the double-barrel only up close, otherwise the primary.
    // The Motosee needs no ammunition and is itself the weapon up close.
    const a = me.arsenal
    const cutter = WEAPONS[a.primary].mode === "held"
    let weapon: WeaponId = a.primary
    if (a.power === "lanciafrico" && a.ammo.lanciafrico.mag + a.ammo.lanciafrico.reserve > 0 && !(cutter && enemy && enemyDist < REV_FROM * 2)) weapon = "lanciafrico"
    else if (usesAmmo(a.primary) && a.ammo[a.primary].mag + a.ammo[a.primary].reserve === 0) weapon = owned(a, "mandi") ? "mandi" : "mescul"
    if (enemy && enemyDist < 2.2 && !cutter) weapon = "mescul"
    // With the Motosee in hand, the enemy in sight is where to go: by the graph, so that one on another floor is reached.
    const chasing = weapon !== "lanciafrico" && WEAPONS[weapon].mode === "held" && enemy !== null && this.seen >= skill.reaction

    let buttons = 0
    let mx = 0
    let mz = 0

    // With no enemies in range, the medic goes to heal the most battered teammate in sight.
    let patient: PlayerView | null = null
    if (a.primary === "miedi" && !(enemy && enemyDist < 25)) {
      let worst = 75
      for (const p of world.players) {
        if (!p.alive || p.session === me.session || !allied(world.rules, me.team, p.team) || p.hp >= worst) continue
        if (Math.hypot(p.body.x - me.body.x, p.body.z - me.body.z) > 30) continue
        if (!this.physics.lineOfSight(eye, { x: p.body.x, y: p.body.y + 1.2, z: p.body.z })) continue
        patient = p
        worst = p.hp
      }
      if (patient) weapon = "miedi"
    }
    // Mines at its feet, now and then, when nobody is around.
    if (!enemy && a.mines > 0 && this.level !== "zovin" && (this.tick + this.roam) % 900 === 0) buttons |= BUTTON.mine

    // Where to go.
    const goal: V3 = patient
      ? [patient.body.x, patient.body.y, patient.body.z]
      : chasing && enemy
        ? [enemy.body.x, enemy.body.y, enemy.body.z]
        : this.chooseGoal(world, me)
    const goalMoved = !this.goal || Math.hypot(this.goal[0] - goal[0], this.goal[2] - goal[2]) > 6
    if (goalMoved || this.path.length === 0) {
      this.goal = goal
      const from = nearestNode(this.graph, me.body)
      const to = nearestNode(this.graph, { x: goal[0], y: goal[1], z: goal[2] })
      this.path = from === to ? [] : route(this.graph, from, to)
    }
    let waypoint: V3 | null = this.path.length ? this.graph.points[this.path[0]] : goal
    if (waypoint && Math.hypot(waypoint[0] - me.body.x, waypoint[2] - me.body.z) < 1.2) {
      this.path.shift()
      waypoint = this.path.length ? this.graph.points[this.path[0]] : null
    }

    let wantYaw = this.yaw
    let wantPitch = 0
    if (waypoint) wantYaw = Math.atan2(-(waypoint[0] - me.body.x), -(waypoint[2] - me.body.z))

    if (enemy && this.seen >= skill.reaction) {
      // Aim (with some error that shrinks over time) and shoot.
      const aimY = enemy.body.y + (this.level === "plevan" ? 1.55 : 1.15) * (enemy.body.crouch ? 0.7 : 1)
      const dx = enemy.body.x - eye.x
      const dz = enemy.body.z - eye.z
      const dy = aimY - eye.y
      const settle = Math.max(0.25, 1 - (this.seen - skill.reaction) / 90)
      const wobble = Math.sin(this.tick * 0.13 + this.roam) * skill.error * settle
      const lead = WEAPONS[weapon].mode === "projectile" ? 0.25 : 0
      const aimYaw = Math.atan2(-(dx + enemy.body.vx * lead), -(dz + enemy.body.vz * lead)) + wobble
      const aimPitch = Math.atan2(dy, Math.hypot(dx, dz)) + wobble * 0.6 + (weapon === "lanciafrico" ? Math.min(0.25, enemyDist * 0.004) : 0)
      const yawErr = Math.abs(wrap(aimYaw - this.yaw))
      // Turn towards the enemy, then shoot once the aim is good.
      this.turn(aimYaw, aimPitch, skill.aimSpeed)
      const tolerance = 0.05 + 0.5 / Math.max(4, enemyDist)
      const def = WEAPONS[weapon]
      const inRange = def.mode === "projectile" ? enemyDist > 5 : def.mode === "melee" ? enemyDist < def.range : enemyDist < def.range * 0.9
      // Keep the Mulin spinning while the enemy is in sight; the Motosee revs as it closes in, and keeps cutting.
      if (def.spinTicks > 0 && enemyDist < (def.mode === "held" ? REV_FROM : def.range)) buttons |= BUTTON.fire
      if (yawErr < tolerance && inRange) {
        if (def.spinTicks > 0 || def.mode === "beam") buttons |= BUTTON.fire
        else if (def.mode === "auto") buttons |= Math.sin(this.tick * 0.05 + this.roam) < skill.burst * 2 - 1 ? BUTTON.fire : 0
        else {
          this.fireHeld = !this.fireHeld
          if (this.fireHeld) buttons |= BUTTON.fire
        }
      }
      if (weapon === "cjampanili" && enemyDist > 20) buttons |= BUTTON.aim
      // Dodge: strafe back and forth, a jump now and then.
      if (--this.strafeTimer <= 0) {
        this.strafe = -this.strafe
        this.strafeTimer = 25 + ((this.tick * 13 + this.roam) % 50)
      }
      mx = this.strafe
      const wantDist = weapon === "cjampanili" ? 30 : weapon === "doplete" || weapon === "mescul" || weapon === "miedi" ? 3 : 12
      mz = enemyDist > wantDist + 4 ? 1 : enemyDist < wantDist - 4 ? -0.6 : 0
      // Whoever has an objective runs and guns: the frico won't carry itself.
      if (waypoint && this.pushesObjective(world, me)) {
        const dx = waypoint[0] - me.body.x
        const dz = waypoint[2] - me.body.z
        const d = Math.hypot(dx, dz) || 1
        const fx = -Math.sin(this.yaw)
        const fz = -Math.cos(this.yaw)
        mz = (dx * fx + dz * fz) / d
        mx = (dx * -fz + dz * fx) / d + this.strafe * 0.3
      }
      if (chasing) {
        // No standing off: along the path to the enemy, then straight at them, with no strafing once close.
        const at = waypoint ?? [enemy.body.x, enemy.body.y, enemy.body.z]
        const dx = at[0] - me.body.x
        const dz = at[2] - me.body.z
        const d = Math.hypot(dx, dz) || 1
        const fx = -Math.sin(this.yaw)
        const fz = -Math.cos(this.yaw)
        // Close means on the same floor: one right overhead is reached by the stairs.
        const close = enemyDist < REV_FROM && Math.abs(enemy.body.y - me.body.y) < 1.5
        mz = close ? (enemyDist > def.range * 0.6 ? 1 : 0) : (dx * fx + dz * fz) / d
        mx = close ? 0 : (dx * -fz + dz * fx) / d
        // Far off it sprints; the sprint lowers the blade, so it stops in time to rev.
        if (enemyDist > REV_FROM * 2 && mz > 0.7) buttons |= BUTTON.sprint
      }
      // Move relative to the enemy: the path resumes afterwards.
      if (this.level !== "zovin" && (this.tick + this.roam) % 140 === 0) buttons |= BUTTON.jump
      if (a.bombs > 0 && enemyDist > 9 && enemyDist < 22 && this.level !== "zovin" && (this.tick + this.roam) % 420 === 0) buttons |= BUTTON.bomb
    } else if (patient) {
      // Aim at the teammate's chest and heal with the stream; stop when close.
      const dx = patient.body.x - eye.x
      const dz = patient.body.z - eye.z
      const d = Math.hypot(dx, dz)
      this.turn(Math.atan2(-dx, -dz), Math.atan2(patient.body.y + 1.1 - eye.y, d), 9)
      if (d < WEAPONS.miedi.range - 1.5 && a.current === "miedi") buttons |= BUTTON.fire
      mz = d > 4 ? 1 : 0
    } else {
      if (enemy) wantYaw = Math.atan2(-(enemy.body.x - me.body.x), -(enemy.body.z - me.body.z))
      this.turn(wantYaw, wantPitch, 7)
      if (waypoint) {
        mz = 1
        if (Math.abs(wrap(wantYaw - this.yaw)) > 1.2) mz = 0.2
        if (!enemy && this.path.length > 2 && me.arsenal.current !== "cjampanili" && me.arsenal.current !== "mulin") buttons |= BUTTON.sprint
      }
      // Reload while idle.
      const ammo = a.ammo[a.current]
      if (WEAPONS[a.current].magazine > 0 && ammo.mag < WEAPONS[a.current].magazine * 0.5 && ammo.reserve > 0) buttons |= BUTTON.reload
    }

    // The Motosee: a rev begun is held through, even between one enemy and the next.
    if (WEAPONS[weapon].mode === "held") {
      if (buttons & BUTTON.fire) this.revHold = REV_HOLD
      else if (this.revHold > 0) {
        this.revHold--
        buttons = (buttons | BUTTON.fire) & ~BUTTON.sprint
      }
    } else this.revHold = 0

    // Stuck? Jump and recompute.
    const moved = Math.hypot(me.body.x - this.lastPos.x, me.body.z - this.lastPos.z)
    if (mz > 0.5 && moved < 0.02) this.stuckTimer++
    else this.stuckTimer = Math.max(0, this.stuckTimer - 2)
    this.lastPos = { x: me.body.x, z: me.body.z }
    if (this.stuckTimer > 40) {
      buttons |= BUTTON.jump
      mx = this.strafe
      if (this.stuckTimer > 90) {
        this.path = []
        this.stuckTimer = 0
        this.roam += 17
      }
    }

    return { seq: ++this.seq, mx, mz, yaw: this.yaw, pitch: this.pitch, buttons, weapon, view: world.tick }
  }

  private turn(yaw: number, pitch: number, speed: number) {
    const k = Math.min(1, speed / 60)
    this.yaw = wrap(this.yaw + wrap(yaw - this.yaw) * Math.max(k, 0.06))
    this.pitch += (pitch - this.pitch) * Math.max(k, 0.06)
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch))
  }

  private pushesObjective(world: WorldView, me: PlayerView) {
    const mode = world.rules.mode
    if (mode === "frico") {
      const enemyTeam: Team = me.team === "benandanti" ? "malandanti" : "benandanti"
      const theirs = world.flags[enemyTeam]
      return (theirs._tag === "carried" && theirs.by === me.session) || this.role === "attack"
    }
    const { hill } = this.physics.map
    if (mode === "culine") return Math.hypot(me.body.x - hill.at[0], me.body.z - hill.at[2]) > hill.radius * 0.6
    if (mode === "cjar" && world.cart) return Math.hypot(me.body.x - world.cart.at[0], me.body.z - world.cart.at[2]) > 2.5
    if (mode === "tampieste" && world.storm) return outsideStorm(world.storm, me.body)
    return false
  }

  private chooseGoal(world: WorldView, me: PlayerView): V3 {
    const team: Team = me.team
    const enemyTeam: Team = team === "benandanti" ? "malandanti" : "benandanti"
    const mode = world.rules.mode
    const { flagBases: FLAG_BASES, hill: HILL, pickups: PICKUPS } = this.physics.map
    // Low health: a nearby frico.
    if (me.hp < 45) {
      const frico = PICKUPS.map((p, i) => ({ p, i })).filter(({ p, i }) => p.kind === "frico" && world.pickups[i] === "up")
      const near = frico.sort((a, b) => dist2(a.p.at, me) - dist2(b.p.at, me))[0]
      if (near && dist2(near.p.at, me) < 40 * 40) return near.p.at
    }
    if (mode === "frico") {
      const mine = world.flags[team]
      const theirs = world.flags[enemyTeam]
      if (theirs._tag === "carried" && theirs.by === me.session) return FLAG_BASES[team]
      if (mine._tag === "carried") {
        const carrier = world.players.find((p) => p.session === mine.by)
        if (carrier) return [carrier.body.x, carrier.body.y, carrier.body.z]
      }
      if (mine._tag === "dropped") return [mine.x, mine.y, mine.z]
      if (this.role === "defend") return FLAG_BASES[team]
      if (theirs._tag === "dropped") return [theirs.x, theirs.y, theirs.z]
      return FLAG_BASES[enemyTeam]
    }
    if (mode === "culine") return HILL.at
    // The cjar: the Benandanti push it, the Malandanti stand in front of it.
    if (mode === "cjar" && world.cart) {
      const [x, y, z] = world.cart.at
      const ahead = team === "malandanti" ? 3 : -1.5
      return [x - Math.sin(world.cart.yaw) * ahead + ((this.roam % 5) - 2) * 0.6, y, z - Math.cos(world.cart.yaw) * ahead]
    }
    // The storm: whoever is outside heads back in, towards the centre.
    if (mode === "tampieste" && world.storm && Math.hypot(me.body.x - world.storm.x, me.body.z - world.storm.z) > world.storm.radius * 0.8) {
      return [world.storm.x, me.body.y, world.storm.z]
    }
    // Bataie: towards the nearest enemy, or roaming the map.
    const enemies = world.players.filter((p) => p.alive && p.session !== me.session && !allied(world.rules, team, p.team))
    if (enemies.length) {
      const pick = enemies[Math.abs(this.roam) % enemies.length]
      // Switch prey now and then.
      if (this.tick % 600 === 0) this.roam++
      return [pick.body.x, pick.body.y, pick.body.z]
    }
    return this.graph.points[Math.abs(this.roam) % this.graph.points.length]
  }
}

const dist2 = (a: V3, b: PlayerView) => (a[0] - b.body.x) ** 2 + (a[2] - b.body.z) ** 2
