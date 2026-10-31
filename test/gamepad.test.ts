import { beforeAll, expect, test } from "bun:test"
import { BUTTON } from "../shared/input.ts"

/** A fake pad with the "standard" mapping: 17 buttons, 4 axes. */
const pad = {
  index: 0,
  connected: true,
  mapping: "standard",
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 }))
}
const set = (i: number, on: boolean) => (pad.buttons[i] = { pressed: on, value: on ? 1 : 0 })

let Controls: typeof import("../client/controls.ts").Controls
beforeAll(async () => {
  // Controls listens to the DOM: in Bun fake listeners and the fake pad are enough.
  const noop = { addEventListener() {} }
  Object.assign(globalThis, { document: noop, window: noop })
  Object.defineProperty(globalThis.navigator, "getGamepads", { value: () => [pad], configurable: true })
  ;({ Controls } = await import("../client/controls.ts"))
})

const make = () => {
  const calls: string[] = []
  const c = new Controls({ addEventListener() {} } as unknown as HTMLElement, {
    onSlot: (s) => calls.push(`slot${s}`),
    onLastWeapon: () => calls.push("last"),
    onWheel: (d) => calls.push(`wheel${d}`),
    onKey: (code, down) => calls.push(`${code}:${down ? "down" : "up"}`),
    onPause: () => calls.push("pause")
  })
  return { c, calls }
}

test("the left stick moves analogically, the right one turns the view", () => {
  const { c } = make()
  set(0, true) // a button press to get recognised
  pad.axes = [0, -1, 0, 0]
  c.poll(1 / 60)
  set(0, false)
  expect(c.move().mz).toBeCloseTo(1, 5)
  pad.axes = [0.5, 0, 0, 0]
  c.poll(1 / 60)
  const m = c.move()
  expect(m.mz).toBe(0)
  expect(m.mx).toBeGreaterThan(0.3)
  expect(m.mx).toBeLessThan(0.5)
  expect(c.active).toBe(true)
  pad.axes = [0, 0, 1, 0]
  const yaw = c.yaw
  for (let i = 0; i < 60; i++) c.poll(1 / 60)
  // One second fully deflected: about LOOK_YAW radians to the right (yaw decreases).
  expect(yaw - c.yaw).toBeGreaterThan(3)
  pad.axes = [0.05, 0.05, 0.05, 0.05]
  const still = c.yaw
  c.poll(1 / 60)
  expect(c.yaw).toBe(still) // dead zone
  expect(c.move()).toEqual({ mx: 0, mz: 0 })
})

test("R2 fires (even a short tap between two ticks), L2 aims, ✕ jumps", () => {
  const { c } = make()
  set(7, true)
  c.poll(1 / 60)
  set(7, false)
  c.poll(1 / 60)
  expect(c.buttons() & BUTTON.fire).toBe(BUTTON.fire)
  set(6, true)
  set(0, true)
  c.poll(1 / 60)
  const b = c.buttons()
  expect(b & BUTTON.aim).toBe(BUTTON.aim)
  expect(b & BUTTON.jump).toBe(BUTTON.jump)
  // Reading held buttons doesn't consume short presses.
  set(6, false)
  set(0, false)
  set(4, true)
  c.poll(1 / 60)
  set(4, false)
  c.poll(1 / 60)
  c.heldButtons()
  expect(c.buttons() & BUTTON.bomb).toBe(BUTTON.bomb)
})

test("L3 turns on sprint while moving forward", () => {
  const { c } = make()
  pad.axes = [0, -1, 0, 0]
  set(10, true)
  c.poll(1 / 60)
  set(10, false)
  c.poll(1 / 60)
  expect(c.isHeld("sprint")).toBe(true)
  pad.axes = [0, 0, 0, 0]
  c.poll(1 / 60)
  expect(c.isHeld("sprint")).toBe(false)
  pad.axes = [0, -1, 0, 0]
  c.poll(1 / 60)
  expect(c.isHeld("sprint")).toBe(false) // stopping turns it off
  pad.axes = [0, 0, 0, 0]
})

test("Options, Share, d-pad and △ go through the same paths as the keys", () => {
  const { c, calls } = make()
  for (const i of [9, 8, 12, 14, 13, 3]) {
    set(i, true)
    c.poll(1 / 60)
    set(i, false)
    c.poll(1 / 60)
  }
  expect(calls).toEqual(["pause", "Tab:down", "Tab:up", "Digit1:down", "slot1", "Digit1:up", "Digit2:down", "slot2", "Digit2:up", "KeyE:down", "KeyE:up", "wheel1"])
})

test("with the menu open look and movement stop, Options still works", () => {
  const { c, calls } = make()
  pad.axes = [0, -1, 1, 0]
  const yaw = c.yaw
  set(9, true)
  c.poll(1 / 60, false)
  set(9, false)
  expect(c.yaw).toBe(yaw)
  expect(c.move()).toEqual({ mx: 0, mz: 0 })
  expect(calls).toContain("pause")
  pad.axes = [0, 0, 0, 0]
})
