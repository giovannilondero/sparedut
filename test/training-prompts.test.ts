/**
 * Training prompts follow the device (#53): every control a step names, as keyboard and mouse, a
 * controller and touch show it, and the prompt following the device used last.
 */
import { beforeAll, expect, test } from "bun:test"
import { DEVICES, type Device } from "../client/device.ts"
import { STRINGS } from "../client/i18n.ts"
import { trainingControl, trainingPrompt } from "../client/prompts.ts"
import type { TrainingView } from "../shared/sim/view.ts"
import { hasControl, stepAvailable } from "../shared/training/controls.ts"
import { STATION_IDS, stepsOf } from "../shared/training/index.ts"
import { CONTROL_IDS } from "../shared/training/station.ts"

/** Every key and mouse button the keyboard prompts name, in either language: none may appear on a controller or on touch. */
const KEY_NAMES = ["Mouse", "WASD", "Spazi", "Spazio", "Ctrl", "Shift", "Rodele", "Rotellina", "1-4", "Tab", "Esc", ...["R", "Q", "B", "G", "F", "E", "V", "C"]]
const kbds = (markup: string) => [...markup.matchAll(/<kbd>(.*?)<\/kbd>/g)].map((m) => m[1] ?? "")
const namesAKey = (markup: string) => kbds(markup).some((k) => KEY_NAMES.some((n) => k === n || k.startsWith(`${n} `)))

test("which devices have a control: a controller has no quick phrases, only the keyboard goes back to the previous weapon, and only it types a chat message", () => {
  for (const c of CONTROL_IDS) expect(hasControl(c, "keyboard")).toBe(true)
  expect(hasControl("phrases", "pad")).toBe(false)
  expect(hasControl("phrases", "touch")).toBe(true)
  expect(hasControl("lastWeapon", "pad")).toBe(false)
  expect(hasControl("lastWeapon", "touch")).toBe(false)
  // Typing a chat message needs a keyboard.
  expect(hasControl("chat", "pad")).toBe(false)
  expect(hasControl("chat", "touch")).toBe(false)
  for (const c of CONTROL_IDS.filter((c) => c !== "phrases" && c !== "lastWeapon" && c !== "chat")) {
    expect(hasControl(c, "pad")).toBe(true)
    expect(hasControl(c, "touch")).toBe(true)
  }
})

for (const [lang, s] of Object.entries(STRINGS)) {
  test(`${lang}: each control is named as the active device shows it`, () => {
    const named = (c: (typeof CONTROL_IDS)[number], d: Device) => trainingControl(s, c, d)
    expect(named("jump", "keyboard")).toMatch(/<kbd>Spazi/)
    expect(named("jump", "pad")).toBe("<kbd>✕</kbd>")
    expect(named("jump", "touch")).toBe("<kbd>▲</kbd>")
    expect(named("crouch", "pad")).toBe("<kbd>◯</kbd>")
    expect(named("crouch", "touch")).toBe("<kbd>▼</kbd>")
    expect(named("reload", "pad")).toBe("<kbd>▢</kbd>")
    expect(named("reload", "touch")).toBe("<kbd>↻</kbd>")
    expect(named("fire", "pad")).toBe("<kbd>R2</kbd>")
    expect(named("aim", "pad")).toBe("<kbd>L2</kbd>")
    expect(named("aim", "touch")).toBe("<kbd>◎</kbd>")
    expect(named("sprint", "pad")).toBe("<kbd>L3</kbd>")
    expect(named("bomb", "pad")).toBe("<kbd>L1</kbd>")
    expect(named("mine", "pad")).toBe("<kbd>R1</kbd>")
    expect(named("cycle", "pad")).toBe("<kbd>△</kbd>")
    expect(named("armoury", "pad")).toBe("<kbd>Touchpad</kbd>")
    expect(named("board", "pad")).toBe("<kbd>Share</kbd>")
    expect(named("board", "touch")).toBe("<kbd>🏆</kbd>")
    expect(named("phrases", "touch")).toBe("<kbd>💬</kbd>")
    expect(named("use", "pad")).toContain("<kbd>⬇</kbd>")
    // Touch names the turret button by the labels it shows, mounting and dismounting.
    expect(named("use", "touch")).toContain(`<kbd>${s.hud.touchUse}</kbd>`)
    expect(named("use", "touch")).toContain(`<kbd>${s.hud.touchLeave}</kbd>`)
    // The armoury on touch is in the match menu, behind ☰.
    expect(named("armoury", "touch")).toContain("<kbd>☰</kbd>")
    // No control where the device has none.
    expect(named("phrases", "pad")).toBeNull()
    expect(named("lastWeapon", "pad")).toBeNull()
    expect(named("lastWeapon", "touch")).toBeNull()
  })

  test(`${lang}: every control a device has is named in markup, and never as a key on a controller or on touch`, () => {
    for (const c of CONTROL_IDS)
      for (const d of DEVICES) {
        const named = trainingControl(s, c, d)
        expect(named === null).toBe(!hasControl(c, d))
        if (named === null) continue
        expect(kbds(named).length).toBeGreaterThan(0)
        if (d !== "keyboard") expect({ c, d, named, key: namesAKey(named) }).toEqual({ c, d, named, key: false })
      }
    // Each device's names are its own.
    for (const c of ["jump", "fire", "use", "board"] as const) expect(new Set(DEVICES.map((d) => trainingControl(s, c, d))).size).toBe(3)
  })

  test(`${lang}: every step's instruction names the active device's control, or says the device has none`, () => {
    for (const station of STATION_IDS)
      for (const step of stepsOf(station))
        for (const d of DEVICES) {
          const view: TrainingView = { tag: "station", station, step, count: 0, target: 1, unlocked: 1, completed: false }
          const prompt = trainingPrompt(s, view, d)
          if (!stepAvailable(station, step, d)) {
            expect(prompt).toContain(s.training.unavailable)
            continue
          }
          expect(prompt).not.toContain(s.training.unavailable)
          if (d !== "keyboard") expect({ station, step, d, key: namesAKey(prompt) }).toEqual({ station, step, d, key: false })
        }
  })

  test(`${lang}: the same step, unchanged, reads differently on each device`, () => {
    const view: TrainingView = { tag: "station", station: "look", step: "walkToMarker", count: 0, target: 1, unlocked: 1, completed: false }
    const prompts = DEVICES.map((d) => trainingPrompt(s, view, d))
    expect(prompts[0]).toContain("WASD")
    expect(new Set(prompts).size).toBe(3)
    // A repeated step keeps its count whatever the device.
    const counted: TrainingView = { ...view, count: 2, target: 5 }
    for (const d of DEVICES) expect(trainingPrompt(s, counted, d)).toContain(s.training.count(2, 5))
  })
}

