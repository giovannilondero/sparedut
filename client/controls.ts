/**
 * First-person keyboard and mouse (pointer lock), controller (DualShock and
 * any pad with the browser's "standard" mapping) and touch: look, movement, buttons.
 * Short presses (a click between two ticks) are held until the next tick.
 * Whichever device was used last is the active one; switching clears held buttons.
 */
import { BUTTON, type ButtonName } from "../shared/input.ts"
import type { Snapshot } from "../shared/protocol.ts"
import type { WeaponId } from "../shared/weapons.ts"
import { touchLayout, type TouchView } from "./touch.ts"

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
export type CrouchMode = "hold" | "toggle"

const PAD = { triangle: 3, l2: 6, r2: 7, options: 9, l3: 10 } as const
const STICK_DEAD = 0.15
const TRIGGER_ON = 0.35
/** Maximum stick look speed (rad/s), before sensitivity. */
const LOOK_YAW = 3.4
const LOOK_PITCH = 2.4
/** Mouse look (rad per pixel), before sensitivity. */
const MOUSE_LOOK = 0.0022
/** Touch look (rad per CSS pixel dragged), before sensitivity: a thumb travels less than a mouse. */
const TOUCH_LOOK = 0.006
/** Fraction of the stick's radius that reads as zero. */
const TOUCH_DEAD = 0.15
/** Stick tilt from which, pushed forward, the player sprints. */
const TOUCH_SPRINT = 0.95

/** What a finger on the canvas drives, from where it landed until it lifts. */
type FingerRole = "stick" | "look" | "fire"
interface Finger {
  readonly role: FingerRole
  x: number
  y: number
}

/** What the controls follow of the player, from one snapshot. */
export interface Tracked {
  readonly alive: boolean
  readonly mounted: boolean
  /**
   * A new life began since the last snapshot. A match start kills and respawns everyone within
   * one tick, which no snapshot shows as a death; the spawn event is never missed.
   */
  readonly spawned: boolean
}

/** The player `me` in a snapshot, as the controls follow it. */
export const trackedIn = (s: Snapshot, me: string, mounted: boolean): Tracked | null =>
  s.you && { alive: s.you.alive, mounted, spawned: s.ev.some((e) => e.t === "spawn" && e.s === me) }

export interface ControlsHandlers {
  onSlot: (slot: 1 | 2 | 3 | 4) => void
  onLastWeapon: () => void
  onWheel: (dir: 1 | -1) => void
  onKey: (code: string, down: boolean) => void
  /** Options on the pad: opens or closes the match menu. */
  onPause: () => void
  /** The touch controls changed (a finger landed, moved or lifted): redraw them from the view. */
  onTouch?: (view: TouchView) => void
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
  private _crouchMode: CrouchMode = "hold"
  /** With crouch as a toggle: whether the player stays crouched. */
  private crouched = false
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
  /** In a match: touches on the canvas drive the player only then. */
  inMatch = false
  /** Playing with touch: no mouse lock to request. */
  touchActive = false
  private touchHeld = new Set<ButtonName>()
  private readonly touchMove = { mx: 0, mz: 0 }
  private readonly fingers = new Map<number, Finger>()
  /** Look, movement and fire go through (no menu open); the frame loop says so in `poll`. */
  private playing = true
  /** The touch controls as the HUD draws them, updated in place. */
  readonly touchView: TouchView = { stick: { held: false, ox: 0, oy: 0, kx: 0, ky: 0 }, fire: false }

