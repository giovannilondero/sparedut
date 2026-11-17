import { expect, test } from "bun:test"
import { PRIMARIES } from "../shared/weapons.ts"
import { firstPerson, type FirstPersonInput } from "../client/firstperson.ts"

const view = (over: Partial<FirstPersonInput>) =>
  firstPerson({ chosen: "cjampanili", mount: null, alive: true, aim: 0, baseFov: 90, ...over })

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

test("the first-person presentation imports no renderer and no browser code", async () => {
  const source = await Bun.file(new URL("../client/firstperson.ts", import.meta.url)).text()
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])
  expect(imports.every((path) => path.startsWith("../shared/"))).toBe(true)
})
