import { beforeAll, expect, test } from "bun:test"
import { BUTTON } from "../shared/input.ts"
import { freshArsenal } from "../shared/sim/rules.ts"
import type { ArsenalValue } from "../shared/sim/schema.ts"
import type { WeaponId } from "../shared/weapons.ts"
import { firstPerson } from "../client/firstperson.ts"
import type { Tracked } from "../client/controls.ts"
import type { Circle, TouchView } from "../client/touch.ts"

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
let TOUCH_BUTTONS: typeof import("../client/touch.ts").TOUCH_BUTTONS
beforeAll(async () => {
  Object.assign(globalThis, { document: doc, window: { addEventListener: on(winListeners) } })
  Object.defineProperty(globalThis.navigator, "getGamepads", { value: () => [pad], configurable: true })
  ;({ Controls } = await import("../client/controls.ts"))
  ;({ touchLayout, TOUCH_BUTTONS } = await import("../client/touch.ts"))
})

/** A player in a match on a phone; each finger is a pointer of type "touch". */
const phone = () => {
  for (const m of [docListeners, winListeners, elListeners]) m.clear()
  doc.pointerLockElement = null
  size.width = 844
  size.height = 390
  const calls: string[] = []
  const views: TouchView[] = []
  const c = new Controls(element as unknown as HTMLElement, {
    onSlot: (s) => calls.push(`slot${s}`),
    onLastWeapon: () => calls.push("last"),
    onWheel: (d) => calls.push(`wheel${d}`),
    onKey: (code, down) => calls.push(`${code}:${down ? "down" : "up"}`),
    onPause: () => calls.push("pause"),
    onTouch: (v) => views.push(v)
  })
  c.inMatch = true
  const finger = (pointerId: number, pointerType = "touch") => ({
    down: (x: number, y: number) => emit(elListeners, "pointerdown", { pointerId, pointerType, clientX: x, clientY: y }),
    move: (x: number, y: number) => emit(elListeners, "pointermove", { pointerId, pointerType, clientX: x, clientY: y }),
    up: (x = 0, y = 0) => emit(elListeners, "pointerup", { pointerId, pointerType, clientX: x, clientY: y }),
    cancel: () => emit(elListeners, "pointercancel", { pointerId, pointerType, clientX: 0, clientY: 0 })
  })
  const layout = () => touchLayout(size)
  /** A quick tap with its own finger on a control of the layout. */
  const tap = (at: Circle, pointerId = 7) => {
    finger(pointerId).down(at.x, at.y)
    finger(pointerId).up(at.x, at.y)
  }
  const view = () => views.at(-1) ?? c.touchView
  return { c, calls, finger, layout, tap, view }
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

/** The player as the controls follow it from a snapshot: alive, on foot, away from turrets. */
const player = (over: Partial<Tracked> = {}): Tracked => ({ alive: true, mounted: false, spawned: false, nearTurret: false, arsenal: freshArsenal("cramar"), ...over })
const centre = (r: { left: number; top: number; width: number; height: number }): Circle => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, r: 0 })

for (const [width, height] of [[390, 844], [844, 390], [360, 640], [640, 360], [768, 1024], [1024, 768]]) {
  test(`at ${width}x${height} every control fits on the canvas and none covers another`, () => {
    const l = touchLayout({ width, height })
    const circles: [string, Circle][] = [["stick", l.stick.rest], ["fire", l.fire], ...Object.entries(l.buttons)]
    const boxes: [string, { left: number; top: number; width: number; height: number }][] = [
      ...circles.map(([n, c]): [string, { left: number; top: number; width: number; height: number }] => [n, { left: c.x - c.r, top: c.y - c.r, width: 2 * c.r, height: 2 * c.r }]),
      ["weapon", l.weapon]
    ]
    for (const [name, b] of [...boxes, ...l.picker.map((p, i): [string, typeof p] => [`picker${i}`, p])]) {
      expect({ name, inside: b.left >= 0 && b.top >= 0 && b.left + b.width <= width && b.top + b.height <= height }).toEqual({ name, inside: true })
    }
    const apart = (a: Circle, b: Circle) => Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r
    for (const [i, [na, a]] of circles.entries()) for (const [nb, b] of circles.slice(i + 1)) expect({ na, nb, apart: apart(a, b) }).toEqual({ na, nb, apart: true })
    const w = l.weapon
    for (const [name, c] of circles) {
      const nx = Math.max(w.left, Math.min(c.x, w.left + w.width))
      const ny = Math.max(w.top, Math.min(c.y, w.top + w.height))
      expect({ name, clear: Math.hypot(c.x - nx, c.y - ny) >= c.r }).toEqual({ name, clear: true })
    }
    // The picker's entries don't cover each other or the name they open from.
    for (const [i, p] of l.picker.entries()) for (const q of [w, ...l.picker.slice(i + 1)]) expect(p.top + p.height <= q.top || q.top + q.height <= p.top || p.left + p.width <= q.left || q.left + q.width <= p.left).toBe(true)
  })
}