// The controls class with fake devices: the prompt names the control of whichever device was used last.

type Listener = (e: Record<string, unknown>) => void
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
const element = {
  addEventListener: on(elListeners),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }),
  setPointerCapture() {},
  requestPointerLock() {
    doc.pointerLockElement = element
    emit(docListeners, "pointerlockchange")
  }
}
const pad = { index: 0, connected: true, mapping: "standard", axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) }

let Controls: typeof import("../client/controls.ts").Controls
beforeAll(async () => {
  Object.assign(globalThis, { document: doc, window: { addEventListener: on(winListeners) } })
  Object.defineProperty(globalThis.navigator, "getGamepads", { value: () => [pad], configurable: true })
  ;({ Controls } = await import("../client/controls.ts"))
})

test("the prompt follows the device used last: a key, then the controller, then a finger, then the mouse again", () => {
  for (const m of [docListeners, winListeners, elListeners]) m.clear()
  const c = new Controls(element as unknown as HTMLElement, { onSlot() {}, onLastWeapon() {}, onWheel() {}, onKey: () => false, onPause() {} })
  c.inMatch = true
  const s = STRINGS.fur
  const view: TrainingView = { tag: "station", station: "look", step: "walkToMarker", count: 0, target: 1, unlocked: 1, completed: false }
  const prompt = () => trainingPrompt(s, view, c.device)

  emit(winListeners, "keydown", { code: "KeyW", repeat: false })
  expect(prompt()).toContain("<kbd>WASD</kbd>")
  expect(trainingControl(s, "jump", c.device)).toMatch(/Spazi/)

  pad.buttons[0] = { pressed: true, value: 1 }
  c.poll(1 / 60)
  pad.buttons[0] = { pressed: false, value: 0 }
  c.poll(1 / 60)
  expect(prompt()).toContain(trainingControl(s, "move", "pad") ?? "?")
  expect(trainingControl(s, "jump", c.device)).toBe("<kbd>✕</kbd>")
  expect(trainingControl(s, "phrases", c.device)).toBeNull()

  emit(elListeners, "pointerdown", { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 150 })
  emit(elListeners, "pointerup", { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 150 })
  expect(c.device).toBe("touch")
  expect(namesAKey(prompt())).toBe(false)
  expect(trainingControl(s, "jump", c.device)).toBe("<kbd>▲</kbd>")
  expect(trainingControl(s, "phrases", c.device)).toBe("<kbd>💬</kbd>")

  // A mouse click on the game takes over from touch and locks the mouse.
  emit(elListeners, "pointerdown", { pointerId: 9, pointerType: "mouse", clientX: 200, clientY: 150 })
  c.lock()
  expect(c.device).toBe("keyboard")
  expect(prompt()).toContain("<kbd>WASD</kbd>")
})

/** The Muster's name in each language (the glossary's). */
const MUSTER = { fur: "Adunade", it: "Adunata" } as const

for (const [lang, s] of Object.entries(STRINGS)) {
  test(`${lang}: the armoury station says that in a match the primary is chosen in the Muster`, () => {
    const view: TrainingView = { tag: "station", station: "armoury", step: "choosePrimary", count: 0, target: 1, unlocked: 6, completed: false }
    for (const d of DEVICES) expect(trainingPrompt(s, view, d)).toContain(MUSTER[lang as keyof typeof MUSTER])
  })
}
