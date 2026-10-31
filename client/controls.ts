/**
 * First-person keyboard and mouse (pointer lock) and controller (DualShock and
 * any pad with the browser's "standard" mapping): look, movement, buttons.
 * Short presses (a click between two ticks) are held until the next tick.
 */
import { BUTTON, type ButtonName } from "../shared/input.ts"
import type { WeaponId } from "../shared/weapons.ts"

const KEYS: Record<string, ButtonName> = {
  Space: "jump",
  ControlLeft: "crouch",
  KeyC: "crouch",
  ShiftLeft: "sprint",
  KeyR: "reload",
  KeyG: "bomb",
  KeyF: "mine",
  KeyE: "use"
}

/**
 * Pad buttons (indices of the "standard" mapping) as keyboard keys:
 * they go through the same paths, so every action works the same.
 * ✕ jump, ◯ crouch, ▢ reload, L1 bomb, R1 mine, R3 mescul, d-pad weapons
 * (down: mount or dismount the turret), Share scoreboard, touchpad armoury. L2/R2 (aim/fire), △ (next weapon),
 * L3 (sprint) and Options (pause) are handled by `poll`.
 */
const PAD_KEYS: Readonly<Record<number, string>> = {
  0: "Space",
  1: "KeyC",
  2: "KeyR",
  4: "KeyG",
  5: "KeyF",
  8: "Tab",
  11: "Digit4",
  12: "Digit1",
  13: "KeyE",
  14: "Digit2",
  15: "Digit3",
  17: "KeyB"
}
const PAD = { triangle: 3, l2: 6, r2: 7, options: 9, l3: 10 } as const
const STICK_DEAD = 0.15
const TRIGGER_ON = 0.35
/** Maximum stick look speed (rad/s), before sensitivity. */
const LOOK_YAW = 3.4
const LOOK_PITCH = 2.4

export interface ControlsHandlers {
  onSlot: (slot: 1 | 2 | 3 | 4) => void
  onLastWeapon: () => void
  onWheel: (dir: 1 | -1) => void
  onKey: (code: string, down: boolean) => void
  /** Options on the pad: opens or closes the match menu. */
  onPause: () => void
}

export class Controls {
  yaw = 0
  pitch = 0
  sensitivity = 1
  invertY = false
  locked = false
  /** Look change since the last frame, for weapon inertia. */
  lookDx = 0
  lookDy = 0
  /** Recoil to add to the pitch (the loop bleeds it off). */
  kick = 0
  private held = new Set<ButtonName>()
  private latched = 0
  private keys = new Set<string>()
  enabled = true
  /** Playing with the pad: no mouse lock to request. */
  padActive = false
  private padHeld = new Set<ButtonName>()
  private padWas: boolean[] = []
  private padMove = { mx: 0, mz: 0 }
  /** L3 turns on sprint: it stays on while the stick is pushed forward. */
  private padSprint = false
  private padIndex: number | null = null

