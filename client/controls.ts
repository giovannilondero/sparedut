/**
 * First-person keyboard and mouse (pointer lock), controller (DualShock and
 * any pad with the browser's "standard" mapping) and touch: look, movement, buttons.
 * Short presses (a click between two ticks) are held until the next tick.
 * Whichever device was used last is the active one; switching clears held buttons.
 */
import { BUTTON, type ButtonName } from "../shared/input.ts"
import type { Snapshot } from "../shared/protocol.ts"
import type { ArsenalValue } from "../shared/sim/schema.ts"
import type { Slot, WeaponId } from "../shared/weapons.ts"
import { pointerDevice, type Device } from "./device.ts"
import { buttonBit, inCircle, inRect, NO_INSETS, pickerEntries, TOUCH_BUTTONS, touchLayout, type Insets, type TouchButton, type TouchLayout, type TouchView } from "./touch.ts"

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
/** Seconds a finger stays on the weapon's name before the picker opens. */
const LONG_PRESS = 0.45

/**
 * What a finger on the canvas drives, from where it landed until it lifts: the stick, look,
 * fire, a button, the weapon's name, or nothing (a tap that picked a weapon).
 */
type FingerRole = "stick" | "look" | "fire" | "weapon" | "spent" | TouchButton
interface Finger {
  readonly role: FingerRole
  x: number
  y: number
}
/** The buttons held only while a finger is on them (aim and crouch are toggles, the rest act once). */
const HELD_BUTTONS = ["jump", "reload", "bomb", "mine", "use"] as const satisfies readonly (TouchButton & ButtonName)[]
const isHeldButton = (r: FingerRole): r is (typeof HELD_BUTTONS)[number] => HELD_BUTTONS.some((b) => b === r)
/** A round button: one of `TOUCH_BUTTONS`, the explicit set, so a new role is never a button by accident. */
const isButton = (r: FingerRole): r is TouchButton => (TOUCH_BUTTONS as readonly FingerRole[]).includes(r)

/** What the controls follow of the player, from one snapshot. */
export interface Tracked {
  readonly alive: boolean
  readonly mounted: boolean
  /**
   * A new life began since the last snapshot. A match start kills and respawns everyone within
   * one tick, which no snapshot shows as a death; the spawn event is never missed.
   */
  readonly spawned: boolean
  /** On foot within reach of a free turret: "use" would mount it. */
  readonly nearTurret: boolean
  /** What the player carries, for the weapon picker. */
  readonly arsenal: ArsenalValue | null
}

/**
 * The player `me` in a snapshot, as the controls follow it. `at.mounted`: on a turret's seat;
 * `at.freeTurret`: a free turret within reach (`freeTurretInReach`), which counts only on foot.
 */
export const trackedIn = (s: Snapshot, me: string, at: { readonly mounted: boolean; readonly freeTurret: boolean }): Tracked | null =>
  s.you && { alive: s.you.alive, mounted: at.mounted, spawned: s.ev.some((e) => e.t === "spawn" && e.s === me), nearTurret: at.freeTurret && !at.mounted, arsenal: s.you.arsenal }

export interface ControlsHandlers {
  onSlot: (slot: Slot) => void
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
  readonly touchView: TouchView = { stick: { held: false, kx: 0, ky: 0 }, fire: false, pressed: 0, aim: false, crouch: false, board: false, use: null, picker: null }
  /** The layout for the canvas's current size: computed once per size, read by the input and the HUD. */
  private layout: TouchLayout | null = null
  /** Where the canvas sat when the last finger landed: moves are measured from there. */
  private originX = 0
  private originY = 0
  /** The finger on the weapon's name, timed for a long press (by `poll`), and whether it opened the picker. */
  private weaponFinger: { finger: Finger; held: number; opened: boolean } | null = null
  /** What the controls follow of the player, from the last snapshot. */
  private tracked: Tracked | null = null
  /** The device used last, anywhere on the page (the menu too). */
  private lastUsed: Device

