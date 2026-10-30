import { beforeAll, expect, test } from "bun:test"
import { BUTTON } from "../shared/input.ts"

/** Un pad finto con la mappatura "standard": 17 tasti, 4 assi. */
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
  // Controls ascolta il DOM: in Bun bastano ascoltatori finti e il pad finto.
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

test("lo stick sinistro muove in analogico, il destro gira lo sguardo", () => {
  const { c } = make()
  set(0, true) // un tasto per farsi riconoscere
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
  // Un secondo a fondo: circa LOOK_YAW radianti verso destra (yaw cala).
  expect(yaw - c.yaw).toBeGreaterThan(3)
  pad.axes = [0.05, 0.05, 0.05, 0.05]
  const still = c.yaw
  c.poll(1 / 60)
  expect(c.yaw).toBe(still) // zona morta
  expect(c.move()).toEqual({ mx: 0, mz: 0 })
})

test("R2 spara (anche un colpo breve fra due tick), L2 mira, ✕ salta", () => {
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
  // Leggere i tenuti non consuma le pressioni brevi.
  set(6, false)
  set(0, false)
  set(4, true)
  c.poll(1 / 60)
  set(4, false)
  c.poll(1 / 60)
  c.heldButtons()
  expect(c.buttons() & BUTTON.bomb).toBe(BUTTON.bomb)
})

test("L3 accende la corsa finché si va avanti", () => {
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
  expect(c.isHeld("sprint")).toBe(false) // fermarsi la spegne
  pad.axes = [0, 0, 0, 0]
})

test("Options, Share, croce e △ passano dagli stessi percorsi dei tasti", () => {
  const { c, calls } = make()
  for (const i of [9, 8, 12, 14, 13, 3]) {
    set(i, true)
    c.poll(1 / 60)
    set(i, false)
    c.poll(1 / 60)
  }
  expect(calls).toEqual(["pause", "Tab:down", "Tab:up", "Digit1:down", "slot1", "Digit1:up", "Digit2:down", "slot2", "Digit2:up", "KeyQ:down", "last", "KeyQ:up", "wheel1"])
})

test("col menu aperto lo sguardo e i passi si fermano, Options va ancora", () => {
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
