import { expect, test } from "bun:test"
import type { TurretSpot } from "../shared/map.ts"
import { PRIMARIES } from "../shared/weapons.ts"
import { firstPerson, type FirstPersonInput } from "../client/firstperson.ts"

const view = (over: Partial<FirstPersonInput>) =>
  firstPerson({ chosen: "cjampanili", mount: null, alive: true, aim: 0, baseFov: 90, look: { yaw: 0, pitch: 0 }, sinceShot: Infinity, ...over })

/** A turret facing north-west, its foot on a 4 m terrace. The arc is 1.35 rad either side, pitch -0.45..0.55. */
const SPOT: TurretSpot = { at: [10, 4, -20], yaw: 0.7 }

test("the Cjampanili shows its scope when fully aimed off a turret", () => {
  expect(view({ aim: 1 }).scope).toBe(true)
})

for (const chosen of PRIMARIES) {
  test(`aiming on a turret with the ${chosen} chosen never shows the scope`, () => {
    const v = view({ chosen, mount: { turret: 0, spot: SPOT }, aim: 1 })
    expect(v.inHand).toBe("mitraie")
    expect(v.scope).toBe(false)
    expect(v.crosshair).toBe(true)
  })
}

for (const chosen of PRIMARIES.filter((p) => p !== "cjampanili")) {
  test(`aiming off a turret with the ${chosen} shows no scope`, () => {
    const v = view({ chosen, aim: 1 })
    expect(v.scope).toBe(false)
    expect(v.crosshair).toBe(true)
  })
}

test("fully aimed on a turret, the view takes the mitraie's light zoom, not the Cjampanili's", () => {
  // The mitraie aims at 50°; the Cjampanili's scope would be 20°.
  const v = view({ chosen: "cjampanili", mount: { turret: 2, spot: SPOT }, aim: 1, baseFov: 90 })
  expect(v.fov).toBeCloseTo(50)
  expect(v.lookScale).toBeCloseTo(50 / 90)
})

test("halfway into aiming on a turret, the zoom and the look slowdown are halfway too", () => {
  const v = view({ chosen: "mulin", mount: { turret: 0, spot: SPOT }, aim: 0.5, baseFov: 90 })
  expect(v.fov).toBeCloseTo(70)
  expect(v.lookScale).toBeCloseTo(70 / 90)
})

test("not aiming on a turret leaves the player's own field of view", () => {
  const v = view({ mount: { turret: 0, spot: SPOT }, aim: 0, baseFov: 80 })
  expect(v.fov).toBe(80)
  expect(v.lookScale).toBe(1)
})

test("right after dismounting, aiming the Cjampanili gives its scope again", () => {
  const mounted = view({ mount: { turret: 1, spot: SPOT }, aim: 1 })
  const dismounted = view({ mount: null, aim: 1, baseFov: 90 })
  expect(mounted.scope).toBe(false)
  expect(dismounted.inHand).toBe("cjampanili")
  expect(dismounted.scope).toBe(true)
  expect(dismounted.crosshair).toBe(false)
  expect(dismounted.drawWeapon).toBe(false)
  expect(dismounted.fov).toBeCloseTo(20)
})

test("mounted, the mitraie sits on its turret's pivot, 1.2 m above the foot, and points where the gunner looks", () => {
  const v = view({ mount: { turret: 3, spot: SPOT }, look: { yaw: 1.0, pitch: -0.2 } })
  expect(v.mitraie).not.toBeNull()
  expect(v.mitraie!.turret).toBe(3)
  expect(v.mitraie!.pivot).toEqual([10, 5.2, -20])
  expect(v.mitraie!.yaw).toBeCloseTo(1.0)
  expect(v.mitraie!.pitch).toBeCloseTo(-0.2)
})

test("across the whole arc and past its ends, the mitraie stays on the same pivot and stops at the arc", () => {
  for (let i = 0; i <= 40; i++) {
    const yaw = SPOT.yaw - 2 + i * 0.1
    for (const pitch of [-1, -0.45, 0, 0.55, 1]) {
      const pose = view({ mount: { turret: 0, spot: SPOT }, look: { yaw, pitch } }).mitraie!
      expect(pose.pivot).toEqual([10, 5.2, -20])
      expect(pose.yaw).toBeGreaterThanOrEqual(0.7 - 1.35 - 1e-9)
      expect(pose.yaw).toBeLessThanOrEqual(0.7 + 1.35 + 1e-9)
      expect(pose.pitch).toBeGreaterThanOrEqual(-0.45)
      expect(pose.pitch).toBeLessThanOrEqual(0.55)
    }
  }
  const left = view({ mount: { turret: 0, spot: SPOT }, look: { yaw: 0.7 + 1.9, pitch: 0.9 } }).mitraie!
  const right = view({ mount: { turret: 0, spot: SPOT }, look: { yaw: 0.7 - 1.9, pitch: -0.9 } }).mitraie!
  expect(left.yaw).toBeCloseTo(2.05)
  expect(left.pitch).toBeCloseTo(0.55)
  expect(right.yaw).toBeCloseTo(-0.65)
  expect(right.pitch).toBeCloseTo(-0.45)
})

test("a look a full turn away still aims the mitraie inside its arc", () => {
  const pose = view({ mount: { turret: 0, spot: SPOT }, look: { yaw: 0.7 + 0.5 + 2 * Math.PI, pitch: 0 } }).mitraie!
  expect(pose.yaw).toBeCloseTo(1.2)
})

for (const chosen of PRIMARIES) {
  test(`mounted with the ${chosen} chosen, no carried weapon is drawn: the only gun is the mitraie on its pivot`, () => {
    for (const aim of [0, 1]) {
      const v = view({ chosen, mount: { turret: 0, spot: SPOT }, aim })
      expect(v.drawWeapon).toBe(false)
      expect(v.mitraie).not.toBeNull()
    }
  })
}

test("a shot throws the mitraie back along its barrel for a moment, without moving its pivot", () => {
  const at = (sinceShot: number) => view({ mount: { turret: 0, spot: SPOT }, look: { yaw: 0.7, pitch: 0 }, sinceShot }).mitraie!
  expect(at(0).recoil).toBeGreaterThan(0.02)
  expect(at(0).recoil).toBeLessThan(0.08)
  expect(at(0.03).recoil).toBeLessThan(at(0).recoil)
  expect(at(0.03).recoil).toBeGreaterThan(0)
  expect(at(0.2).recoil).toBe(0)
  expect(at(Infinity).recoil).toBe(0)
  expect(at(0).pivot).toEqual([10, 5.2, -20])
})

test("on foot there is no mitraie on a pivot", () => {
  expect(view({ chosen: "mulin" }).mitraie).toBeNull()
})

test("a dead player draws no weapon and no crosshair", () => {
  const v = view({ alive: false })
  expect(v.drawWeapon).toBe(false)
  expect(v.crosshair).toBe(false)
})

test("the first-person presentation imports no renderer and no browser code", async () => {
  const source = await Bun.file(new URL("../client/firstperson.ts", import.meta.url)).text()
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])
  expect(imports.every((path) => path.startsWith("../shared/"))).toBe(true)
})
