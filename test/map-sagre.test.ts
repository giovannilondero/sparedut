/**
 * Sagre dal Frico, the training's fair: the stations in a row along one street, the square at
 * the end. A body walks it as a player would, with the ways between stations open or closed.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { BUTTON, IDLE_INPUT } from "../shared/input.ts"
import type { Bounds, V3 } from "../shared/map.ts"
import { SAGRE, SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import { stepBody, type Body } from "../shared/movement.ts"
import { createPhysicsWorld, initPhysics, type PhysicsWorld } from "../shared/physics.ts"

let open: PhysicsWorld
let closed: PhysicsWorld
beforeAll(async () => {
  await initPhysics()
  open = createPhysicsWorld(SAGRE)
  // Every way shut, as a host closes them: each gate collides like a wall.
  closed = createPhysicsWorld({ ...SAGRE, blocks: [...SAGRE.blocks, ...(SAGRE.gates ?? []).map((g) => ({ min: g.min, max: g.max, mat: "legno" as const }))] })
})

const at = ([x, y, z]: V3): Body => ({ x, y: y + 0.05, z, vx: 0, vy: 0, vz: 0, grounded: true, crouch: false })
const { bar, beam } = SAGRE_STATIONS[1]

/**
 * Walks straight at `to` as a player would on the obstacle course: a jump just before the bar
 * (if `jump`), crouched under the beam (if `crouch`). Where it ended up and whether it arrived.
 */
function walk(physics: PhysicsWorld, from: V3, to: V3, o: { jump?: boolean; crouch?: boolean } = {}) {
  const { jump = true, crouch = true } = o
  let body = at(from)
  for (let i = 0; i < 60 * 60; i++) {
    const dx = to[0] - body.x
    const dz = to[2] - body.z
    if (Math.hypot(dx, dz) < 0.5) return { body, arrived: Math.abs(body.y - to[1]) < 0.3 }
    let buttons = 0
    if (jump && body.x > bar.min[0] - 1.3 && body.x < bar.min[0]) buttons |= BUTTON.jump
    if (crouch && body.x > beam.min[0] - 1 && body.x < beam.max[0] + 0.6) buttons |= BUTTON.crouch
    body = stepBody(body, { ...IDLE_INPUT, mz: 1, yaw: Math.atan2(-dx, -dz), buttons }, physics, 1).body
  }
  return { body, arrived: false }
}

const inside = (a: Bounds, [x, , z]: V3) => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ

