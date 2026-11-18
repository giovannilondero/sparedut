import { beforeAll, expect, test } from "bun:test"
import { createBrowserHost } from "../client/host.ts"
import { BUTTON } from "../shared/input.ts"
import { initPhysics } from "../shared/physics.ts"
import { PROTOCOL_VERSION, type ServerMessage } from "../shared/protocol.ts"

type Listener = (e: Record<string, unknown>) => void

/** A fake browser: the listeners Controls registers, so the test can fire keys at it. */
const listeners = new Map<string, Listener[]>()
const target = { addEventListener: (type: string, fn: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), fn]) }
const fire = (type: string, e: Record<string, unknown> = {}) => {
  for (const fn of listeners.get(type) ?? []) fn({ preventDefault() {}, ...e })
}
const element = { addEventListener() {} }
const doc = { ...target, pointerLockElement: null as unknown }

/** A fake pad with the "standard" mapping. */
const pad = {
  index: 0,
  connected: true,
  mapping: "standard",
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 }))
}
const PAD = { cross: 0, circle: 1, l3: 10 } as const

let Controls: typeof import("../client/controls.ts").Controls
let trackedIn: typeof import("../client/controls.ts").trackedIn
beforeAll(async () => {
  Object.assign(globalThis, { document: doc, window: target })
  Object.defineProperty(globalThis.navigator, "getGamepads", { value: () => [pad], configurable: true })
  ;({ Controls, trackedIn } = await import("../client/controls.ts"))
})

/** A player at the keyboard, with the mouse locked on the game. */
const keyboard = (mode: "hold" | "toggle") => {
  listeners.clear()
  const c = new Controls(element as unknown as HTMLElement, { onSlot() {}, onLastWeapon() {}, onWheel() {}, onKey: () => false, onPause() {} })
  c.crouchMode = mode
  doc.pointerLockElement = element
  fire("pointerlockchange")
  const down = (code: string) => fire("keydown", { code, repeat: false })
  const up = (code: string) => fire("keyup", { code })
  const tap = (code: string) => (down(code), up(code))
  return { c, down, up, tap }
}

/** A player with the pad; every press is a poll with the button down and one with it up. */
const controller = (mode: "hold" | "toggle") => {
  listeners.clear()
  doc.pointerLockElement = null
  const c = new Controls(element as unknown as HTMLElement, { onSlot() {}, onLastWeapon() {}, onWheel() {}, onKey: () => false, onPause() {} })
  c.crouchMode = mode
  const set = (i: number, on: boolean) => (pad.buttons[i] = { pressed: on, value: on ? 1 : 0 })
  const down = (i: number) => (set(i, true), c.poll(1 / 60))
  const up = (i: number) => (set(i, false), c.poll(1 / 60))
  const tap = (i: number) => (down(i), up(i))
  return { c, down, up, tap }
}

const crouched = (buttons: number) => (buttons & BUTTON.crouch) !== 0

test("with toggle, one crouch key press crouches and the next stands", () => {
  const { c, tap } = keyboard("toggle")
  tap("KeyC")
  expect(crouched(c.buttons())).toBe(true)
  expect(crouched(c.buttons())).toBe(true)
  tap("ControlLeft")
  expect(crouched(c.buttons())).toBe(false)
})

test("with toggle, one ◯ press crouches and the next stands", () => {
  const { c, down, up, tap } = controller("toggle")
  down(PAD.circle)
  expect(crouched(c.buttons())).toBe(true)
  up(PAD.circle)
  expect(crouched(c.buttons())).toBe(true)
  expect(c.isHeld("crouch")).toBe(true)
  tap(PAD.circle)
  expect(crouched(c.buttons())).toBe(false)
  expect(c.isHeld("crouch")).toBe(false)
})

test("with toggle, a jump press stands the player up and jumps in the same input", () => {
  const k = keyboard("toggle")
  k.tap("KeyC")
  k.c.buttons()
  k.tap("Space")
  const b = k.c.buttons()
  expect(b & BUTTON.jump).toBe(BUTTON.jump)
  expect(crouched(b)).toBe(false)
  expect(crouched(k.c.buttons())).toBe(false)

  const p = controller("toggle")
  p.tap(PAD.circle)
  p.c.buttons()
  p.down(PAD.cross)
  const q = p.c.buttons()
  p.up(PAD.cross)
  expect(q & BUTTON.jump).toBe(BUTTON.jump)
  expect(crouched(q)).toBe(false)
  expect(crouched(p.c.buttons())).toBe(false)
})

test("with toggle, a sprint press stands the player up and sprints in the same input", () => {
  const k = keyboard("toggle")
  k.down("KeyW")
  k.tap("KeyC")
  k.c.buttons()
  k.down("ShiftLeft")
  const b = k.c.buttons()
  expect(b & BUTTON.sprint).toBe(BUTTON.sprint)
  expect(crouched(b)).toBe(false)
  k.up("ShiftLeft")
  k.up("KeyW")

  const p = controller("toggle")
  pad.axes = [0, -1, 0, 0]
  p.tap(PAD.circle)
  p.c.buttons()
  p.down(PAD.l3)
  const q = p.c.buttons()
  p.up(PAD.l3)
  pad.axes = [0, 0, 0, 0]
  expect(q & BUTTON.sprint).toBe(BUTTON.sprint)
  expect(crouched(q)).toBe(false)
})

