/**
 * Forme di frico e bombe di sgnape: volano, rimbalzano, scoppiano.
 */
import { bodyCenter } from "../../hitbox.ts"
import { FRICO_SHELL, SGNAPE_BOMB } from "../../weapons.ts"
import type { Vec3 } from "../../vec.ts"
import { DT } from "../../movement.ts"
import { Damage, Game, Life, Motion, Out, Physics, Player, Projectile, Rules, TeamOf, type ProjectileValue } from "../schema.ts"

const GRAVITY = { frico: FRICO_SHELL.gravity, sgnape: 22 } as const
const BLAST = {
  frico: { radius: FRICO_SHELL.radius, damage: 110 },
  sgnape: { radius: SGNAPE_BOMB.radius, damage: SGNAPE_BOMB.damage }
} as const

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
    events: { out: Game.System.writeEvent(Out), damage: Game.System.writeEvent(Damage) },
    commands: Game.System.commands(Game.System.despawns(Projectile))
  },
  ({ queries, resources, services, events, commands }) => {
    const physics = services.physics
    const rules = resources.rules.get()
    const living = queries.players.each().filter((m) => m.data.life.get()._tag === "Alive").map((m) => ({
      session: m.data.player.get().session,
      team: m.data.team.get(),
      center: bodyCenter(m.data.motion.get().body)
    }))

    const explode = (p: ProjectileValue, at: Vec3) => {
      const blast = BLAST[p.kind]
      events.out.emit({ t: "boom", p: [at.x, at.y, at.z], k: p.kind })
      for (const target of living) {
        if (target.session !== p.owner && target.team === p.team && !rules.friendlyFire) continue
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
          weapon: p.kind === "frico" ? "lanciafrico" : "sgnape",
          head: false,
          push: { x: dx * inv * push, y: 4 + 6 * falloff, z: dz * inv * push }
        })
      }
    }

    for (const m of queries.projectiles.each()) {
      const p = m.data.projectile.get()
      let vx = p.vx
      let vy = p.vy - GRAVITY[p.kind] * DT
      let vz = p.vz
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
        // Contro un giocatore: il frico scoppia addosso.
        if (p.kind === "frico") {
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
          if (bounces > 0) {
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