  /** `primary`: the device to assume before any input, from the main pointer (a finger on a phone). */
  constructor(private readonly element: HTMLElement, private readonly handlers: ControlsHandlers, primary: Device = "keyboard") {
    this.lastUsed = primary
    // Before a match there is nothing to drive, but a tap or a key on the menu says what the player holds.
    document.addEventListener("pointerdown", (e) => (this.lastUsed = pointerDevice(e.pointerType) ?? this.lastUsed), { capture: true })
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
      this.lastUsed = "keyboard"
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
   * The touch layout for a canvas of this size and these safe-area insets: the same object until
   * either changes. Without insets, the last ones given (a finger landing does not measure them).
   */
  relayout(size: { readonly width: number; readonly height: number }, insets: Insets = this.insets): TouchLayout {
    const l = this.layout
    const i = this.insets
    const same = insets.top === i.top && insets.right === i.right && insets.bottom === i.bottom && insets.left === i.left
    if (l && same && this.layoutW === size.width && this.layoutH === size.height) return l
    this.layoutW = size.width
    this.layoutH = size.height
    this.insets = insets
    return (this.layout = touchLayout(size, insets))
  }
  private layoutW = 0
  private layoutH = 0
  private insets: Insets = NO_INSETS

  /**
   * The active device, the one prompts name: touch, the pad or the locked mouse while one drives
   * the match, else whatever the player used last (in the menu too).
   */
  get device(): Device {
    if (this.touchActive) return "touch"
    if (this.padActive) return "pad"
    if (this.locked) return "keyboard"
    return this.lastUsed
  }

  /** What "use" does now: mount a free turret within reach, dismount, or nothing (the control is hidden). */
  get turretControl(): "use" | "dismount" | null {
    const p = this.tracked
    if (!p?.alive) return null
    return p.mounted ? "dismount" : p.nearTurret ? "use" : null
  }

  /**
   * A finger lands on the canvas. The first touch in a match makes touch the active device.
   * The finger keeps the control it landed on until it lifts: an entry of the open picker,
   * fire, a button, the weapon's name, else the stick if no other thumb holds it and it
   * landed in the stick's region, else look.
   */
  private fingerDown(e: PointerEvent) {
    const device = pointerDevice(e.pointerType)
    if (device === "keyboard") return this.useTouch(false)
    // A finger or a pen: the same touch controls.
    if (device !== "touch" || !this.inMatch || !this.enabled || !this.playing) return
    e.preventDefault()
    this.useTouch(true)
    // A finger that comes down again without an up in between (the up was lost) lets go first.
    this.fingerUp(e)
    const rect = this.element.getBoundingClientRect()
    this.originX = rect.left
    this.originY = rect.top
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const layout = this.relayout(rect)
    const role = this.roleAt(layout, x, y)
    const finger: Finger = { role, x, y }
    this.fingers.set(e.pointerId, finger)
    this.element.setPointerCapture?.(e.pointerId)
    const v = this.touchView
    if (role === "fire") {
      this.touchHeld.add("fire")
      this.latched |= BUTTON.fire
      v.fire = true
    } else if (role === "stick") {
      // The stick stays put and tilts towards the thumb at once.
      v.stick.held = true
      this.tilt(x, y, layout.stick)
    } else if (role === "weapon") this.weaponFinger = { finger, held: 0, opened: false }
    else if (isButton(role)) this.buttonDown(role)
    this.redraw()
  }

  /** What a finger landing at (x, y) drives. A touch outside the open picker closes it and does its own job. */
  private roleAt(layout: TouchLayout, x: number, y: number): FingerRole {
    const picker = this.touchView.picker
    if (picker) {
      this.touchView.picker = null
      for (let i = 0; i < picker.length; i++) {
        if (!inRect(layout.picker[i], x, y)) continue
        this.handlers.onSlot(picker[i].slot)
        return "spent"
      }
      if (inRect(layout.weapon, x, y)) return "spent"
    }
    if (inCircle(layout.fire, x, y) || inCircle(layout.leftFire, x, y)) return "fire"
    for (const b of TOUCH_BUTTONS) if (inCircle(layout.buttons[b], x, y) && (b !== "use" || this.turretControl)) return b
    if (inRect(layout.weapon, x, y)) return "weapon"
    const region = layout.stick.region
    if (!this.touchView.stick.held && inRect(region, x, y)) return "stick"
    return "look"
  }

  /** A finger lands on a button: its action, the same one a key or a pad button has. */
  private buttonDown(b: TouchButton) {
    const v = this.touchView
    v.pressed |= buttonBit(b)
    if (isHeldButton(b)) {
      this.press(b, true)
      this.touchHeld.add(b)
    } else if (b === "aim") {
      if (this.touchHeld.has("aim")) this.touchHeld.delete("aim")
      else this.touchHeld.add("aim")
    } else if (b === "crouch") {
      // A toggle whatever the setting says, on the same latch the keyboard's toggle uses.
      this.crouched = !this.crouched
    } else if (b === "menu") this.handlers.onPause()
    else if (b === "board") {
      v.board = !v.board
      this.handlers.onKey("Tab", v.board)
    } else if (b === "phrases") {
      this.handlers.onKey("KeyV", true)
      this.handlers.onKey("KeyV", false)
    }
  }

  /** Brings the toggles and the "use" button into the view and hands it to the HUD. */
  private redraw() {
    const v = this.touchView
    v.aim = this.touchHeld.has("aim")
    v.crouch = this.crouched
    v.use = this.turretControl
    this.handlers.onTouch?.(v)
  }

  private fingerMove(e: PointerEvent) {
    const f = this.fingers.get(e.pointerId)
    if (!f) return
    const x = e.clientX - this.originX
    const y = e.clientY - this.originY
    if (f.role === "stick" && this.layout) this.tilt(x, y, this.layout.stick)
    else if (f.role === "look" || f.role === "fire") this.turn((x - f.x) * TOUCH_LOOK, (y - f.y) * TOUCH_LOOK)
    f.x = x
    f.y = y
  }

  /** The stick under the thumb at (x, y): analog movement, and sprint when pushed to its edge while forward. */
  private tilt(x: number, y: number, { rest, radius }: TouchLayout["stick"]) {
    const v = this.touchView.stick
    const dx = x - rest.x
    const dy = y - rest.y
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
    v.kx = dx * rim
    v.ky = dy * rim
    this.redraw()
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
    const v = this.touchView
    const alone = ![...this.fingers.values()].some((o) => o.role === f.role)
    if (f.role === "fire" && alone) {
      this.touchHeld.delete("fire")
      v.fire = false
    }
    if (f.role === "weapon" && this.weaponFinger?.finger === f) {
      const opened = this.weaponFinger.opened
      this.weaponFinger = null
      if (!opened) this.handlers.onWheel(1)
      // Slid from the name onto an entry of the picker it opened: that weapon.
      else if (v.picker && this.layout) {
        for (let i = 0; i < v.picker.length; i++) {
          if (!inRect(this.layout.picker[i], f.x, f.y)) continue
          this.handlers.onSlot(v.picker[i].slot)
          v.picker = null
          break
        }
      }
    }
    if (isButton(f.role) && alone) {
      v.pressed &= ~buttonBit(f.role)
      if (isHeldButton(f.role)) this.touchHeld.delete(f.role)
    }
    this.redraw()
  }

  /**
   * Touch becomes (or stops being) the active device. Taking over releases what the
   * keyboard and the pad held and drops the mouse lock; giving up lets go of every finger.
   */
  private useTouch(on: boolean) {
    if (on === this.touchActive) return
    this.touchActive = on
    if (!on) {
      // On "hold" only touch can set the crouch latch, and no other device could clear it.
      if (this._crouchMode === "hold" && this.crouched) {
        this.crouched = false
        this.redraw()
      }
      return this.releaseTouch()
    }
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
    const v = this.touchView
    const before = this.crouched
    const aimed = this.touchHeld.has("aim")
    this.tracked = player
    if (!player || !player.alive || player.mounted || player.spawned) this.crouched = false
    // The touch aim toggle does not outlive a life either.
    if (!player || !player.alive || player.spawned) this.touchHeld.delete("aim")
    // The HUD learns what a snapshot changed only when something did.
    if (this.crouched !== before || this.touchHeld.has("aim") !== aimed || this.turretControl !== v.use) this.redraw()
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

  /**
   * Lets go of every finger and touch toggle (aim, the picker, a scoreboard a tap opened). The crouch
   * latch is the keyboard's toggle too: `useTouch` decides whether it outlives touch.
   */
  private releaseTouch() {
    const v = this.touchView
    if (this.fingers.size === 0 && this.touchHeld.size === 0 && !v.board && !v.picker) return
    this.fingers.clear()
    this.touchHeld.clear()
    this.weaponFinger = null
    this.touchMove.mx = this.touchMove.mz = 0
    v.stick.held = false
    v.fire = false
    v.pressed = 0
    v.picker = null
    if (v.board) {
      v.board = false
      this.handlers.onKey("Tab", false)
    }
    this.redraw()
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
    // A finger kept on the weapon's name: the picker of the weapons the player owns.
    const w = this.weaponFinger
    if (w && !w.opened && (w.held += dt) >= LONG_PRESS && this.tracked?.arsenal) {
      w.opened = true
      this.touchView.picker = pickerEntries(this.tracked.arsenal)
      this.redraw()
    }
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
      this.lastUsed = "pad"
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
