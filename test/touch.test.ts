import { beforeAll, expect, test } from "bun:test"
import { BUTTON } from "../shared/input.ts"

type Listener = (e: Record<string, unknown>) => void

/** A fake browser: the listeners Controls registers, so the test can fire events at them. */
const on = (map: Map<string, Listener[]>) => (type: string, fn: Listener) => map.set(type, [...(map.get(type) ?? []), fn])
const emit = (map: Map<string, Listener[]>, type: string, e: Record<string, unknown> = {}) => {
  for (const fn of map.get(type) ?? []) fn({ preventDefault() {}, ...e })
}
const docListeners = new Map<string, Listener[]>()
const winListeners = new Map<string, Listener[]>()
const elListeners = new Map<string, Listener[]>()
const doc = {
  addEventListener: on(docListeners),
  pointerLockElement: null as unknown,
  exitPointerLock() {
    doc.pointerLockElement = null
    emit(docListeners, "pointerlockchange")
  }
}
/** The game canvas of a phone held in landscape. */
const size = { width: 844, height: 390 }
const element = {
  addEventListener: on(elListeners),
  getBoundingClientRect: () => ({ left: 0, top: 0, ...size }),
  setPointerCapture() {},
  requestPointerLock() {
    doc.pointerLockElement = element
    emit(docListeners, "pointerlockchange")
  }
}

/** A fake pad with the "standard" mapping. */
const pad = {
  index: 0,
  connected: true,
  mapping: "standard",
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 }))
}

let Controls: typeof import("../client/controls.ts").Controls
let touchLayout: typeof import("../client/touch.ts").touchLayout
beforeAll(async () => {
  Object.assign(globalThis, { document: doc, window: { addEventListener: on(winListeners) } })
  Object.defineProperty(globalThis.navigator, "getGamepads", { value: () => [pad], configurable: true })
  ;({ Controls } = await import("../client/controls.ts"))
  ;({ touchLayout } = await import("../client/touch.ts"))
})

/** A player in a match on a phone; each finger is a pointer of type "touch". */
const phone = () => {
  for (const m of [docListeners, winListeners, elListeners]) m.clear()
  doc.pointerLockElement = null
  size.width = 844
  size.height = 390
  const calls: string[] = []
  const c = new Controls(element as unknown as HTMLElement, {
    onSlot: (s) => calls.push(`slot${s}`),
    onLastWeapon() {},
    onWheel() {},
    onKey: (code, down) => calls.push(`${code}:${down ? "down" : "up"}`),
    onPause() {}
  })
  c.inMatch = true
  const finger = (pointerId: number, pointerType = "touch") => ({
    down: (x: number, y: number) => emit(elListeners, "pointerdown", { pointerId, pointerType, clientX: x, clientY: y }),
    move: (x: number, y: number) => emit(elListeners, "pointermove", { pointerId, pointerType, clientX: x, clientY: y }),
    up: (x = 0, y = 0) => emit(elListeners, "pointerup", { pointerId, pointerType, clientX: x, clientY: y }),
    cancel: () => emit(elListeners, "pointercancel", { pointerId, pointerType, clientX: 0, clientY: 0 })
  })
  const layout = () => touchLayout(size)
  return { c, calls, finger, layout }
}

test("the left thumb's stick moves analogically, from wherever it lands", () => {
  const { c, finger, layout } = phone()
  const r = layout().stick.radius
  const thumb = finger(1)
  thumb.down(150, 250)
  expect(c.move()).toEqual({ mx: 0, mz: 0 })
  thumb.move(150, 250 - r)
  expect(c.move().mz).toBeCloseTo(1, 5)
  expect(c.move().mx).toBeCloseTo(0, 5)
  thumb.move(150 + r / 2, 250)
  const half = c.move()
  expect(half.mz).toBeCloseTo(0, 5)
  expect(half.mx).toBeGreaterThan(0.3)
  expect(half.mx).toBeLessThan(0.5)
  // Back near the centre: the dead zone.
  thumb.move(152, 251)
  expect(c.move()).toEqual({ mx: 0, mz: 0 })
  thumb.move(150 - r * 3, 250)
  expect(c.move().mx).toBeCloseTo(-1, 5) // beyond the rim is full tilt, no more
  thumb.up()
  expect(c.move()).toEqual({ mx: 0, mz: 0 })
})

