/**
 * Frico wheels, sgnape bombs, Raibl mines and hens: they fly, bounce,
 * stick, home in on the enemy, burst. Explosions splinter nearby doors.
 */
import { bodyCenter } from "../../hitbox.ts"
import { MAPS } from "../../maps/index.ts"
import { FRICO_SHELL, GJALINE, RAIBL_MINE, SGNAPE_BOMB, WEAPONS, type ProjectileKind } from "../../weapons.ts"
import type { Vec3 } from "../../vec.ts"
import { DT } from "../../movement.ts"
import type { KillCause } from "../events.ts"
import { hostile } from "../rules.ts"
import { Damage, DoorHit, Game, Life, Motion, Out, Physics, Player, Projectile, Rules, TeamOf, type ProjectileValue } from "../schema.ts"

const GRAVITY = { frico: FRICO_SHELL.gravity, sgnape: 22, mine: 22, gjaline: GJALINE.gravity } as const satisfies Record<ProjectileKind, number>
const BLAST = {
  frico: { radius: FRICO_SHELL.radius, damage: 110, cause: "lanciafrico" },
  sgnape: { radius: SGNAPE_BOMB.radius, damage: SGNAPE_BOMB.damage, cause: "sgnape" },
  mine: { radius: RAIBL_MINE.radius, damage: RAIBL_MINE.damage, cause: "mine" },
  gjaline: { radius: GJALINE.radius, damage: WEAPONS.gjalinis.damage, cause: "gjalinis" }
} as const satisfies Record<ProjectileKind, { radius: number; damage: number; cause: KillCause }>
/** They burst on whoever they touch in flight. */
const CONTACT: ReadonlySet<ProjectileKind> = new Set(["frico", "gjaline"])

