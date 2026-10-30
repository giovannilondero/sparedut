/**
 * Armi: cambio, ricarica, fuoco istantaneo con compensazione della latenza,
 * corpo a corpo, getto del miedi, rotazione del Mulin, lanci di frico e di galline,
 * bombe di sgnape e mine di Raibl, la mitraie delle torrette. Chi corre tiene l'arma
 * abbassata e non spara. Spari e pedate scheggiano le porte da sfondare.
 */
import { Random } from "@typeonce/ritmo"
import { rayPose, type Pose } from "../../hitbox.ts"
import { eyeHeight, lookDir, sprinting } from "../../movement.ts"
import { turretAim } from "../../map.ts"
import { MAPS } from "../../maps/index.ts"
import { BEAM_DAMAGE, RAIBL_MINE, SGNAPE_BOMB, SHELLS, TURRET, WEAPONS, type WeaponId } from "../../weapons.ts"
import type { Vec3 } from "../../vec.ts"
import type { P3 } from "../events.ts"
import { allied, damageAt, DOOR_MELEE_SCALE, hostile, owned, RAISE_TICKS, turretOf } from "../rules.ts"
import {
  Arsenal,
  Controls,
  Damage,
  DoorHit,
  Game,
  Heal,
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
  Turrets,
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
      }),
      projectiles: Game.Query({ selection: { projectile: Game.Query.read(Projectile) } })
    },
    resources: {
      tick: Game.System.readResource(Tick),
      rules: Game.System.readResource(Rules),
      history: Game.System.readResource(History),
      rng: Game.System.writeResource(Rng),
      turrets: Game.System.writeResource(Turrets)
    },
    services: { physics: Game.System.service(Physics) },
    events: {
      out: Game.System.writeEvent(Out),
      damage: Game.System.writeEvent(Damage),
      heal: Game.System.writeEvent(Heal),
      doorHit: Game.System.writeEvent(DoorHit)
    },
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
    const spots = MAPS[rules.map].turrets
    const turrets = [...resources.turrets.get()]
    const all = queries.players.each()
    const minesOf = new Map<string, number>()
    for (const p of queries.projectiles.each()) {
      const v = p.data.projectile.get()
      if (v.kind === "mine") minesOf.set(v.owner, (minesOf.get(v.owner) ?? 0) + 1)
    }

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
      const targets = posesAt(input.view)
      const hittable = (other: string) => other !== session && hostile(rules, team, teamOf.get(other) ?? team)

      /** Colpi istantanei (pallini, proiettili, la mitraie): il primo corpo o muro lungo ogni raggio. */
      const bullets = (weapon: WeaponId, spread: number, eye: Vec3, yaw0: number, pitch0: number) => {
        const def = WEAPONS[weapon]
        const ends: P3[] = []
        const hitWorld: boolean[] = []
        const dealt = new Map<string, { amount: number; head: boolean }>()
        for (let p = 0; p < def.pellets; p++) {
          const yaw = yaw0 + (rng.next() + rng.next() - 1) * spread
          const pitch = pitch0 + (rng.next() + rng.next() - 1) * spread
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
          const onWall = victim === null && wall !== null && wall.dist <= reach + 1e-6
          hitWorld.push(onWall)
          if (onWall && wall.door !== null) events.doorHit.emit({ door: wall.door, amount: damageAt(weapon, reach, false), by: session })
          if (victim) {
            const prev = dealt.get(victim.session)
            const amount = damageAt(weapon, reach, victim.head)
            dealt.set(victim.session, { amount: (prev?.amount ?? 0) + amount, head: (prev?.head ?? false) || victim.head })
          }
        }
        for (const [victim, d] of dealt) {
          const value: DamageValue = { victim, attacker: session, amount: d.amount, weapon, head: d.head, push: null }
          events.damage.emit(value)
        }
        events.out.emit({ t: "shot", s: session, w: weapon, o: r3(eye), e: ends, hw: hitWorld })
      }

      // Alla torretta: la mitraie al posto dell'arma, niente bombe né mine.
      const mounted = turretOf(turrets, session)
      if (mounted >= 0) {
        a = { ...a, sgnape: Math.max(0, a.sgnape - 1), bombCooldown: Math.max(0, a.bombCooldown - 1), mineCooldown: Math.max(0, a.mineCooldown - 1), spin: 0 }
        const gun = turrets[mounted]
        if (held(controls, "fire") && !gun.jammed && gun.cooldown === 0) {
          const aim = turretAim(spots[mounted], input.yaw, input.pitch)
          const eye: Vec3 = { x: motion.body.x, y: motion.body.y + eyeHeight(motion.body), z: motion.body.z }
          bullets("mitraie", WEAPONS.mitraie.spread.still, eye, aim.yaw, aim.pitch)
          const heat = Math.min(1, gun.heat + TURRET.heatPerShot)
          turrets[mounted] = { ...gun, heat, jammed: heat >= 1, cooldown: WEAPONS.mitraie.cooldownTicks }
          if (heat >= 1) events.out.emit({ t: "turret", i: mounted, s: session, a: "hot" })
          if (life.shield > 0) m.data.life.update({ state: "Alive", data: (l) => ({ hp: l.hp, armor: l.armor, shield: 0 }) })
        }
        m.data.arsenal.set(a)
        continue
      }

      // Timer dell'arsenale.
      a = { ...a, sgnape: Math.max(0, a.sgnape - 1), bombCooldown: Math.max(0, a.bombCooldown - 1), mineCooldown: Math.max(0, a.mineCooldown - 1) }

      // Cambio arma.
      const wanted = controls.switchTo
      if (wanted && wanted !== a.current && owned(a, wanted)) {
        a = { ...a, current: wanted, action: { _tag: "switch", ticks: SWITCH_TICKS }, spin: 0 }
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

      // Di corsa l'arma è abbassata: niente colpi, e a fine corsa ci vuole un attimo per rialzarla.
      const running = sprinting(input, motion.body.crouch)
      if (running && (a.action._tag === "ready" || a.action._tag === "cooldown")) {
        a = { ...a, action: { _tag: "cooldown", ticks: Math.max(RAISE_TICKS, a.action._tag === "cooldown" ? a.action.ticks : 0) } }
      }

      const def = WEAPONS[a.current]
      const ammo = a.ammo[a.current]
      const needsAmmo = def.mode !== "melee"
      const automatic = def.mode === "auto" || def.mode === "beam"
      const trigger = automatic ? held(controls, "fire") : justPressed(controls, "fire")
      // Il Mulin gira finché si tiene il grilletto (e l'arma è su), poi rallenta.
      if (def.spinTicks > 0) {
        const turning = held(controls, "fire") && !running && a.action._tag !== "reload" && a.action._tag !== "switch"
        a = { ...a, spin: turning ? Math.min(def.spinTicks, a.spin + 1) : Math.max(0, a.spin - 2) }
      } else if (a.spin !== 0) a = { ...a, spin: 0 }
      const firing = trigger && a.spin >= def.spinTicks
      const canReload = needsAmmo && ammo.mag < def.magazine && ammo.reserve > 0

      if (a.action._tag === "ready" && canReload && (justPressed(controls, "reload") || (firing && ammo.mag === 0))) {
        a = { ...a, action: { _tag: "reload", ticks: def.reloadTicks } }
        events.out.emit({ t: "reload", s: session, w: a.current })
      } else if (a.action._tag === "ready" && firing && (!needsAmmo || ammo.mag > 0)) {
        const eye: Vec3 = { x: motion.body.x, y: motion.body.y + eyeHeight(motion.body), z: motion.body.z }
        const aiming = held(controls, "aim")
        const speed = Math.sqrt(motion.body.vx * motion.body.vx + motion.body.vz * motion.body.vz)
        const spread = aiming ? def.spread.aimed : speed > 1.5 || !motion.body.grounded ? def.spread.moving : def.spread.still
        if (def.mode === "beam") {
          // Il getto del miedi: il primo corpo lungo il raggio, compagno o nemico.
          const dir = lookDir(input.yaw, input.pitch)
          const wall = physics.raycast(eye, dir, def.range)
          let reach = wall ? wall.dist : def.range
          let touched: { session: string; head: boolean } | null = null
          for (const [other, pose] of targets) {
            if (other === session) continue
            const hit = rayPose(eye, dir, pose)
            if (hit && hit.dist < reach) {
              reach = hit.dist
              touched = { session: other, head: hit.head }
            }
          }
          if (touched) {
            const theirs = teamOf.get(touched.session) ?? team
            if (allied(rules, team, theirs)) events.heal.emit({ target: touched.session, healer: session, amount: def.damage })
            else if (hittable(touched.session)) events.damage.emit({ victim: touched.session, attacker: session, amount: BEAM_DAMAGE, weapon: "miedi", head: false, push: null })
          }
          events.out.emit({ t: "shot", s: session, w: a.current, o: r3(eye), e: [r3({ x: eye.x + dir.x * reach, y: eye.y + dir.y * reach, z: eye.z + dir.z * reach })], hw: [false] })
        } else if (def.mode === "melee") {
          const dir = lookDir(input.yaw, input.pitch)
          let best: { session: string; dist: number; head: boolean } | null = null
          for (const [other, pose] of targets) {
            if (!hittable(other)) continue
            const hit = rayPose(eye, dir, pose) ?? rayPose(eye, lookDir(input.yaw, input.pitch - 0.25), pose)
            if (hit && hit.dist <= def.range && (!best || hit.dist < best.dist)) best = { session: other, dist: hit.dist, head: hit.head }
          }
          if (best) events.damage.emit({ victim: best.session, attacker: session, amount: damageAt("mescul", best.dist, best.head), weapon: "mescul", head: best.head, push: null })
          else {
            // Una pedata alla porta.
            const wall = physics.raycast(eye, dir, def.range)
            if (wall?.door != null) events.doorHit.emit({ door: wall.door, amount: def.damage * DOOR_MELEE_SCALE, by: session })
          }
          events.out.emit({ t: "melee", s: session, hit: best !== null })
        } else if (def.mode === "projectile" && def.shell) {
          const dir = lookDir(input.yaw, input.pitch)
          const shell = SHELLS[def.shell]
          commands.spawn(
            Game.Command.spawn([
              Projectile,
              {
                kind: def.shell,
                x: eye.x + dir.x * 0.7,
                y: eye.y + dir.y * 0.7 - 0.15,
                z: eye.z + dir.z * 0.7,
                vx: dir.x * shell.speed,
                vy: dir.y * shell.speed + shell.lift,
                vz: dir.z * shell.speed,
                fuse: shell.fuseTicks,
                age: 0,
                bounces: shell.bounces,
                owner: session,
                team
              }
            ])
          )
          events.out.emit({ t: "launch", s: session, k: def.shell })
        } else bullets(a.current, spread, eye, input.yaw, input.pitch)

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

      // Mine di Raibl: si buttano davanti ai piedi.
      if (justPressed(controls, "mine") && a.mines > 0 && a.mineCooldown === 0 && (minesOf.get(session) ?? 0) < RAIBL_MINE.maxActive) {
        const dir = lookDir(input.yaw, Math.min(input.pitch, 0.1) - 0.15)
        const eye = { x: motion.body.x, y: motion.body.y + eyeHeight(motion.body), z: motion.body.z }
        commands.spawn(
          Game.Command.spawn([
            Projectile,
            {
              kind: "mine",
              x: eye.x + dir.x * 0.5,
              y: eye.y - 0.4,
              z: eye.z + dir.z * 0.5,
              vx: dir.x * RAIBL_MINE.speed + motion.body.vx * 0.5,
              vy: dir.y * RAIBL_MINE.speed + 1,
              vz: dir.z * RAIBL_MINE.speed + motion.body.vz * 0.5,
              fuse: RAIBL_MINE.lifeTicks,
              age: 0,
              bounces: 0,
              owner: session,
              team
            }
          ])
        )
        minesOf.set(session, (minesOf.get(session) ?? 0) + 1)
        a = { ...a, mines: a.mines - 1, mineCooldown: RAIBL_MINE.cooldownTicks }
        events.out.emit({ t: "launch", s: session, k: "mine" })
      }

      m.data.arsenal.set(a)
    }
    resources.turrets.set(turrets)
  }
)