test("pushed to its edge while forward, the stick sprints; easing off or turning aside stops", () => {
  const { c, finger, layout } = phone()
  const r = layout().stick.radius
  const thumb = finger(1)
  thumb.down(150, 250)
  thumb.move(150, 250 - r * 0.7)
  expect(c.isHeld("sprint")).toBe(false)
  thumb.move(150, 250 - r * 1.2)
  expect(c.isHeld("sprint")).toBe(true)
  expect(c.buttons() & BUTTON.sprint).toBe(BUTTON.sprint)
  thumb.move(150 + r, 250) // full tilt, but to the side
  expect(c.isHeld("sprint")).toBe(false)
  thumb.move(150, 250 + r) // full tilt backwards
  expect(c.isHeld("sprint")).toBe(false)
  thumb.move(150, 250 - r)
  expect(c.isHeld("sprint")).toBe(true)
  thumb.up()
  expect(c.isHeld("sprint")).toBe(false)
})

test("sprinting from the stick stands up from a toggled crouch", () => {
  const { c, finger, layout } = phone()
  c.crouchMode = "toggle"
  const r = layout().stick.radius
  // Crouched with the keyboard's toggle; the latch outlives the switch to touch.
  c.lock()
  emit(winListeners, "keydown", { code: "KeyC", repeat: false })
  emit(winListeners, "keyup", { code: "KeyC" })
  const thumb = finger(1)
  thumb.down(150, 250)
  thumb.move(150, 250 - r * 0.5)
  expect(c.isHeld("crouch")).toBe(true)
  thumb.move(150, 250 - r)
  expect(c.isHeld("crouch")).toBe(false)
})

test("dragging on the right turns the view, scaled by the sensitivity setting", () => {
  const { c, finger } = phone()
  const look = finger(2)
  look.down(600, 150)
  look.move(700, 150)
  const once = -c.yaw
  expect(once).toBeGreaterThan(0.3) // a 100 px drag right turns right by a fair amount
  expect(c.pitch).toBe(0)
  look.move(700, 100) // up: looks up, as the mouse does
  expect(c.pitch).toBeGreaterThan(0)
  look.up()

  const fast = phone()
  fast.c.sensitivity = 2
  const f = fast.finger(2)
  f.down(600, 150)
  f.move(700, 150)
  expect(-fast.c.yaw).toBeCloseTo(once * 2, 6)
})

test("holding fire shoots, and dragging the same finger keeps turning the view", () => {
  const { c, finger, layout } = phone()
  const fire = layout().fire
  const thumb = finger(3)
  thumb.down(fire.x, fire.y)
  expect(c.buttons() & BUTTON.fire).toBe(BUTTON.fire)
  expect(c.buttons() & BUTTON.fire).toBe(BUTTON.fire) // still held on the next tick
  thumb.move(fire.x - 80, fire.y) // dragged off the button: still firing, turning left
  expect(c.yaw).toBeGreaterThan(0.2)
  expect(c.isHeld("fire")).toBe(true)
  thumb.up()
  expect(c.isHeld("fire")).toBe(false)
  expect(c.buttons() & BUTTON.fire).toBe(0)
})

test("a tap on fire shorter than a tick still fires once", () => {
  const { c, finger, layout } = phone()
  const fire = layout().fire
  const tap = finger(3)
  tap.down(fire.x, fire.y)
  tap.up()
  expect(c.buttons() & BUTTON.fire).toBe(BUTTON.fire)
  expect(c.buttons() & BUTTON.fire).toBe(0)
})

