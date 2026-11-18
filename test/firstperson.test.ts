import { expect, test } from "bun:test"
import { turretSeat, type TurretSpot } from "../shared/map.ts"
import { lookDir } from "../shared/movement.ts"
import { PRIMARIES, TURRET } from "../shared/weapons.ts"
import { firstPerson, PORTRAIT_FOV, type FirstPersonInput } from "../client/firstperson.ts"

const view = (over: Partial<FirstPersonInput>) =>
  firstPerson({ chosen: "cjampanili", mount: null, alive: true, aim: 0, baseFov: 90, aspect: 16 / 9, look: { yaw: 0, pitch: 0 }, sinceShot: Infinity, mag: 3, reserve: 15, reload: null, ...over })

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

test("mounted, the mitraie is the turret's own gun and points where the gunner looks", () => {
  const v = view({ mount: { turret: 3, spot: SPOT }, look: { yaw: 1.0, pitch: -0.2 } })
  expect(v.mitraie).not.toBeNull()
  expect(v.mitraie!.turret).toBe(3)
  expect(v.mitraie!.yaw).toBeCloseTo(1.0)
  expect(v.mitraie!.pitch).toBeCloseTo(-0.2)
})

test("across the whole arc and past its ends, the mitraie stops at the arc", () => {
  for (let i = 0; i <= 40; i++) {
    const yaw = SPOT.yaw - 2 + i * 0.1
    for (const pitch of [-1, -0.45, 0, 0.55, 1]) {
      const pose = view({ mount: { turret: 0, spot: SPOT }, look: { yaw, pitch } }).mitraie!
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

test("the gunner sits where the simulation puts them for the same look: the seat comes from the look, not from the host", () => {
  for (let i = 0; i <= 40; i++) {
    const yaw = SPOT.yaw - 2 + i * 0.1
    const pose = view({ mount: { turret: 0, spot: SPOT }, look: { yaw, pitch: 0.1 } }).mitraie!
    expect(pose.seat).toEqual(turretSeat(SPOT, yaw))
  }
})

for (const [name, turn] of [["at rest", 0], ["at the left end of the arc", TURRET.arc], ["at the right end of the arc", -TURRET.arc], ["past the left end", TURRET.arc + 0.6]] as const) {
  test(`${name}, the mitraie's pivot is straight in front of the gunner's crosshair`, () => {
    const pose = view({ mount: { turret: 0, spot: SPOT }, look: { yaw: SPOT.yaw + turn, pitch: 0.3 } }).mitraie!
    const [x, , z] = pose.seat
    // In the gunner's own frame: straight ahead along their aim, nothing to either side.
    const ahead = lookDir(pose.yaw, 0)
    const dx = SPOT.at[0] - x
    const dz = SPOT.at[2] - z
    expect(dx * ahead.x + dz * ahead.z).toBeCloseTo(TURRET.seat, 9)
    expect(dx * -ahead.z + dz * ahead.x).toBeCloseTo(0, 9)
    expect(pose.seat[1]).toBe(SPOT.at[1])
  })
}

for (const chosen of PRIMARIES) {
  test(`mounted with the ${chosen} chosen, no carried weapon is drawn: the only gun is the mitraie on its pivot`, () => {
    for (const aim of [0, 1]) {
      const v = view({ chosen, mount: { turret: 0, spot: SPOT }, aim })
      expect(v.drawWeapon).toBe(false)
      expect(v.mitraie).not.toBeNull()
    }
  })
}

test("a shot throws the mitraie back along its barrel for a moment", () => {
  const at = (sinceShot: number) => view({ mount: { turret: 0, spot: SPOT }, look: { yaw: 0.7, pitch: 0 }, sinceShot }).mitraie!
  expect(at(0).recoil).toBeGreaterThan(0.02)
  expect(at(0).recoil).toBeLessThan(0.08)
  expect(at(0.03).recoil).toBeLessThan(at(0).recoil)
  expect(at(0.03).recoil).toBeGreaterThan(0)
  expect(at(0.2).recoil).toBe(0)
  expect(at(Infinity).recoil).toBe(0)
})

test("on foot there is no mitraie", () => {
  expect(view({ chosen: "mulin" }).mitraie).toBeNull()
})

test("a dead player draws no weapon and no crosshair", () => {
  const v = view({ alive: false })
  expect(v.drawWeapon).toBe(false)
  expect(v.crosshair).toBe(false)
})

test("the hen cannon with an empty magazine has no hen at its mouth", () => {
  expect(view({ chosen: "gjalinis", mag: 0, sinceShot: 10 }).henAtMouth).toBe(false)
})

test("with hens left, the next one is back at the mouth only after the post-shot delay", () => {
  // The delay was 0.45 s before this module existed; it must not change.
  expect(view({ chosen: "gjalinis", mag: 2, sinceShot: 0.1 }).henAtMouth).toBe(false)
  expect(view({ chosen: "gjalinis", mag: 2, sinceShot: 0.44 }).henAtMouth).toBe(false)
  expect(view({ chosen: "gjalinis", mag: 2, sinceShot: 0.46 }).henAtMouth).toBe(true)
})

test("reloading an empty hen cannon drops in a full magazine of three hens", () => {
  const v = view({ chosen: "gjalinis", mag: 0, reserve: 15, reload: { progress: 0.5, mag: 0, reserve: 15 } })
  expect(v.reloadHens).toBe(3)
})

test("a partial reload drops in only the hens it loads", () => {
  // two hens still in: one goes in
  expect(view({ chosen: "gjalinis", mag: 2, reload: { progress: 0.5, mag: 2, reserve: 15 } }).reloadHens).toBe(1)
  // empty, but only two left in reserve: two go in
  expect(view({ chosen: "gjalinis", mag: 0, reserve: 2, reload: { progress: 0.5, mag: 0, reserve: 2 } }).reloadHens).toBe(2)
})

test("no hens drop in when the hen cannon is not reloading or not in hand", () => {
  expect(view({ chosen: "gjalinis", mag: 0 }).reloadHens).toBe(0)
  expect(view({ chosen: "gjalinis", mount: { turret: 0, spot: SPOT }, reload: { progress: 0.5, mag: 0, reserve: 15 } }).reloadHens).toBe(0)
  expect(view({ chosen: "doplete", reload: { progress: 0.5, mag: 0, reserve: 15 } }).reloadHens).toBe(0)
})

test("reloading an empty hen cannon ends with a hen at the mouth, before the server's magazine arrives", () => {
  const reloading = (progress: number) => view({ chosen: "gjalinis", mag: 0, reload: { progress, mag: 0, reserve: 15 } })
  expect(reloading(0.1).henAtMouth).toBe(false)
  expect(reloading(0.5).henAtMouth).toBe(false)
  expect(reloading(1).henAtMouth).toBe(true)
})

test("a hen already at the mouth stays there through a partial reload", () => {
  for (const progress of [0, 0.3, 0.6, 1])
    expect(view({ chosen: "gjalinis", mag: 2, reload: { progress, mag: 2, reserve: 15 } }).henAtMouth).toBe(true)
})

/** The distinct values of `hensIn` met while a reload runs from start to end, in order. */
const dropsDuring = (mag: number, reserve: number) => {
  const seen: number[] = []
  for (let i = 0; i <= 200; i++) {
    const n = view({ chosen: "gjalinis", mag, reserve, reload: { progress: i / 200, mag, reserve } }).hensIn
    if (seen.at(-1) !== n) seen.push(n)
  }
  return seen
}

test("a full reload drops its three hens in one at a time", () => {
  expect(dropsDuring(0, 15)).toEqual([0, 1, 2, 3])
})

test("a partial reload drops in one at a time only the hens it loads", () => {
  expect(dropsDuring(2, 15)).toEqual([0, 1])
  expect(dropsDuring(0, 2)).toEqual([0, 1, 2])
})

test("the first-person presentation imports no renderer and no browser code", async () => {
  const source = await Bun.file(new URL("../client/firstperson.ts", import.meta.url)).text()
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])
  expect(imports.every((path) => path.startsWith("../shared/"))).toBe(true)
})

// The field of view by the viewport's shape: landscape as it always was, portrait wider.

const horizontal = (vertical: number, aspect: number) => (2 * Math.atan(Math.tan((vertical * Math.PI) / 360) * aspect) * 180) / Math.PI

for (const chosen of PRIMARIES)
  for (const aim of [0, 0.5, 1])
    test(`in landscape the ${chosen} at aim ${aim} keeps today's field of view`, () => {
      const before = view({ chosen, aim, baseFov: 80 })
      for (const aspect of [1, 16 / 9, 844 / 390]) {
        const v = view({ chosen, aim, baseFov: 80, aspect })
        expect(v.fov).toBe(before.fov)
        expect(v.lookScale).toBe(before.lookScale)
      }
    })

test("in a tablet's portrait the horizontal view widens to the target", () => {
  // 3:4: the player's 80° would leave a 64° slice across; the cap is not reached.
  const v = view({ chosen: "mandi", baseFov: 80, aspect: 3 / 4 })
  expect(horizontal(v.fov, 3 / 4)).toBeCloseTo(PORTRAIT_FOV.horizontal)
  expect(v.fov).toBeLessThan(PORTRAIT_FOV.maxVertical)
  expect(v.fov).toBeGreaterThan(80)
})

test("in a phone's portrait the cap stops the vertical view before the target is reached", () => {
  const aspect = 390 / 844
  const v = view({ chosen: "mandi", baseFov: 80, aspect })
  expect(v.fov).toBeCloseTo(PORTRAIT_FOV.maxVertical)
  expect(horizontal(v.fov, aspect)).toBeLessThan(PORTRAIT_FOV.horizontal)
  // still far wider than the 42° slice across the player's own 80° would give
  expect(horizontal(v.fov, aspect)).toBeGreaterThan(horizontal(80, aspect) + 20)
})

test("in portrait a setting already wider than the widening is left alone", () => {
  const v = view({ chosen: "mandi", baseFov: 120, aspect: 390 / 844 })
  expect(v.fov).toBe(120)
  expect(v.lookScale).toBe(1)
})

for (const chosen of PRIMARIES)
  for (const aim of [0.5, 1])
    test(`in portrait the ${chosen} at aim ${aim} narrows the view by the same ratio as in landscape`, () => {
      const aspect = 390 / 844
      const wide = { hip: view({ chosen, baseFov: 80 }), aimed: view({ chosen, aim, baseFov: 80 }) }
      const tall = { hip: view({ chosen, baseFov: 80, aspect }), aimed: view({ chosen, aim, baseFov: 80, aspect }) }
      expect(tall.aimed.fov / tall.hip.fov).toBeCloseTo(wide.aimed.fov / wide.hip.fov)
      // look sensitivity still slows with the zoom, exactly as in landscape
      expect(tall.aimed.lookScale).toBeCloseTo(wide.aimed.lookScale)
      expect(tall.aimed.lookScale).toBeLessThan(1)
    })

test("the Cjampanili's scope in a phone's portrait zooms four times, as in landscape", () => {
  // 80° to its 20° in landscape; the portrait's 110° to 27.5°.
  const v = view({ chosen: "cjampanili", aim: 1, baseFov: 80, aspect: 390 / 844 })
  expect(v.fov).toBeCloseTo(PORTRAIT_FOV.maxVertical / 4)
  expect(v.lookScale).toBeCloseTo(1 / 4)
  expect(v.scope).toBe(true)
})