test("the layout is computed once per canvas size and shared by the input and the HUD", () => {
  const { c } = phone()
  const first = c.relayout(size)
  expect(c.relayout({ width: 844, height: 390 })).toBe(first)
  const turned = c.relayout({ width: 390, height: 844 })
  expect(turned).not.toBe(first)
  expect(turned.portrait).toBe(true)
})

for (const b of ["jump", "reload", "bomb", "mine"] as const) {
  test(`the ${b} button is held while the finger is on it, and a quick tap still reaches the tick`, () => {
    const { c, finger, layout, tap } = phone()
    const at = layout().buttons[b]
    finger(5).down(at.x, at.y)
    expect(c.buttons() & BUTTON[b]).toBe(BUTTON[b])
    expect(c.isHeld(b)).toBe(true)
    finger(5).up(at.x, at.y)
    expect(c.isHeld(b)).toBe(false)
    expect(c.buttons() & BUTTON[b]).toBe(0)
    tap(at)
    expect(c.buttons() & BUTTON[b]).toBe(BUTTON[b])
    expect(c.buttons() & BUTTON[b]).toBe(0)
    expect(c.yaw).toBe(0) // a button is no look
  })
}

test("aim is a toggle: with the Cjampanili a tap shows the scope, the next tap leaves it", () => {
  const { c, layout, tap, view } = phone()
  const scope = () => firstPerson({ chosen: "cjampanili", mount: null, alive: true, aim: c.isHeld("aim") ? 1 : 0, baseFov: 90, aspect: 844 / 390, look: { yaw: 0, pitch: 0 }, sinceShot: Infinity, mag: 3, reserve: 15, reload: null }).scope
  expect(scope()).toBe(false)
  tap(layout().buttons.aim)
  expect(c.isHeld("aim")).toBe(true) // the finger is gone, aim stays
  expect(c.buttons() & BUTTON.aim).toBe(BUTTON.aim)
  expect(view().aim).toBe(true)
  expect(scope()).toBe(true)
  tap(layout().buttons.aim)
  expect(c.isHeld("aim")).toBe(false)
  expect(view().aim).toBe(false)
  expect(scope()).toBe(false)
})

test("aim lets go when the player dies", () => {
  const { c, layout, tap } = phone()
  c.track(player())
  tap(layout().buttons.aim)
  c.track(player({ alive: false }))
  expect(c.isHeld("aim")).toBe(false)
})

for (const mode of ["hold", "toggle"] as const) {
  test(`crouch is a toggle on touch with the crouch setting on ${mode}, and stays on after the finger lifts`, () => {
    const { c, layout, tap, view } = phone()
    c.crouchMode = mode
    c.track(player())
    tap(layout().buttons.crouch)
    expect(c.isHeld("crouch")).toBe(true)
    expect(c.buttons() & BUTTON.crouch).toBe(BUTTON.crouch)
    expect(c.buttons() & BUTTON.crouch).toBe(BUTTON.crouch)
    expect(view().crouch).toBe(true)
    tap(layout().buttons.crouch)
    expect(c.isHeld("crouch")).toBe(false)
    expect(view().crouch).toBe(false)
  })
}

test("the touch crouch is cleared by what clears the toggled crouch on keyboard and controller", () => {
  const { c, finger, layout, tap, view } = phone()
  c.crouchMode = "hold"
  const crouch = () => {
    tap(layout().buttons.crouch)
    expect(c.isHeld("crouch")).toBe(true)
  }
  c.track(player())
  crouch()
  tap(layout().buttons.jump)
  expect(c.isHeld("crouch")).toBe(false) // jumping stands up

  crouch()
  const r = layout().stick.radius
  finger(1).down(150, 250)
  finger(1).move(150, 250 - r)
  expect(c.isHeld("crouch")).toBe(false) // sprinting stands up
  finger(1).up()

  crouch()
  c.track(player())
  expect(c.isHeld("crouch")).toBe(true) // nothing happened
  c.track(player({ alive: false }))
  expect(c.isHeld("crouch")).toBe(false)
  expect(view().crouch).toBe(false) // the HUD learns it without a touch

  crouch()
  c.track(player({ spawned: true }))
  expect(c.isHeld("crouch")).toBe(false)

  crouch()
  c.track(player({ mounted: true }))
  expect(c.isHeld("crouch")).toBe(false)
  c.track(player())

  crouch()
  c.track(null)
  expect(c.isHeld("crouch")).toBe(false)

  crouch()
  c.crouchMode = "toggle" // changing the setting
  expect(c.isHeld("crouch")).toBe(false)
})

test("the touch crouch and the keyboard's toggled crouch are one latch", () => {
  const { c, layout, tap } = phone()
  c.crouchMode = "toggle"
  c.lock()
  emit(winListeners, "keydown", { code: "KeyC", repeat: false })
  emit(winListeners, "keyup", { code: "KeyC" })
  expect(c.isHeld("crouch")).toBe(true)
  tap(layout().buttons.crouch) // touch takes over, and the same latch stands up
  expect(c.isHeld("crouch")).toBe(false)
})