  constructor(private readonly element: HTMLElement, private readonly handlers: ControlsHandlers) {
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === element
      if (this.locked) {
        this.padActive = false
        this.useTouch(false)
      }
      // Touch taking over drops the lock: its fingers stay down.
      if (!this.locked) this.touchActive ? this.releaseKeys() : this.releaseAll()
    })
    window.addEventListener("gamepaddisconnected", (e) => {
      if (e.gamepad.index !== this.padIndex) return
      this.padIndex = null
      this.padActive = false
      this.releasePad()
    })
    document.addEventListener("mousemove", (e) => {
      if (!this.locked || !this.enabled) return
      this.turn(e.movementX * MOUSE_LOOK, e.movementY * MOUSE_LOOK)
    })
    element.addEventListener("pointerdown", (e) => this.fingerDown(e))
    element.addEventListener("pointermove", (e) => this.fingerMove(e))
    element.addEventListener("pointerup", (e) => this.fingerUp(e))
    element.addEventListener("pointercancel", (e) => this.fingerUp(e))
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

  /** Turns the view by a look change already in radians, before sensitivity and zoom. */
  private turn(dx: number, dy: number) {
    const s = this.sensitivity * this.zoomScale
    this.yaw -= dx * s
    this.pitch -= dy * s * (this.invertY ? -1 : 1)
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch))
    this.lookDx += dx * s
    this.lookDy += dy * s
  }

  /**
   * A finger lands on the canvas. The first touch in a match makes touch the active device.
   * The finger keeps the control it landed on until it lifts: fire, else the stick if no
   * other thumb holds it and it landed in the stick's region, else look.
   */
  private fingerDown(e: PointerEvent) {
    if (e.pointerType === "mouse") return this.useTouch(false)
    if (e.pointerType !== "touch" || !this.inMatch || !this.enabled || !this.playing) return
    e.preventDefault()
    this.useTouch(true)
    // A finger that comes down again without an up in between (the up was lost) lets go first.
    this.fingerUp(e)
    const rect = this.element.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const layout = touchLayout(rect)
    const fire = layout.fire
    const region = layout.stick.region
    let role: FingerRole = "look"
    if ((x - fire.x) ** 2 + (y - fire.y) ** 2 <= fire.r ** 2) role = "fire"
    else if (!this.touchView.stick.held && x >= region.left && x <= region.left + region.width && y >= region.top && y <= region.top + region.height) role = "stick"
    this.fingers.set(e.pointerId, { role, x, y })
    this.element.setPointerCapture?.(e.pointerId)
    if (role === "fire") {
      this.touchHeld.add("fire")
      this.latched |= BUTTON.fire
      this.touchView.fire = true
    }
    if (role === "stick") {
      const v = this.touchView.stick
      v.held = true
      v.ox = v.kx = x
      v.oy = v.ky = y
    }
    this.handlers.onTouch?.(this.touchView)
  }

  private fingerMove(e: PointerEvent) {
    const f = this.fingers.get(e.pointerId)
    if (!f) return
    const rect = this.element.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (f.role === "stick") this.tilt(x, y, touchLayout(rect).stick.radius)
    else this.turn((x - f.x) * TOUCH_LOOK, (y - f.y) * TOUCH_LOOK)
    f.x = x
    f.y = y
  }

  /** The stick under the thumb at (x, y): analog movement, and sprint when pushed to its edge while forward. */
  private tilt(x: number, y: number, radius: number) {
    const v = this.touchView.stick
    const dx = x - v.ox
    const dy = y - v.oy
    const len = Math.hypot(dx, dy)
    const k = len <= TOUCH_DEAD * radius ? 0 : Math.min(1, (len / radius - TOUCH_DEAD) / (1 - TOUCH_DEAD)) / len
    // Zero, not minus zero, at rest.
    this.touchMove.mx = k === 0 ? 0 : dx * k
    this.touchMove.mz = k === 0 || dy === 0 ? 0 : -dy * k
    const sprint = len * k >= TOUCH_SPRINT && this.touchMove.mz >= Math.abs(this.touchMove.mx)
    // Sprinting stands up from a toggled crouch, as it does on the keyboard.
    if (sprint && !this.touchHeld.has("sprint")) this.crouched = false
    if (sprint) this.touchHeld.add("sprint")
    else this.touchHeld.delete("sprint")
    const rim = len > radius ? radius / len : 1
    v.kx = v.ox + dx * rim
    v.ky = v.oy + dy * rim
    this.handlers.onTouch?.(this.touchView)
  }

  private fingerUp(e: PointerEvent) {
    const f = this.fingers.get(e.pointerId)
    if (!f) return
    this.fingers.delete(e.pointerId)
    if (f.role === "stick") {
      this.touchView.stick.held = false
      this.touchMove.mx = this.touchMove.mz = 0
      this.touchHeld.delete("sprint")
    }
    if (f.role === "fire" && ![...this.fingers.values()].some((o) => o.role === "fire")) {
      this.touchHeld.delete("fire")
      this.touchView.fire = false
    }
    this.handlers.onTouch?.(this.touchView)
  }

  /**
   * Touch becomes (or stops being) the active device. Taking over releases what the
   * keyboard and the pad held and drops the mouse lock; giving up lets go of every finger.
   */
  private useTouch(on: boolean) {
    if (on === this.touchActive) return
    this.touchActive = on
    if (!on) return this.releaseTouch()
    this.padActive = false
    this.releaseKeys()
    this.releasePad()
    if (this.locked) document.exitPointerLock()
  }

  /** A narrow FOV (scope) slows down aiming. */
  zoomScale = 1

  /** Hold: crouched while the key is down. Toggle: a press crouches, the next stands. */
  get crouchMode() {
    return this._crouchMode
  }

  set crouchMode(mode: CrouchMode) {
    if (mode !== this._crouchMode) this.crouched = false
    this._crouchMode = mode
  }

  /**
   * What the player is doing, from each snapshot (null once out of a match).
   * A toggled crouch never outlives a life, a turret or a match: the player
   * respawns standing and dismounts standing.
   */
  track(player: Tracked | null) {
    if (!player || !player.alive || player.mounted || player.spawned) this.crouched = false
  }

  /**
   * A button pressed now: it reaches the next tick even if released before it.
   * Keys stay held until their keyup; the pad's held buttons are read by `poll`.
   */
  private press(b: ButtonName, pad = false) {
    if (b === "crouch" && this._crouchMode === "toggle") {
      this.crouched = !this.crouched
      return
    }
    // Jumping or sprinting stands up in the same input, so it happens at once.
    if (b === "jump" || b === "sprint") this.crouched = false
    if (!pad) this.held.add(b)
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
    this.releaseKeys()
    this.releasePad()
    this.releaseTouch()
  }

  private releaseKeys() {
    this.held.clear()
    this.keys.clear()
  }

  private releaseTouch() {
    if (this.fingers.size === 0 && this.touchHeld.size === 0) return
    this.fingers.clear()
    this.touchHeld.clear()
    this.touchMove.mx = this.touchMove.mz = 0
    this.touchView.stick.held = false
    this.touchView.fire = false
    this.handlers.onTouch?.(this.touchView)
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
    this.playing = playing
    if (!this.enabled || !playing) this.releaseTouch()
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
    if (down.some(Boolean) || left.x || left.y || right.x || right.y) {
      this.padActive = true
      this.useTouch(false)
    }

    // Options always works (even with the menu open); the rest only in a match and without chat.
    if (edge(PAD.options)) this.handlers.onPause()
    for (const [i, code] of Object.entries(PAD_KEYS)) {
      const n = Number(i)
      if (edge(n)) {
        this.handlers.onKey(code, true)
        if (this.enabled) {
          const b = KEYS[code]
          if (b) this.press(b, true)
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
      if (b && down[Number(i)] && !(b === "crouch" && this._crouchMode === "toggle")) this.padHeld.add(b)
    }
    if (down[PAD.r2]) this.padHeld.add("fire")
    if (down[PAD.l2]) this.padHeld.add("aim")
    if (fire) this.latched |= BUTTON.fire
    if (triangle) this.handlers.onWheel(1)

    this.padMove = { mx: left.x, mz: left.y === 0 ? 0 : -left.y }
    if (sprint) this.padSprint = !this.padSprint
    if (sprint && this.padSprint) this.crouched = false
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

  /** Playing: with the mouse locked, with the pad or with touch. */
  get active() {
    return this.locked || this.padActive || this.touchActive
  }

  /** Asks for the mouse lock, unless the player is on touch: a tap is no reason to lock a mouse. */
  lock() {
    if (this.touchActive) return
    // Without a user gesture the browser refuses: a click on the screen retries.
    const r = this.element.requestPointerLock?.() as Promise<void> | undefined
    r?.catch?.(() => undefined)
  }

  /** Movement: strafe and forward, from WASD/arrows, the left stick or the touch stick (analog). */
  move() {
    if (!this.enabled) return { mx: 0, mz: 0 }
    const k = this.keys
    const mx = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0)
    const mz = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0)
    if (mx || mz) return { mx, mz }
    return this.touchActive ? this.touchMove : this.padMove
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
    for (const name of this.touchHeld) b |= BUTTON[name]
    if (this.crouched) b |= BUTTON.crouch
    return b
  }

  isHeld(b: ButtonName) {
    return this.held.has(b) || this.padHeld.has(b) || this.touchHeld.has(b) || (b === "crouch" && this.crouched)
  }
}

export type { WeaponId }
