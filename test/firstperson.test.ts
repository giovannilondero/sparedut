import { expect, test } from "bun:test"
import { PRIMARIES } from "../shared/weapons.ts"
import { firstPerson, type FirstPersonInput } from "../client/firstperson.ts"

const view = (over: Partial<FirstPersonInput>) =>
  firstPerson({ chosen: "cjampanili", mount: null, alive: true, aim: 0, baseFov: 90, mag: 3, reserve: 15, sinceShot: 10, reload: null, ...over })

test("the Cjampanili shows its scope when fully aimed off a turret", () => {
  expect(view({ aim: 1 }).scope).toBe(true)
})

for (const chosen of PRIMARIES) {
  test(`aiming on a turret with the ${chosen} chosen never shows the scope`, () => {
    const v = view({ chosen, mount: { turret: 0 }, aim: 1 })
    expect(v.inHand).toBe("mitraie")
    expect(v.scope).toBe(false)
    expect(v.crosshair).toBe(true)
    expect(v.drawWeapon).toBe(true)
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
  const v = view({ chosen: "cjampanili", mount: { turret: 2 }, aim: 1, baseFov: 90 })
  expect(v.fov).toBeCloseTo(50)
  expect(v.lookScale).toBeCloseTo(50 / 90)
})

test("halfway into aiming on a turret, the zoom and the look slowdown are halfway too", () => {
  const v = view({ chosen: "mulin", mount: { turret: 0 }, aim: 0.5, baseFov: 90 })
  expect(v.fov).toBeCloseTo(70)
  expect(v.lookScale).toBeCloseTo(70 / 90)
})

test("not aiming on a turret leaves the player's own field of view", () => {
  const v = view({ mount: { turret: 0 }, aim: 0, baseFov: 80 })
  expect(v.fov).toBe(80)
  expect(v.lookScale).toBe(1)
})

test("right after dismounting, aiming the Cjampanili gives its scope again", () => {
  const mounted = view({ mount: { turret: 1 }, aim: 1 })
  const dismounted = view({ mount: null, aim: 1, baseFov: 90 })
  expect(mounted.scope).toBe(false)
  expect(dismounted.inHand).toBe("cjampanili")
  expect(dismounted.scope).toBe(true)
  expect(dismounted.crosshair).toBe(false)
  expect(dismounted.drawWeapon).toBe(false)
  expect(dismounted.fov).toBeCloseTo(20)
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
  expect(view({ chosen: "gjalinis", mount: { turret: 0 }, reload: { progress: 0.5, mag: 0, reserve: 15 } }).reloadHens).toBe(0)
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