describe("Sagre dal Frico", () => {
  test("there are twelve stations, each with a closed way to the next but the last", () => {
    expect(SAGRE_STATIONS).toHaveLength(12)
    expect(SAGRE_STATIONS.map((s) => s.gate)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null])
    expect(SAGRE.gates).toHaveLength(11)
  })

  for (let i = 0; i < 11; i++) {
    test(`with the way open, station ${i + 2} is reached on foot from station ${i + 1}`, () => {
      expect(walk(open, SAGRE_STATIONS[i].start.at, SAGRE_STATIONS[i + 1].start.at).arrived).toBe(true)
    })

    test(`with the way closed, station ${i + 2} cannot be reached from station ${i + 1}`, () => {
      const { body, arrived } = walk(closed, SAGRE_STATIONS[i].start.at, SAGRE_STATIONS[i + 1].start.at)
      expect(arrived).toBe(false)
      // Stopped at the gate, still inside the station it left.
      expect(inside(SAGRE_STATIONS[i].area, [body.x, body.y, body.z])).toBe(true)
    })
  }

  test("a host closes and opens the gates in the physics: a closed one stops you like a wall, shots too", () => {
    const world = createPhysicsWorld(SAGRE)
    const [one, two] = SAGRE_STATIONS
    world.setGates(SAGRE.gates!.map(() => true))
    expect(walk(world, one.start.at, two.start.at).arrived).toBe(false)
    const gate = SAGRE.gates![0]
    expect(world.raycast({ x: gate.min[0] - 2, y: 1.5, z: 0 }, { x: 1, y: 0, z: 0 }, 4)).toMatchObject({ door: null })
    // Only the first way open: station 2 is reached, station 3 is not.
    world.setGates(SAGRE.gates!.map((_, i) => i > 0))
    expect(walk(world, one.start.at, two.start.at).arrived).toBe(true)
    expect(walk(world, two.start.at, SAGRE_STATIONS[2].start.at).arrived).toBe(false)
    // Closed again, as when the trainee goes back to station 1.
    world.setGates(SAGRE.gates!.map(() => true))
    expect(walk(world, one.start.at, two.start.at).arrived).toBe(false)
    expect(world.raycast({ x: gate.min[0] - 2, y: 1.5, z: 0 }, { x: 1, y: 0, z: 0 }, 4)).not.toBeNull()
  })

  test("the bar stops you unless you jump it, the beam unless you crouch under it", () => {
    const { start, sprintFrom } = SAGRE_STATIONS[1]
    const noJump = walk(open, start.at, sprintFrom, { jump: false })
    expect(noJump.arrived).toBe(false)
    expect(noJump.body.x).toBeLessThan(bar.min[0])
    const standing = walk(open, start.at, sprintFrom, { crouch: false })
    expect(standing.arrived).toBe(false)
    expect(standing.body.x).toBeGreaterThan(bar.max[0])
    expect(standing.body.x).toBeLessThan(beam.min[0])
  })

  test("the sprint line lies ahead of the run-up, inside the obstacle course", () => {
    const { area, sprintFrom, sprintLine } = SAGRE_STATIONS[1]
    expect(sprintLine - sprintFrom[0]).toBeGreaterThan(6)
    expect(sprintLine).toBeLessThan(area.maxX)
    expect(walk(open, sprintFrom, [sprintLine + 0.5, 0, sprintFrom[2]]).arrived).toBe(true)
  })

  test("each station's area holds what its steps need", () => {
    const [look, , always, , stalls, , bombs, pickups, turret, medic, modes, skirmish] = SAGRE_STATIONS
    for (const s of SAGRE_STATIONS) expect(inside(s.area, s.start.at)).toBe(true)
    expect(inside(look.area, look.marker)).toBe(true)
    // The door to break with the mescul, and targets for the Mandi and the mescul.
    const door = SAGRE.doors[always.door]
    // In the row of houses along the station, kicked from the street.
    expect(door.min[0] >= always.area.minX && door.max[0] <= always.area.maxX).toBe(true)
    expect(inside(always.area, always.doorFront)).toBe(true)
    for (const p of [...always.targets.mandi, ...always.targets.aim, ...always.targets.mescul]) expect(inside(always.area, p)).toBe(true)
    // One stall per primary but the medic's, each with its target.
    expect(Object.keys(stalls.stalls).sort()).toEqual(["cjampanili", "cramar", "doplete", "gjalinis", "mulin"])
    for (const s of Object.values(stalls.stalls)) for (const p of [s.at.at, ...s.target]) expect(inside(stalls.area, p)).toBe(true)
    // The Cjampanili's target is far: what the scope is for.
    const far = stalls.stalls.cjampanili
    expect(Math.hypot(far.target[0][0] - far.at.at[0], far.target[0][2] - far.at.at[2])).toBeGreaterThan(35)
    for (const p of [bombs.bombAt, ...bombs.bombTargets, bombs.mineAt, ...bombs.mineRoute]) expect(inside(bombs.area, p)).toBe(true)
    // A pickup of each of the four kinds.
    for (const kind of ["frico", "gubane", "sgnape", "munizions"] as const) {
      const i = pickups.pickups[kind]
      expect(SAGRE.pickups[i].kind).toBe(kind)
      expect(inside(pickups.area, SAGRE.pickups[i].at)).toBe(true)
    }
    expect(Object.keys(pickups.pickups).sort()).toEqual(["frico", "gubane", "munizions", "sgnape"])
    expect(inside(turret.area, SAGRE.turrets[turret.turret].at)).toBe(true)
    expect(SAGRE.pickups[turret.lanciafrico].kind).toBe("lanciafrico")
    expect(inside(turret.area, SAGRE.pickups[turret.lanciafrico].at)).toBe(true)
    expect(inside(medic.area, medic.wounded.at)).toBe(true)
    // The modes: both frico bases, the plaçute, the cjar track, the storm's centre.
    for (const p of [SAGRE.flagBases.benandanti, SAGRE.flagBases.malandanti, SAGRE.hill.at, ...SAGRE.track, modes.storm]) expect(inside(modes.area, p)).toBe(true)
    for (const s of [...SAGRE.spawns.benandanti, ...SAGRE.spawns.malandanti]) expect(inside(skirmish.area, s.at)).toBe(true)
  })

  test("the player, the bots and every station's start stand on the ground, not inside anything", () => {
    const spots = [...SAGRE_STATIONS.map((s) => s.start), ...SAGRE.spawns.benandanti, ...SAGRE.spawns.malandanti, SAGRE_STATIONS[9].wounded]
    for (const s of spots) {
      let b = at(s.at)
      for (let i = 0; i < 30; i++) b = stepBody(b, IDLE_INPUT, open, 1).body
      expect({ at: s.at, grounded: b.grounded, dy: Math.abs(b.y - s.at[1]) < 0.1, stands: open.canStand(b) }).toEqual({ at: s.at, grounded: true, dy: true, stands: true })
    }
  })

  test("every bot route at the stations can be walked, there and back", () => {
    const [, , always, , stalls, , bombs] = SAGRE_STATIONS
    const routes = [always.targets.mandi, always.targets.aim, ...Object.values(stalls.stalls).map((s) => s.target), bombs.mineRoute]
    for (const route of routes) {
      for (let i = 1; i < route.length; i++) {
        expect(walk(open, route[i - 1], route[i]).arrived).toBe(true)
        expect(walk(open, route[i], route[i - 1]).arrived).toBe(true)
      }
    }
  })

  test("the cjar track can be walked from end to end without straying", () => {
    const track = SAGRE.track
    let b = at(track[0])
    let worst = 0
    for (let i = 1; i < track.length; i++) {
      const [tx, ty, tz] = track[i]
      for (let k = 0; k < 60 * 30; k++) {
        const dx = tx - b.x
        const dz = tz - b.z
        if (Math.hypot(dx, dz) < 0.5) break
        b = stepBody(b, { ...IDLE_INPUT, mz: 1, yaw: Math.atan2(-dx, -dz) }, open, 1).body
        const [ax, , az] = track[i - 1]
        const len = Math.hypot(tx - ax, tz - az)
        const u = Math.max(0, Math.min(1, ((b.x - ax) * (tx - ax) + (b.z - az) * (tz - az)) / (len * len)))
        worst = Math.max(worst, Math.hypot(b.x - (ax + (tx - ax) * u), b.z - (az + (tz - az) * u)))
      }
      expect(Math.hypot(tx - b.x, tz - b.z)).toBeLessThan(0.6)
      expect(Math.abs(b.y - ty)).toBeLessThan(0.3)
    }
    expect(worst).toBeLessThan(1)
  })

  test("the door stands between the street and the shed, facing the one who kicks it", () => {
    const { doorFront, door } = SAGRE_STATIONS[2]
    const d = SAGRE.doors[door]
    const towards = { x: (d.min[0] + d.max[0]) / 2 - doorFront[0], y: 0, z: (d.min[2] + d.max[2]) / 2 - doorFront[2] }
    const len = Math.hypot(towards.x, towards.z)
    const hit = open.raycast({ x: doorFront[0], y: 1.5, z: doorFront[2] }, { x: towards.x / len, y: 0, z: towards.z / len }, 4)
    expect(hit?.door).toBe(door)
  })
})