  constructor(private readonly element: HTMLElement, private readonly handlers: ControlsHandlers) {
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === element
      if (this.locked) this.padActive = false
      if (!this.locked) this.releaseAll()
    })
    window.addEventListener("gamepaddisconnected", (e) => {
      if (e.gamepad.index !== this.padIndex) return
      this.padIndex = null
      this.padActive = false
      this.releasePad()
    })
    document.addEventListener("mousemove", (e) => {
      if (!this.locked || !this.enabled) return
      const s = 0.0022 * this.sensitivity * this.zoomScale
      this.yaw -= e.movementX * s
      this.pitch -= e.movementY * s * (this.invertY ? -1 : 1)
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch))
      this.lookDx += e.movementX * s
      this.lookDy += e.movementY * s
    })
    element.addEventListener("mousedown", (e) => {
      if (!this.locked) return
      if (e.button === 0) this.press("fire")
      if (e.button === 2) this.press("aim")
    })
    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.held.delete("fire")
      if (e.button === 2) this.held.delete("aim")
    })
    element.addEventListener("contextmenu", (e) => e.preventDefault())
    element.addEventListener("wheel", (e) => {
      if (this.locked && this.enabled) handlers.onWheel(e.deltaY > 0 ? 1 : -1)
    })
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return
      handlers.onKey(e.code, true)
      if (!this.enabled || !this.locked) return
      if (e.code === "Tab" || e.code === "Space") e.preventDefault()
      this.keys.add(e.code)
      const b = KEYS[e.code]
      if (b) this.press(b)
      this.shortcut(e.code)
    })
    window.addEventListener("keyup", (e) => {
      handlers.onKey(e.code, false)
      this.keys.delete(e.code)
      const b = KEYS[e.code]
      if (b && !Object.entries(KEYS).some(([k, v]) => v === b && this.keys.has(k))) this.held.delete(b)
    })
    window.addEventListener("blur", () => this.releaseAll())
  }

  /** A narrow FOV (scope) slows down aiming. */
  zoomScale = 1

  private press(b: ButtonName) {
    this.held.add(b)
    this.latched |= BUTTON[b]
  }

  /** Number keys and Q: weapons. */
  private shortcut(code: string) {
    if (code === "Digit1") this.handlers.onSlot(1)
    if (code === "Digit2") this.handlers.onSlot(2)
    if (code === "Digit3") this.handlers.onSlot(3)
    if (code === "Digit4") this.handlers.onSlot(4)
    if (code === "KeyQ") this.handlers.onLastWeapon()
  }

  releaseAll() {
    this.held.clear()
    this.keys.clear()
    this.releasePad()
  }

  private releasePad() {
    this.padHeld.clear()
    this.padMove = { mx: 0, mz: 0 }
    this.padSprint = false
  }

  /** The most recently used pad (the one that pressed something). */
  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? []
    if (this.padIndex !== null && pads[this.padIndex]?.connected) return pads[this.padIndex]
    for (const p of pads) if (p?.connected && p.mapping === "standard" && p.buttons.some((b) => b.pressed)) {
      this.padIndex = p.index
      return p
    }
    return null
  }

  /**
   * Reads the pad: call every frame, before the ticks. Look is integrated
   * over the frame time, buttons become presses like keyboard keys.
   * With `playing` false (a menu open) only buttons go through, no look or movement.
   */
  poll(dt: number, playing = true) {
    const p = this.pad()
    if (!p) return
    const down = p.buttons.map((b, i) => (i === PAD.l2 || i === PAD.r2 ? b.value > TRIGGER_ON : b.pressed))
    const edge = (i: number) => !!down[i] && !this.padWas[i]
    const stick = (x: number, y: number) => {
      const len = Math.hypot(x, y)
      if (len < STICK_DEAD) return { x: 0, y: 0 }
      const k = Math.min(1, (len - STICK_DEAD) / (1 - STICK_DEAD)) / len
      return { x: x * k, y: y * k }
    }
    const left = stick(p.axes[0] ?? 0, p.axes[1] ?? 0)
    const right = stick(p.axes[2] ?? 0, p.axes[3] ?? 0)
    if (down.some(Boolean) || left.x || left.y || right.x || right.y) this.padActive = true

    // Options always works (even with the menu open); the rest only in a match and without chat.
    if (edge(PAD.options)) this.handlers.onPause()
    for (const [i, code] of Object.entries(PAD_KEYS)) {
      const n = Number(i)
      if (edge(n)) {
        this.handlers.onKey(code, true)
        if (this.enabled) {
          const b = KEYS[code]
          if (b) this.press(b)
          this.shortcut(code)
        }
      } else if (!down[n] && this.padWas[n]) this.handlers.onKey(code, false)
    }
    const triangle = edge(PAD.triangle)
    const fire = edge(PAD.r2)
    const sprint = edge(PAD.l3)
    this.padWas = down

    this.padHeld.clear()
    if (!this.enabled || !playing) {
      this.releasePad()
      return
    }
    for (const [i, code] of Object.entries(PAD_KEYS)) {
      const b = KEYS[code]
      if (b && down[Number(i)]) this.padHeld.add(b)
    }
    if (down[PAD.r2]) this.padHeld.add("fire")
    if (down[PAD.l2]) this.padHeld.add("aim")
    if (fire) this.latched |= BUTTON.fire
    if (triangle) this.handlers.onWheel(1)

    this.padMove = { mx: left.x, mz: left.y === 0 ? 0 : -left.y }
    if (sprint) this.padSprint = !this.padSprint
    if (this.padMove.mz < 0.3) this.padSprint = false
    if (this.padSprint) this.padHeld.add("sprint")

    // Look: quadratic curve (precise at the centre, fast at the edges), slower with the scope.
    const s = this.sensitivity * this.zoomScale * dt
    const dx = right.x * Math.abs(right.x) * LOOK_YAW * s
    const dy = right.y * Math.abs(right.y) * LOOK_PITCH * s
    this.yaw -= dx
    this.pitch -= dy * (this.invertY ? -1 : 1)
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch))
    this.lookDx += dx
    this.lookDy += dy
  }

  /** Pad vibration (if present and supported): `strong` and `weak` between 0 and 1. */
  rumble(strong: number, weak: number, ms: number) {
    if (!this.padActive || this.padIndex === null) return
    const actuator = navigator.getGamepads?.()[this.padIndex]?.vibrationActuator
    void actuator?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => undefined)
  }

  /** Playing: with the mouse locked or with the pad. */
  get active() {
    return this.locked || this.padActive
  }

  lock() {
    // Without a user gesture the browser refuses: a click on the screen retries.
    const r = this.element.requestPointerLock?.() as Promise<void> | undefined
    r?.catch?.(() => undefined)
  }

  /** Movement: strafe and forward, from WASD/arrows or the left stick (analog). */
  move() {
    if (!this.enabled) return { mx: 0, mz: 0 }
    const k = this.keys
    const mx = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0)
    const mz = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0)
    if (mx || mz) return { mx, mz }
    return this.padMove
  }

  /** The tick's buttons: held ones plus those pressed and already released. */
  buttons() {
    if (!this.enabled) return 0
    const b = this.latched | this.heldButtons()
    this.latched = 0
    return b
  }

  /** The buttons held right now, without consuming short presses (for animations and HUD). */
  heldButtons() {
    if (!this.enabled) return 0
    let b = 0
    for (const name of this.held) b |= BUTTON[name]
    for (const name of this.padHeld) b |= BUTTON[name]
    return b
  }

  isHeld(b: ButtonName) {
    return this.held.has(b) || this.padHeld.has(b)
  }
}

export type { WeaponId }
