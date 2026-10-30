/**
 * Tastiera e mouse in prima persona (puntatore bloccato) e controller (DualShock e
 * ogni pad con la mappatura "standard" del browser): sguardo, movimento, pulsanti.
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
  KeyG: "bomb",
  KeyF: "mine"
}

/**
 * I tasti del pad (indici della mappatura "standard") come i tasti della tastiera:
 * passano dagli stessi percorsi, così ogni azione funziona uguale.
 * ✕ salta, ◯ accucciati, ▢ ricarica, L1 bomba, R1 mina, R3 mescul, croce armi,
 * Share classifica, touchpad armeria. L2/R2 (mira/spara), △ (arma dopo),
 * L3 (corsa) e Options (pausa) li gestisce `poll`.
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
  13: "KeyQ",
  14: "Digit2",
  15: "Digit3",
  17: "KeyB"
}
const PAD = { triangle: 3, l2: 6, r2: 7, options: 9, l3: 10 } as const
const STICK_DEAD = 0.15
const TRIGGER_ON = 0.35
/** Velocità massima dello sguardo con lo stick (rad/s), prima della sensibilità. */
const LOOK_YAW = 3.4
const LOOK_PITCH = 2.4

export interface ControlsHandlers {
  onSlot: (slot: 1 | 2 | 3 | 4) => void
  onLastWeapon: () => void
  onWheel: (dir: 1 | -1) => void
  onKey: (code: string, down: boolean) => void
  /** Options sul pad: apre o chiude il menu di partita. */
  onPause: () => void
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
  /** Si sta giocando col pad: niente blocco del mouse da chiedere. */
  padActive = false
  private padHeld = new Set<ButtonName>()
  private padWas: boolean[] = []
  private padMove = { mx: 0, mz: 0 }
  /** L3 accende la corsa: resta finché si spinge lo stick in avanti. */
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

  /** Il FOV stretto (cannocchiale) rallenta la mira. */
  zoomScale = 1

  private press(b: ButtonName) {
    this.held.add(b)
    this.latched |= BUTTON[b]
  }

  /** Tasti numerici e Q: le armi. */
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

  /** Il pad usato per ultimo (quello che ha premuto qualcosa). */
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
   * Legge il pad: da chiamare a ogni frame, prima dei tick. Lo sguardo si integra
   * col tempo del frame, i tasti diventano pressioni come quelli della tastiera.
   * Con `playing` falso (un menu aperto) passano solo i tasti, niente sguardo né passi.
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

    // Options va sempre (anche col menu aperto); il resto solo in partita e senza chat.
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

    // Sguardo: curva quadratica (precisione al centro, svelto ai bordi), più lento col cannocchiale.
    const s = this.sensitivity * this.zoomScale * dt
    const dx = right.x * Math.abs(right.x) * LOOK_YAW * s
    const dy = right.y * Math.abs(right.y) * LOOK_PITCH * s
    this.yaw -= dx
    this.pitch -= dy * (this.invertY ? -1 : 1)
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch))
    this.lookDx += dx
    this.lookDy += dy
  }

  /** Vibrazione del pad (se c'è e la supporta): `strong` e `weak` fra 0 e 1. */
  rumble(strong: number, weak: number, ms: number) {
    if (!this.padActive || this.padIndex === null) return
    const actuator = navigator.getGamepads?.()[this.padIndex]?.vibrationActuator
    void actuator?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => undefined)
  }

  /** Si gioca: col mouse bloccato o col pad. */
  get active() {
    return this.locked || this.padActive
  }

  lock() {
    // Senza un gesto dell'utente il browser rifiuta: il clic sullo schermo riprova.
    const r = this.element.requestPointerLock?.() as Promise<void> | undefined
    r?.catch?.(() => undefined)
  }

  /** Movimento: laterale e avanti, da WASD/frecce o dallo stick sinistro (analogico). */
  move() {
    if (!this.enabled) return { mx: 0, mz: 0 }
    const k = this.keys
    const mx = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0)
    const mz = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0)
    if (mx || mz) return { mx, mz }
    return this.padMove
  }

  /** I pulsanti del tick: tenuti più quelli premuti e già rilasciati. */
  buttons() {
    if (!this.enabled) return 0
    const b = this.latched | this.heldButtons()
    this.latched = 0
    return b
  }

  /** I pulsanti tenuti adesso, senza consumare le pressioni brevi (per animazioni e HUD). */
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
