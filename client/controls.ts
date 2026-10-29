/**
 * Tastiera e mouse in prima persona: puntatore bloccato, sguardo, pulsanti.
 * Le pressioni brevi (un clic fra due tick) vengono trattenute fino al tick dopo.
 */
import { BUTTON, type ButtonName } from "../shared/input.ts"
import type { WeaponId } from "../shared/weapons.ts"

const KEYS: Record<string, ButtonName> = {
  Space: "jump",
  ControlLeft: "crouch",
  KeyC: "crouch",
  ShiftLeft: "sprint",
  KeyR: "reload",
  KeyG: "bomb"
}

export interface ControlsHandlers {
  onSlot: (slot: 1 | 2 | 3 | 4) => void
  onLastWeapon: () => void
  onWheel: (dir: 1 | -1) => void
  onKey: (code: string, down: boolean) => void
}

export class Controls {
  yaw = 0
  pitch = 0
  sensitivity = 1
  invertY = false
  locked = false
  /** Variazione di sguardo dall'ultimo frame, per l'inerzia dell'arma. */
  lookDx = 0
  lookDy = 0
  /** Rinculo da aggiungere al beccheggio (lo smaltisce il loop). */
  kick = 0
  private held = new Set<ButtonName>()
  private latched = 0
  private keys = new Set<string>()
  enabled = true

  constructor(private readonly element: HTMLElement, private readonly handlers: ControlsHandlers) {
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === element
      if (!this.locked) this.releaseAll()
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
      if (e.code === "Digit1") handlers.onSlot(1)
      if (e.code === "Digit2") handlers.onSlot(2)
      if (e.code === "Digit3") handlers.onSlot(3)
      if (e.code === "Digit4") handlers.onSlot(4)
      if (e.code === "KeyQ") handlers.onLastWeapon()
    })
    window.addEventListener("keyup", (e) => {
      handlers.onKey(e.code, false)
      this.keys.delete(e.code)
      const b = KEYS[e.code]
      if (b && !Object.entries(KEYS).some(([k, v]) => v === b && this.keys.has(k))) this.held.delete(b)
    })
    window.addEventListener("blur", () => this.releaseAll())
  }

  /** Il FOV stretto (cannocchiale) rallenta la mira. */
  zoomScale = 1

  private press(b: ButtonName) {
    this.held.add(b)
    this.latched |= BUTTON[b]
  }

  releaseAll() {
    this.held.clear()
    this.keys.clear()
  }

  lock() {
    // Senza un gesto dell'utente il browser rifiuta: il clic sullo schermo riprova.
    const r = this.element.requestPointerLock?.() as Promise<void> | undefined
    r?.catch?.(() => undefined)
  }

  /** Movimento: laterale e avanti, da WASD/frecce. */
  move() {
    if (!this.enabled) return { mx: 0, mz: 0 }
    const k = this.keys
    const mx = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0)
    const mz = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0)
    return { mx, mz }
  }

  /** I pulsanti del tick: tenuti più quelli premuti e già rilasciati. */
  buttons() {
    if (!this.enabled) return 0
    let b = this.latched
    for (const name of this.held) b |= BUTTON[name]
    this.latched = 0
    return b
  }

  isHeld(b: ButtonName) {
    return this.held.has(b)
  }
}

export type { WeaponId }
