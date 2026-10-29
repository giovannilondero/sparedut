/**
 * I bot: leggono la vista del mondo e producono lo stesso intento di una persona.
 */
import type { BotLevel } from "../shared/folklore.ts"
import { BUTTON, IDLE_INPUT, type PlayerInput } from "../shared/input.ts"
import { FLAG_BASES, HILL, PICKUPS, type Team, type V3 } from "../shared/map.ts"
import { eyeHeight } from "../shared/movement.ts"
import type { PhysicsWorld } from "../shared/physics.ts"
import type { PlayerView, WorldView } from "../shared/sim/view.ts"
import { WEAPONS, type WeaponId } from "../shared/weapons.ts"
import { nearestNode, route, type NavGraph } from "./nav.ts"

const SKILL = {
  zovin: { reaction: 34, aimSpeed: 3.2, error: 0.09, sight: 55, burst: 0.55 },
  pari: { reaction: 18, aimSpeed: 6, error: 0.045, sight: 80, burst: 0.8 },
  plevan: { reaction: 8, aimSpeed: 11, error: 0.018, sight: 140, burst: 1 }
} as const satisfies Record<BotLevel, unknown>

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
  private role: "attacca" | "difende"
  private roam = 0

  constructor(
    readonly id: string,
    public level: BotLevel,
    private readonly graph: NavGraph,
    private readonly physics: PhysicsWorld,
    seed: number
  ) {
    this.role = seed % 3 === 0 ? "difende" : "attacca"
    this.roam = seed * 7
  }

  think(world: WorldView): PlayerInput {
    this.tick++
    const me = world.players.find((p) => p.session === this.id)
    if (!me || !me.alive) {
      this.path = []
      this.target = null
      this.seen = 0
      if (me) this.yaw = me.yaw
      return { ...IDLE_INPUT, seq: ++this.seq, yaw: this.yaw, weapon: me?.arsenal.nextPrimary ?? "cramar", view: world.tick }
    }
    const skill = SKILL[this.level]
    const eye = { x: me.body.x, y: me.body.y + eyeHeight(me.body), z: me.body.z }

    // Bersaglio: il nemico visibile più vicino.
    let enemy: PlayerView | null = null
    let enemyDist = Infinity
    for (const p of world.players) {
      if (!p.alive || p.team === me.team) continue
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

    // Arma: il lanciafrico se c'è, la doppietta solo da vicino, altrimenti la principale.
    const a = me.arsenal
    let weapon: WeaponId = a.primary
    if (a.launcher && a.ammo.lanciafrico.mag + a.ammo.lanciafrico.reserve > 0) weapon = "lanciafrico"
    else if (a.ammo[a.primary].mag + a.ammo[a.primary].reserve === 0) weapon = "mandi"
    if (enemy && enemyDist < 2.2) weapon = "mescul"

    let buttons = 0
    let mx = 0
    let mz = 0

    // Dove andare.
    const goal = this.chooseGoal(world, me)
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
      // Mira (con un po' di errore che si riduce col tempo) e spara.
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
      // Girarsi verso il nemico, poi sparare quando la mira è buona.
      this.turn(aimYaw, aimPitch, skill.aimSpeed)
      const tolerance = 0.05 + 0.5 / Math.max(4, enemyDist)
      const def = WEAPONS[weapon]
      const inRange = def.mode === "projectile" ? enemyDist > 5 : def.mode === "melee" ? enemyDist < def.range : enemyDist < def.range * 0.9
      if (yawErr < tolerance && inRange) {
        if (def.mode === "auto") buttons |= Math.sin(this.tick * 0.05 + this.roam) < skill.burst * 2 - 1 ? BUTTON.fire : 0
        else {
          this.fireHeld = !this.fireHeld
          if (this.fireHeld) buttons |= BUTTON.fire
        }
      }
      if (weapon === "cjampanili" && enemyDist > 20) buttons |= BUTTON.aim
      // Schivare: strafe avanti e indietro, ogni tanto un salto.
      if (--this.strafeTimer <= 0) {
        this.strafe = -this.strafe
        this.strafeTimer = 25 + ((this.tick * 13 + this.roam) % 50)
      }
      mx = this.strafe
      const wantDist = weapon === "cjampanili" ? 30 : weapon === "doplete" || weapon === "mescul" ? 3 : 12
      mz = enemyDist > wantDist + 4 ? 1 : enemyDist < wantDist - 4 ? -0.6 : 0
      // Chi ha un obiettivo corre e spara: il frico non si porta da solo.
      if (waypoint && this.pushesObjective(world, me)) {
        const dx = waypoint[0] - me.body.x
        const dz = waypoint[2] - me.body.z
        const d = Math.hypot(dx, dz) || 1
        const fx = -Math.sin(this.yaw)
        const fz = -Math.cos(this.yaw)
        mz = (dx * fx + dz * fz) / d
        mx = (dx * -fz + dz * fx) / d + this.strafe * 0.3
      }
      // Muoversi in relazione al nemico: il percorso si riprende dopo.
      if (this.level !== "zovin" && (this.tick + this.roam) % 140 === 0) buttons |= BUTTON.jump
      if (a.bombs > 0 && enemyDist > 9 && enemyDist < 22 && this.level !== "zovin" && (this.tick + this.roam) % 420 === 0) buttons |= BUTTON.bomb
    } else {
      if (enemy) wantYaw = Math.atan2(-(enemy.body.x - me.body.x), -(enemy.body.z - me.body.z))
      this.turn(wantYaw, wantPitch, 7)
      if (waypoint) {
        mz = 1
        if (Math.abs(wrap(wantYaw - this.yaw)) > 1.2) mz = 0.2
        if (!enemy && this.path.length > 2 && me.arsenal.current !== "cjampanili") buttons |= BUTTON.sprint
      }
      // Ricarica a mani libere.
      const ammo = a.ammo[a.current]
      if (WEAPONS[a.current].magazine > 0 && ammo.mag < WEAPONS[a.current].magazine * 0.5 && ammo.reserve > 0) buttons |= BUTTON.reload
    }

    // Bloccato? Salta e ricalcola.
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
      return (theirs._tag === "carried" && theirs.by === me.session) || this.role === "attacca"
    }
    if (mode === "culine") return Math.hypot(me.body.x - HILL.at[0], me.body.z - HILL.at[2]) > HILL.radius * 0.6
    return false
  }

  private chooseGoal(world: WorldView, me: PlayerView): V3 {
    const team: Team = me.team
    const enemyTeam: Team = team === "benandanti" ? "malandanti" : "benandanti"
    const mode = world.rules.mode
    // Poca salute: un frico vicino.
    if (me.hp < 45) {
      const frico = PICKUPS.map((p, i) => ({ p, i })).filter(({ p, i }) => p.kind === "frico" && world.pickups[i])
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
      if (this.role === "difende") return FLAG_BASES[team]
      if (theirs._tag === "dropped") return [theirs.x, theirs.y, theirs.z]
      return FLAG_BASES[enemyTeam]
    }
    if (mode === "culine") return HILL.at
    // Bataie: verso il nemico più vicino, o in giro per la mappa.
    const enemies = world.players.filter((p) => p.alive && p.team !== team)
    if (enemies.length) {
      const pick = enemies[Math.abs(this.roam) % enemies.length]
      // Cambia preda ogni tanto.
      if (this.tick % 600 === 0) this.roam++
      return [pick.body.x, pick.body.y, pick.body.z]
    }
    return this.graph.points[Math.abs(this.roam) % this.graph.points.length]
  }
}

const dist2 = (a: V3, b: PlayerView) => (a[0] - b.body.x) ** 2 + (a[2] - b.body.z) ** 2