test("two fingers at once keep their own controls; lifting one does not release the other", () => {
  const { c, finger, layout } = phone()
  const r = layout().stick.radius
  const fire = layout().fire
  const left = finger(1)
  const right = finger(2)
  left.down(150, 250)
  left.move(150, 250 - r)
  right.down(fire.x, fire.y)
  right.move(fire.x - 50, fire.y)
  expect(c.move().mz).toBeCloseTo(1, 5)
  expect(c.isHeld("fire")).toBe(true)
  // A third finger in the stick's region does not take over the held stick: it looks.
  const third = finger(4)
  third.down(200, 300)
  third.move(260, 300)
  expect(c.move().mz).toBeCloseTo(1, 5)
  third.up()
  // The right thumb sliding over the left half keeps firing; it never becomes the stick.
  right.move(100, 300)
  expect(c.isHeld("fire")).toBe(true)
  expect(c.move().mz).toBeCloseTo(1, 5)
  left.up()
  expect(c.move()).toEqual({ mx: 0, mz: 0 })
  expect(c.isHeld("fire")).toBe(true)
  left.down(150, 250)
  right.up()
  expect(c.isHeld("fire")).toBe(false)
  left.move(150, 250 - r)
  expect(c.move().mz).toBeCloseTo(1, 5)
  // A cancelled touch (a system gesture) lets go like a lifted one.
  left.cancel()
  expect(c.move()).toEqual({ mx: 0, mz: 0 })
})

test("the first touch in a match makes touch the active device, with no mouse lock", () => {
  const { c, finger } = phone()
  c.inMatch = false
  finger(1).down(150, 250)
  expect(c.active).toBe(false) // a touch on the menu's background is not playing
  finger(1).up()
  c.inMatch = true
  expect(c.active).toBe(false)
  finger(1).down(600, 150)
  expect(c.touchActive).toBe(true)
  expect(c.active).toBe(true)
  c.lock()
  expect(doc.pointerLockElement).toBe(null) // a tap is no reason to lock a mouse
})

test("whichever device was used last is active, and switching clears held buttons", () => {
  const { c, finger, layout } = phone()
  const fire = layout().fire
  // Keyboard and mouse first: Space held.
  c.lock()
  emit(winListeners, "keydown", { code: "Space", repeat: false })
  expect(c.isHeld("jump")).toBe(true)
  // A touch takes over: the lock drops (without opening a menu) and the keyboard's buttons let go.
  finger(3).down(fire.x, fire.y)
  expect(c.touchActive).toBe(true)
  expect(c.locked).toBe(false)
  expect(c.isHeld("jump")).toBe(false)
  expect(c.isHeld("fire")).toBe(true) // the touch that took over is kept
  // The pad: its first press wins over touch, and the touch's fire lets go.
  pad.buttons[0] = { pressed: true, value: 1 }
  c.poll(1 / 60)
  pad.buttons[0] = { pressed: false, value: 0 }
  c.poll(1 / 60)
  expect(c.padActive).toBe(true)
  expect(c.touchActive).toBe(false)
  expect(c.isHeld("fire")).toBe(false)
  finger(3).move(fire.x - 80, fire.y)
  expect(c.yaw).toBe(0) // the lifted-for-good finger no longer looks
  finger(3).up()
  // Touch again, then a mouse click: the mouse wins and may lock again.
  finger(1).down(150, 250)
  expect(c.touchActive).toBe(true)
  expect(c.padActive).toBe(false)
  finger(9, "mouse").down(400, 200)
  expect(c.touchActive).toBe(false)
  c.lock()
  expect(c.locked).toBe(true)
})

test("with a menu open or the chat in use, touches neither move, look nor fire", () => {
  const { c, finger, layout } = phone()
  const r = layout().stick.radius
  const thumb = finger(1)
  thumb.down(150, 250)
  thumb.move(150, 250 - r)
  c.poll(1 / 60, false) // the match menu opens under the thumb
  expect(c.move()).toEqual({ mx: 0, mz: 0 })
  finger(2).down(600, 150)
  finger(2).move(700, 150)
  expect(c.yaw).toBe(0)
  c.poll(1 / 60, true)
  c.enabled = false
  finger(2).down(600, 150)
  finger(2).move(700, 150)
  expect(c.yaw).toBe(0)
})

test("rotating the device re-lays the controls without dropping a finger already down", () => {
  const { c, finger, layout } = phone()
  const r = layout().stick.radius
  const thumb = finger(1)
  thumb.down(150, 250)
  size.width = 390
  size.height = 844
  thumb.move(150, 250 - r)
  expect(c.move().mz).toBeCloseTo(1, 1)
  const portrait = layout()
  expect(portrait.portrait).toBe(true)
  // In portrait the controls keep to the lower part: fire sits in the lower third.
  expect(portrait.fire.y).toBeGreaterThan((844 * 2) / 3)
  finger(3).down(portrait.fire.x, portrait.fire.y)
  expect(c.isHeld("fire")).toBe(true)
})