test("a tap on the weapon's name is the next weapon", () => {
  const { calls, layout, tap } = phone()
  tap(centre(layout().weapon))
  expect(calls).toEqual(["wheel1"])
})

const arsenal = (launcher: boolean): ArsenalValue => ({ ...freshArsenal("cjampanili"), launcher })

for (const launcher of [false, true]) {
  test(`a long press on the name opens a picker of the owned weapons${launcher ? ", with a picked-up Lanciafrico" : ""}, and each one switches`, () => {
    const { c, calls, finger, layout, view } = phone()
    c.track(player({ arsenal: arsenal(launcher) }))
    const owned: WeaponId[] = launcher ? ["cjampanili", "mandi", "lanciafrico", "mescul"] : ["cjampanili", "mandi", "mescul"]
    const slots = launcher ? ["slot1", "slot2", "slot3", "slot4"] : ["slot1", "slot2", "slot4"]
    for (const [i, slot] of slots.entries()) {
      const name = centre(layout().weapon)
      finger(6).down(name.x, name.y)
      c.poll(0.2)
      expect(view().picker).toBe(null) // not yet a long press
      c.poll(0.3)
      expect(view().picker?.map((e) => e.id)).toEqual(owned)
      finger(6).up(name.x, name.y) // lifted on the name: the picker stays open
      expect(calls).toEqual([])
      const entry = centre(layout().picker[i])
      finger(8).down(entry.x, entry.y)
      finger(8).up(entry.x, entry.y)
      expect(calls).toEqual([slot])
      expect(view().picker).toBe(null)
      expect(c.isHeld("fire")).toBe(false) // the tap only picked
      calls.length = 0
    }
  })
}

test("sliding from the name onto an entry and lifting picks it; a tap elsewhere closes the picker and does its own job", () => {
  const { c, calls, finger, layout, view } = phone()
  c.track(player({ arsenal: arsenal(true) }))
  const name = centre(layout().weapon)
  const mescul = centre(layout().picker[3])
  finger(6).down(name.x, name.y)
  c.poll(0.6)
  finger(6).move(mescul.x, mescul.y)
  finger(6).up(mescul.x, mescul.y)
  expect(calls).toEqual(["slot4"])
  expect(c.yaw).toBe(0)

  finger(6).down(name.x, name.y)
  c.poll(0.6)
  finger(6).up(name.x, name.y)
  const fire = layout().fire
  finger(3).down(fire.x, fire.y)
  expect(view().picker).toBe(null)
  expect(c.isHeld("fire")).toBe(true)
})

test("the use button: absent away from turrets, mounts near a free one, dismounts while mounted", () => {
  const { c, layout, tap, view } = phone()
  const use = layout().buttons.use
  c.track(player())
  expect(c.turretControl).toBe(null)
  expect(view().use).toBe(null)
  tap(use)
  expect(c.buttons() & BUTTON.use).toBe(0) // nothing there: the touch only looks

  c.track(player({ nearTurret: true }))
  expect(c.turretControl).toBe("use")
  expect(view().use).toBe("use")
  tap(use)
  expect(c.buttons() & BUTTON.use).toBe(BUTTON.use)

  c.track(player({ mounted: true }))
  expect(c.turretControl).toBe("dismount")
  expect(view().use).toBe("dismount")
  tap(use)
  expect(c.buttons() & BUTTON.use).toBe(BUTTON.use)

  c.track(player({ nearTurret: true, alive: false }))
  expect(c.turretControl).toBe(null)
  c.track(null)
  expect(view().use).toBe(null)
})

test("the match menu, the scoreboard (a toggle) and the quick phrases go through the keyboard's and the controller's paths", () => {
  const { calls, layout, tap, view } = phone()
  tap(layout().buttons.menu)
  expect(calls).toEqual(["pause"])
  calls.length = 0
  tap(layout().buttons.board)
  expect(calls).toEqual(["Tab:down"])
  expect(view().board).toBe(true)
  tap(layout().buttons.board)
  expect(calls).toEqual(["Tab:down", "Tab:up"])
  expect(view().board).toBe(false)
  calls.length = 0
  tap(layout().buttons.phrases)
  expect(calls).toEqual(["KeyV:down", "KeyV:up"])
})

test("a button is drawn pressed only while a finger is on it", () => {
  const { finger, layout, view } = phone()
  const jump = layout().buttons.jump
  finger(5).down(jump.x, jump.y)
  expect(view().pressed).toBe(1 << TOUCH_BUTTONS.indexOf("jump"))
  finger(5).up(jump.x, jump.y)
  expect(view().pressed).toBe(0)
})

test("no touch control opens the text chat", () => {
  const { c, calls, layout, tap } = phone()
  c.track(player({ nearTurret: true }))
  for (const b of TOUCH_BUTTONS) tap(layout().buttons[b])
  tap(centre(layout().weapon))
  expect(calls.filter((k) => k.startsWith("Enter") || k.startsWith("KeyT"))).toEqual([])
})