test("with toggle, the crouch is cleared on respawn, on mounting a turret and on leaving the match", () => {
  const devices = [
    () => {
      const k = keyboard("toggle")
      return { c: k.c, crouch: () => k.tap("KeyC") }
    },
    () => {
      const p = controller("toggle")
      return { c: p.c, crouch: () => p.tap(PAD.circle) }
    }
  ]
  for (const device of devices) {
    const { c, crouch } = device()
    const crouchOn = () => {
      crouch()
      c.buttons()
      expect(c.isHeld("crouch")).toBe(true)
    }
    c.track({ alive: true, mounted: false, spawned: false, nearTurret: false, arsenal: null })

    crouchOn()
    c.track({ alive: true, mounted: false, spawned: false, nearTurret: false, arsenal: null })
    expect(c.isHeld("crouch")).toBe(true) // nothing happened: still crouched
    c.track({ alive: false, mounted: false, spawned: false, nearTurret: false, arsenal: null })
    c.track({ alive: true, mounted: false, spawned: false, nearTurret: false, arsenal: null })
    expect(crouched(c.buttons())).toBe(false)

    crouchOn()
    c.track({ alive: true, mounted: true, spawned: false, nearTurret: false, arsenal: null })
    expect(crouched(c.buttons())).toBe(false)
    c.track({ alive: true, mounted: false, spawned: false, nearTurret: false, arsenal: null })

    crouchOn()
    c.track(null)
    expect(crouched(c.buttons())).toBe(false)
  }
})

test("hold is the default and crouches only while the key or ◯ is held, as before", () => {
  listeners.clear()
  expect(new Controls(element as unknown as HTMLElement, { onSlot() {}, onLastWeapon() {}, onWheel() {}, onKey: () => false, onPause() {} }).crouchMode).toBe("hold")

  const k = keyboard("hold")
  k.down("KeyC")
  expect(crouched(k.c.buttons())).toBe(true)
  k.down("ControlLeft")
  k.up("KeyC")
  expect(crouched(k.c.buttons())).toBe(true) // the other crouch key is still down
  k.tap("Space")
  expect(crouched(k.c.buttons())).toBe(true) // jumping doesn't release a held crouch
  k.up("ControlLeft")
  expect(crouched(k.c.buttons())).toBe(false)
  k.tap("KeyC")
  expect(crouched(k.c.buttons())).toBe(true) // a tap between two ticks still reaches the tick
  expect(crouched(k.c.buttons())).toBe(false)
  k.down("KeyC")
  k.c.track(null)
  expect(crouched(k.c.buttons())).toBe(true) // only a toggled crouch is cleared
  k.up("KeyC")

  const p = controller("hold")
  p.down(PAD.circle)
  expect(crouched(p.c.buttons())).toBe(true)
  expect(crouched(p.c.buttons())).toBe(true)
  p.up(PAD.circle)
  expect(crouched(p.c.buttons())).toBe(false)
})

test("with toggle, holding ◯ down for a second press doesn't keep the player crouched", () => {
  const p = controller("toggle")
  p.tap(PAD.circle)
  p.down(PAD.circle)
  expect(crouched(p.c.buttons())).toBe(false)
  p.up(PAD.circle)
})

test("with toggle, the crouch is cleared when a match start respawns everyone, though no snapshot shows the player dead", async () => {
  await initPhysics()
  let clock = 0
  const hub = createBrowserHost(() => clock)
  const got: ServerMessage[] = []
  const peer = { network: { key: "browser", lan: true }, send: (d: string) => got.push(JSON.parse(d) as ServerMessage), id: null, name: "", room: null }
  hub.open(peer)
  const say = (msg: object) => hub.message(peer, JSON.stringify(msg))
  say({ t: "hello", name: "Toni", version: PROTOCOL_VERSION })
  say({ t: "create", mode: "bataie", map: "glemone", minutes: 10, reach: "offline", bots: 0, level: "pari", ff: false, primary: "cramar" })

  const joined = got.find((m) => m.t === "joined")?.you ?? ""
  const { c, tap } = keyboard("toggle")
  const deadSeen: boolean[] = []
  /** The game's side: every snapshot that arrives reaches the controls. */
  const play = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      clock += 1000 / 60 + 1e-6
      hub.update()
      for (const m of got.splice(0)) {
        if (m.t !== "snap") continue
        deadSeen.push(m.you?.alive === false)
        c.track(trackedIn(m, joined, { mounted: false, freeTurret: false }))
      }
    }
  }
  play(30)
  tap("KeyC")
  c.buttons()
  expect(c.isHeld("crouch")).toBe(true)
  deadSeen.length = 0
  say({ t: "start" })
  play(30)
  expect(deadSeen.some(Boolean)).toBe(false) // the snapshots never show the respawn as a death
  expect(crouched(c.buttons())).toBe(false)
})
