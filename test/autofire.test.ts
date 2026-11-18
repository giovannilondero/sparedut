import { expect, test } from "bun:test"
import { lookDir } from "../shared/movement.ts"
import { WEAPON_IDS, WEAPONS, type WeaponId } from "../shared/weapons.ts"
import { aimDir, autoFired, enemyUnderCrosshair, type Sighted } from "../client/autofire.ts"

// Layout C's decision (under trial, #34): deleted with the layout if the owner does not keep it.

/** Standing at the origin, eyes at 1.6 m, looking down -z (yaw 0). */
const eye = { x: 0, y: 1.6, z: 0 }
const ahead = { x: 0, y: 0, z: -1 }
const someone = (over: Partial<Sighted> = {}): Sighted => ({ x: 0, y: 0, z: -10, crouch: false, alive: true, enemy: true, ...over })
/** A world with one wall across the line of sight at `at` metres, or none. */
const wallAt = (at: number | null) => (_o: unknown, _d: unknown, max: number) => (at !== null && at <= max ? at : null)
const open = wallAt(null)

test("an enemy straight ahead and within range is under the crosshair", () => {
  expect(enemyUnderCrosshair(eye, ahead, 120, [someone()], open)).toBe(true)
})

test("an enemy beyond the weapon's range is not", () => {
  expect(enemyUnderCrosshair(eye, ahead, 9, [someone({ z: -10 })], open)).toBe(false)
  expect(enemyUnderCrosshair(eye, ahead, 11, [someone({ z: -10 })], open)).toBe(true)
})

test("a teammate is never a target, nor is an enemy behind one", () => {
  expect(enemyUnderCrosshair(eye, ahead, 120, [someone({ enemy: false })], open)).toBe(false)
  expect(enemyUnderCrosshair(eye, ahead, 120, [someone({ z: -20 }), someone({ z: -6, enemy: false })], open)).toBe(false)
  // A teammate behind the enemy does not matter.
  expect(enemyUnderCrosshair(eye, ahead, 120, [someone({ z: -6 }), someone({ z: -20, enemy: false })], open)).toBe(true)
})

test("never through a wall", () => {
  expect(enemyUnderCrosshair(eye, ahead, 120, [someone()], wallAt(5))).toBe(false)
  expect(enemyUnderCrosshair(eye, ahead, 120, [someone()], wallAt(15))).toBe(true)
})

test("an enemy beside the line of sight, behind the player, or dead is not under the crosshair", () => {
  expect(enemyUnderCrosshair(eye, ahead, 120, [someone({ x: 1.5 })], open)).toBe(false)
  expect(enemyUnderCrosshair(eye, ahead, 120, [someone({ z: 10 })], open)).toBe(false)
  expect(enemyUnderCrosshair(eye, ahead, 120, [someone({ alive: false })], open)).toBe(false)
  expect(enemyUnderCrosshair(eye, ahead, 120, [], open)).toBe(false)
})

test("the crosshair on the head counts; just over a crouched enemy's head does not", () => {
  // At eye height, level: through a standing head, over a crouched one.
  expect(enemyUnderCrosshair(eye, ahead, 120, [someone({ x: 0.15 })], open)).toBe(true)
  expect(enemyUnderCrosshair(eye, ahead, 120, [someone({ crouch: true })], open)).toBe(false)
})

test("the look direction is the one shots leave along", () => {
  const out = { x: 0, y: 0, z: 0 }
  for (const [yaw, pitch] of [[0, 0], [1.2, -0.3], [-2.5, 0.7]]) {
    const d = lookDir(yaw, pitch)
    aimDir(out, yaw, pitch)
    expect(out.x).toBeCloseTo(d.x, 9)
    expect(out.y).toBeCloseTo(d.y, 9)
    expect(out.z).toBeCloseTo(d.z, 9)
  }
  // An enemy to the right (yaw -90°) is under the crosshair once the player turns to it.
  const right = aimDir({ x: 0, y: 0, z: 0 }, -Math.PI / 2, 0)
  expect(enemyUnderCrosshair(eye, right, 120, [someone({ x: 10, z: 0 })], open)).toBe(true)
})

test("the guns fire by themselves; the mescul, the launchers, the Miedi and the mitraie do not", () => {
  const auto = WEAPON_IDS.filter(autoFired)
  expect(auto.sort()).toEqual((["cramar", "doplete", "cjampanili", "mandi", "mulin"] satisfies WeaponId[]).sort())
  // Each has a range to fire within.
  for (const id of auto) expect(WEAPONS[id].range).toBeGreaterThan(0)
})