export const FlyProjectiles = Game.System(
  "Sparedut/FlyProjectiles",
  {
    queries: {
      projectiles: Game.Query({ selection: { projectile: Game.Query.write(Projectile) } }),
      players: Game.Query({
        selection: { player: Game.Query.read(Player), team: Game.Query.read(TeamOf), motion: Game.Query.read(Motion), life: Game.Query.read(Life) }
      })
    },
    resources: { rules: Game.System.readResource(Rules) },
    services: { physics: Game.System.service(Physics) },
    events: { out: Game.System.writeEvent(Out), damage: Game.System.writeEvent(Damage), doorHit: Game.System.writeEvent(DoorHit) },
    commands: Game.System.commands(Game.System.despawns(Projectile))
  },
  ({ queries, resources, services, events, commands }) => {
    const physics = services.physics
    const rules = resources.rules.get()
    const doors = MAPS[rules.map].doors
    const living = queries.players.each().filter((m) => m.data.life.get()._tag === "Alive").map((m) => ({
      session: m.data.player.get().session,
      team: m.data.team.get(),
      center: bodyCenter(m.data.motion.get().body)
    }))

    const explode = (p: ProjectileValue, at: Vec3) => {
      const blast = BLAST[p.kind]
      events.out.emit({ t: "boom", p: [at.x, at.y, at.z], k: p.kind })
      for (const target of living) {
        if (target.session !== p.owner && !hostile(rules, p.team, target.team)) continue
        const dx = target.center.x - at.x
        const dy = target.center.y - at.y
        const dz = target.center.z - at.z
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d > blast.radius) continue
        if (!physics.lineOfSight({ x: at.x, y: at.y + 0.2, z: at.z }, target.center)) continue
        const falloff = 1 - d / blast.radius
        const self = target.session === p.owner
        const amount = blast.damage * (0.25 + 0.75 * falloff) * (self ? 0.45 : 1)
        const inv = d > 0.01 ? 1 / d : 0
        const push = 9 * falloff
        events.damage.emit({
          victim: target.session,
          attacker: p.owner,
          amount,
          weapon: blast.cause,
          head: false,
          push: { x: dx * inv * push, y: 4 + 6 * falloff, z: dz * inv * push }
        })
        // The gjaline's feathers: whoever is hit can't see anything for a while.
        if (p.kind === "gjaline") events.out.emit({ t: "plumis", v: target.session, n: Math.round(GJALINE.blindTicks * (0.5 + 0.5 * falloff)) })
      }
      // Nearby doors: measured from the door's point closest to the blast.
      doors.forEach((door, i) => {
        const cx = Math.max(door.min[0], Math.min(door.max[0], at.x))
        const cy = Math.max(door.min[1], Math.min(door.max[1], at.y))
        const cz = Math.max(door.min[2], Math.min(door.max[2], at.z))
        const d = Math.sqrt((cx - at.x) ** 2 + (cy - at.y) ** 2 + (cz - at.z) ** 2)
        if (d < blast.radius) events.doorHit.emit({ door: i, amount: blast.damage * (0.25 + 0.75 * (1 - d / blast.radius)), by: p.owner })
      })
    }

    for (const m of queries.projectiles.each()) {
      const p = m.data.projectile.get()
      // A planted mine doesn't move: it waits to arm, then for someone to pass nearby.
      if (p.kind === "mine" && p.vx === 0 && p.vy === 0 && p.vz === 0) {
        const fuse = p.fuse - 1
        const victim =
          p.age >= RAIBL_MINE.armTicks &&
          living.find((t) => {
            if (t.session === p.owner || !hostile(rules, p.team, t.team)) return false
            const dx = t.center.x - p.x
            const dz = t.center.z - p.z
            return dx * dx + dz * dz < RAIBL_MINE.trigger * RAIBL_MINE.trigger && Math.abs(t.center.y - p.y) < 2
          })
        if (victim || fuse <= 0) {
          explode(p, { x: p.x, y: p.y + 0.15, z: p.z })
          commands.despawn(m.entity)
        } else m.data.projectile.set({ ...p, fuse, age: p.age + 1 })
        continue
      }
      let vx = p.vx
      let vy = p.vy - GRAVITY[p.kind] * DT
      let vz = p.vz
      if (p.kind === "gjaline") {
        // The gjaline homes in on the nearest enemy ahead of it, turning slowly.
        const sp = Math.sqrt(vx ** 2 + vy ** 2 + vz ** 2)
        if (sp > 1e-6) {
          let best: { x: number; y: number; z: number } | null = null
          let bestD: number = GJALINE.sight
          for (const t of living) {
            if (t.session === p.owner || !hostile(rules, p.team, t.team)) continue
            const dx = t.center.x - p.x
            const dy = t.center.y - p.y
            const dz = t.center.z - p.z
            const d = Math.sqrt(dx ** 2 + dy ** 2 + dz ** 2)
            if (d < 0.01 || d > bestD || (dx * vx + dy * vy + dz * vz) / (d * sp) < GJALINE.cone) continue
            best = { x: dx / d, y: dy / d, z: dz / d }
            bestD = d
          }
          if (best) {
            const k = GJALINE.turn
            const nx = vx / sp + (best.x - vx / sp) * k
            const ny = vy / sp + (best.y - vy / sp) * k
            const nz = vz / sp + (best.z - vz / sp) * k
            const n = Math.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
            vx = (nx / n) * sp
            vy = (ny / n) * sp
            vz = (nz / n) * sp
          }
        }
      }
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
      const step = speed * DT
      let x = p.x
      let y = p.y
      let z = p.z
      let bounces = p.bounces
      let exploded = false
      if (step > 1e-6) {
        const dir = { x: vx / speed, y: vy / speed, z: vz / speed }
        const wall = physics.raycast({ x, y, z }, dir, step + 0.12)
        // Against a player: frico and gjaline burst on contact.
        if (CONTACT.has(p.kind)) {
          for (const t of living) {
            if (t.session === p.owner && p.age < 12) continue
            const cx = t.center.x - x
            const cy = t.center.y - y
            const cz = t.center.z - z
            const along = Math.max(0, Math.min(step, cx * dir.x + cy * dir.y + cz * dir.z))
            const px = x + dir.x * along - t.center.x
            const py = y + dir.y * along - t.center.y
            const pz = z + dir.z * along - t.center.z
            if (px * px + py * py * 0.5 + pz * pz < 0.75 * 0.75) {
              explode(p, { x: x + dir.x * along, y: y + dir.y * along, z: z + dir.z * along })
              exploded = true
              break
            }
          }
        }
        if (!exploded && wall) {
          const at = { x: x + dir.x * Math.max(0, wall.dist - 0.1), y: y + dir.y * Math.max(0, wall.dist - 0.1), z: z + dir.z * Math.max(0, wall.dist - 0.1) }
          if (p.kind === "mine") {
            // On the floor it sticks; against a wall it slides down.
            x = at.x
            y = at.y
            z = at.z
            if (wall.normal.y > 0.6) {
              vx = 0
              vy = 0
              vz = 0
            } else {
              vx = 0
              vz = 0
              vy = Math.min(vy, 0)
            }
          } else if (bounces > 0) {
            const n = wall.normal
            const dn = vx * n.x + vy * n.y + vz * n.z
            const damping = p.kind === "frico" ? 0.62 : 0.45
            vx = (vx - 2 * dn * n.x) * damping
            vy = (vy - 2 * dn * n.y) * damping
            vz = (vz - 2 * dn * n.z) * damping
            bounces -= p.kind === "frico" ? 1 : 0
            x = at.x
            y = at.y
            z = at.z
            if (speed > 3) events.out.emit({ t: "bounce", p: [x, y, z] })
          } else {
            explode(p, at)
            exploded = true
          }
        } else if (!exploded) {
          x += vx * DT
          y += vy * DT
          z += vz * DT
        }
      }
      const fuse = p.fuse - 1
      if (!exploded && (fuse <= 0 || y < -8)) {
        explode(p, { x, y, z })
        exploded = true
      }
      if (exploded) commands.despawn(m.entity)
      else m.data.projectile.set({ kind: p.kind, x, y, z, vx, vy, vz, fuse, age: p.age + 1, bounces, owner: p.owner, team: p.team })
    }
  }
)
