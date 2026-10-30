/**
 * Armi: cambio, ricarica, fuoco istantaneo con compensazione della latenza,
 * corpo a corpo, lanci di frico e bombe di sgnape.
 */
import { Random } from "@typeonce/ritmo"
import { rayPose, type Pose } from "../../hitbox.ts"
import { eyeHeight, lookDir } from "../../movement.ts"
import { FRICO_SHELL, SGNAPE_BOMB, WEAPONS } from "../../weapons.ts"
import type { Vec3 } from "../../vec.ts"
import type { P3 } from "../events.ts"
import { damageAt, owned } from "../rules.ts"
import {
  Arsenal,
  Controls,
  Damage,
  Game,
  History,
  Life,
  Match,
  Motion,
  Out,
  Physics,
  Player,
  Projectile,
  Rng,
  Rules,
  TeamOf,
  Tick,
  type ArsenalValue,
  type DamageValue
} from "../schema.ts"
import { held, justPressed } from "./input.ts"

const SWITCH_TICKS = 18
/** Oltre questo ritardo (tick) non si torna indietro nel tempo per colpire. */
const MAX_REWIND = 18

const r3 = (v: Vec3): P3 => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100]

export const UseWeapons = Game.System(
  "Sparedut/UseWeapons",
  {
    queries: {
      players: Game.Query({
        selection: {
          player: Game.Query.read(Player),
          team: Game.Query.read(TeamOf),
          motion: Game.Query.read(Motion),
          controls: Game.Query.read(Controls),
          life: Game.Query.write(Life),
          arsenal: Game.Query.write(Arsenal)
        }
      })
    },
    resources: {
      tick: Game.System.readResource(Tick),
      rules: Game.System.readResource(Rules),
      history: Game.System.readResource(History),
      rng: Game.System.writeResource(Rng)
    },
    services: { physics: Game.System.service(Physics) },
    events: { out: Game.System.writeEvent(Out), damage: Game.System.writeEvent(Damage) },
    machines: { match: Game.System.machine(Match) },
    commands: Game.System.commands(Game.System.spawns(Projectile))
  },
  ({ queries, resources, services, events, machines, commands }) => {
    if (machines.match.get()._tag === "Over") return
    const tick = resources.tick.get()
    const rules = resources.rules.get()
    const history = resources.history.get()
    const rng = Random.draw(resources.rng)
    const physics = services.physics
    const all = queries.players.each()

    const teamOf = new Map(all.map((m) => [m.data.player.get().session, m.data.team.get()]))
    const currentPoses = new Map<string, Pose>()
    for (const m of all) {
      if (m.data.life.get()._tag === "Alive") currentPoses.set(m.data.player.get().session, m.data.motion.get().body)
    }
    const posesAt = (view: number): Map<string, Pose> => {
      const target = Math.max(tick - MAX_REWIND, Math.min(tick, view))
      const frame = history.find((h) => h.tick === target)
      if (!frame) return currentPoses
      const out = new Map<string, Pose>()
      // Solo chi è vivo adesso può essere colpito, nella posa di allora (o attuale se appena nato).
      for (const [session, now] of currentPoses) out.set(session, frame.poses.find((p) => p.session === session) ?? now)
      return out
    }

    for (const m of all) {
      const life = m.data.life.get()
      if (life._tag !== "Alive") continue
      const session = m.data.player.get().session
      const team = m.data.team.get()
      const controls = m.data.controls.get()
      const input = controls.input
      const motion = m.data.motion.get()
      let a: ArsenalValue = m.data.arsenal.get()

      // Timer dell'arsenale.
      a = { ...a, sgnape: Math.max(0, a.sgnape - 1), bombCooldown: Math.max(0, a.bombCooldown - 1) }

      // Cambio arma.
      const wanted = controls.switchTo
      if (wanted && wanted !== a.current && owned(a, wanted)) {
        a = { ...a, current: wanted, action: { _tag: "switch", ticks: SWITCH_TICKS } }
      }

      // Avanzamento dell'azione in corso.
      const action = a.action
      if (action._tag !== "ready") {
        const left = action.ticks - 1
        if (left > 0) a = { ...a, action: { _tag: action._tag, ticks: left } }
        else if (action._tag === "reload") {
          const ammo = a.ammo[a.current]
          const take = Math.min(WEAPONS[a.current].magazine - ammo.mag, ammo.reserve)
          a = { ...a, action: { _tag: "ready" }, ammo: { ...a.ammo, [a.current]: { mag: ammo.mag + take, reserve: ammo.reserve - take } } }
        } else a = { ...a, action: { _tag: "ready" } }
      }

      const def = WEAPONS[a.current]
      const ammo = a.ammo[a.current]
      const needsAmmo = def.mode !== "melee"
      const firing = def.mode === "auto" ? held(controls, "fire") : justPressed(controls, "fire")
      const canReload = needsAmmo && ammo.mag < def.magazine && ammo.reserve > 0

      if (a.action._tag === "ready" && canReload && (justPressed(controls, "reload") || (firing && ammo.mag === 0))) {
        a = { ...a, action: { _tag: "reload", ticks: def.reloadTicks } }
        events.out.emit({ t: "reload", s: session, w: a.current })
      } else if (a.action._tag === "ready" && firing && (!needsAmmo || ammo.mag > 0)) {
        const eye: Vec3 = { x: motion.body.x, y: motion.body.y + eyeHeight(motion.body), z: motion.body.z }
        const aiming = held(controls, "aim")
        const speed = Math.sqrt(motion.body.vx * motion.body.vx + motion.body.vz * motion.body.vz)
        const spread = aiming ? def.spread.aimed : speed > 1.5 || !motion.body.grounded ? def.spread.moving : def.spread.still
        const targets = posesAt(input.view)
        const hittable = (other: string) => other !== session && (rules.friendlyFire || teamOf.get(other) !== team)

        if (def.mode === "melee") {
          const dir = lookDir(input.yaw, input.pitch)
          let best: { session: string; dist: number; head: boolean } | null = null
          for (const [other, pose] of targets) {
            if (!hittable(other)) continue
            const hit = rayPose(eye, dir, pose) ?? rayPose(eye, lookDir(input.yaw, input.pitch - 0.25), pose)
            if (hit && hit.dist <= def.range && (!best || hit.dist < best.dist)) best = { session: other, dist: hit.dist, head: hit.head }
          }
          if (best) events.damage.emit({ victim: best.session, attacker: session, amount: damageAt("mescul", best.dist, best.head), weapon: "mescul", head: best.head, push: null })
          events.out.emit({ t: "melee", s: session, hit: best !== null })
        } else if (def.mode === "projectile") {
          const dir = lookDir(input.yaw, input.pitch)
          commands.spawn(
            Game.Command.spawn([
              Projectile,
              {
                kind: "frico",
                x: eye.x + dir.x * 0.7,
                y: eye.y + dir.y * 0.7 - 0.15,
                z: eye.z + dir.z * 0.7,
                vx: dir.x * FRICO_SHELL.speed,
                vy: dir.y * FRICO_SHELL.speed + 1.5,
                vz: dir.z * FRICO_SHELL.speed,
                fuse: FRICO_SHELL.fuseTicks,
                age: 0,
                bounces: FRICO_SHELL.bounces,
                owner: session,
                team
              }
            ])
          )
          events.out.emit({ t: "launch", s: session, k: "frico" })
        } else {
          const ends: P3[] = []
          const hitWorld: boolean[] = []
          const dealt = new Map<string, { amount: number; head: boolean }>()
          for (let p = 0; p < def.pellets; p++) {
            const yaw = input.yaw + (rng.next() + rng.next() - 1) * spread
            const pitch = input.pitch + (rng.next() + rng.next() - 1) * spread
            const dir = lookDir(yaw, pitch)
            const wall = physics.raycast(eye, dir, def.range)
            let reach = wall ? wall.dist : def.range
            let victim: { session: string; head: boolean } | null = null
            for (const [other, pose] of targets) {
              if (!hittable(other)) continue
              const hit = rayPose(eye, dir, pose)
              if (hit && hit.dist < reach) {
                reach = hit.dist
                victim = { session: other, head: hit.head }
              }
            }
            ends.push(r3({ x: eye.x + dir.x * reach, y: eye.y + dir.y * reach, z: eye.z + dir.z * reach }))
            hitWorld.push(victim === null && wall !== null && wall.dist <= reach + 1e-6)
            if (victim) {
              const prev = dealt.get(victim.session)
              const amount = damageAt(a.current, reach, victim.head)
              dealt.set(victim.session, { amount: (prev?.amount ?? 0) + amount, head: (prev?.head ?? false) || victim.head })
            }
          }
          for (const [victim, d] of dealt) {
            const value: DamageValue = { victim, attacker: session, amount: d.amount, weapon: a.current, head: d.head, push: null }
            events.damage.emit(value)
          }
          events.out.emit({ t: "shot", s: session, w: a.current, o: r3(eye), e: ends, hw: hitWorld })
        }

        a = {
          ...a,
          action: { _tag: "cooldown", ticks: def.cooldownTicks },
          ammo: needsAmmo ? { ...a.ammo, [a.current]: { mag: ammo.mag - 1, reserve: ammo.reserve } } : a.ammo
        }
        if (life.shield > 0) m.data.life.update({ state: "Alive", data: (l) => ({ hp: l.hp, armor: l.armor, shield: 0 }) })
      }

      // Bombe di sgnape.
      if (justPressed(controls, "bomb") && a.bombs > 0 && a.bombCooldown === 0) {
        const dir = lookDir(input.yaw, input.pitch + 0.12)
        const eye = { x: motion.body.x, y: motion.body.y + eyeHeight(motion.body), z: motion.body.z }
        commands.spawn(
          Game.Command.spawn([
            Projectile,
            {
              kind: "sgnape",
              x: eye.x + dir.x * 0.5,
              y: eye.y + dir.y * 0.5,
              z: eye.z + dir.z * 0.5,
              vx: dir.x * SGNAPE_BOMB.speed + motion.body.vx * 0.5,
              vy: dir.y * SGNAPE_BOMB.speed + 2,
              vz: dir.z * SGNAPE_BOMB.speed + motion.body.vz * 0.5,
              fuse: SGNAPE_BOMB.fuseTicks,
              age: 0,
              bounces: 99,
              owner: session,
              team
            }
          ])
        )
        a = { ...a, bombs: a.bombs - 1, bombCooldown: SGNAPE_BOMB.cooldownTicks }
        events.out.emit({ t: "launch", s: session, k: "sgnape" })
      }

      m.data.arsenal.set(a)
    }
  }
)
