/**
 * Where the touch controls sit on the game canvas, from its size alone: the
 * input in `Controls` hit-tests against it and the HUD draws it, so the two
 * never disagree. A fixed stick under the left thumb, and a fire button on
 * each side so that the right thumb only looks; the rest of the screen looks.
 * `Controls.relayout` computes the layout once per canvas size, so rotating
 * the device re-lays the controls without dropping a finger already down.
 */
import { weaponInSlot } from "../shared/sim/rules.ts"
import type { ArsenalValue } from "../shared/sim/schema.ts"
import { SLOTS, type Slot, type WeaponId } from "../shared/weapons.ts"

/** A rectangle in CSS pixels from the canvas's top-left corner. */
export interface Rect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** A round control: centre and touch radius, in CSS pixels. */
export interface Circle {
  readonly x: number
  readonly y: number
  readonly r: number
}

/**
 * The round buttons besides fire. `use` mounts a free turret within reach and is shown only
 * then; while the player is mounted the same place dismounts. `menu`, `board` and `phrases`
 * are the match menu, the scoreboard and the quick phrases (what Esc, Tab and V do).
 */
export const TOUCH_BUTTONS = ["aim", "crouch", "jump", "reload", "bomb", "mine", "use", "menu", "board", "phrases"] as const
export type TouchButton = (typeof TOUCH_BUTTONS)[number]

/** A button's bit in `TouchView.pressed`. */
export const buttonBit = (b: TouchButton) => 1 << TOUCH_BUTTONS.indexOf(b)

/** The safe-area insets of the screen (a notch, rounded corners, a home indicator), in CSS pixels. */
export interface Insets {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

export interface TouchLayout {
  readonly portrait: boolean
  /**
   * The stick stays at `rest`; a thumb that lands in `region` holds it and tilts it towards itself
   * at once, even off-centre. `radius` is the drag for full tilt.
   */
  readonly stick: { readonly region: Rect; readonly radius: number; readonly rest: Circle }
  /** A finger that lands on either fire button fires, and still looks when it drags: one under the right thumb, one above the stick. */
  readonly fire: Circle
  readonly leftFire: Circle
  readonly buttons: { readonly [B in TouchButton]: Circle }
  /** The weapon in hand, its ammunition and its name: a tap is the next weapon, a long press opens the picker. */
  readonly weapon: Rect
  /** The health and armour: on the weapon's row at the left edge in portrait, at the foot of the HUD's column in landscape. */
  readonly vitals: Rect
  /** The picker's entries, top to bottom: room for every weapon slot. */
  readonly picker: readonly Rect[]
  /**
   * Where the rest of the HUD goes: no control, no resting thumb and no vitals inside it. In portrait
   * it is everything above the controls and below the top row; in landscape the column between
   * the controls on the left and those on the right, above the vitals.
   */
  readonly free: Rect
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The sizes the layout is built from, from the safe area: (x0, y0) is its top-left corner. */
interface Frame {
  readonly portrait: boolean
  readonly x0: number
  readonly y0: number
  readonly width: number
  readonly height: number
  readonly short: number
  /** The stick's full-tilt drag. */
  readonly radius: number
  readonly fireR: number
  readonly margin: number
  /** A round button's radius, and the gap between controls. */
  readonly btn: number
  readonly gap: number
  /** How far above the safe area's bottom the stick and fire sit. */
  readonly bottom: number
}

const frameOf = (size: { readonly width: number; readonly height: number }, insets: Insets): Frame => {
  const width = size.width - insets.left - insets.right
  const height = size.height - insets.top - insets.bottom
  const short = Math.min(width, height)
  const fireR = clamp(short * 0.11, 36, 60)
  return {
    portrait: size.height > size.width,
    x0: insets.left,
    y0: insets.top,
    width,
    height,
    short,
    radius: clamp(short * 0.15, 48, 84),
    fireR,
    margin: clamp(short * 0.05, 16, 40),
    btn: clamp(short * 0.065, 24, 34),
    gap: clamp(short * 0.02, 6, 12),
    bottom: fireR * 2.2
  }
}

/** Fire under the right thumb, near the bottom-right corner. */
const rightFire = (f: Frame): Circle => ({ x: f.x0 + f.width - f.margin - f.fireR * 1.6, y: f.y0 + f.height - f.bottom, r: f.fireR })

/** The stick at rest under the left thumb, near the bottom-left corner. */
const stickRest = (f: Frame): Circle => ({ x: f.x0 + f.margin + f.radius * 1.4, y: f.y0 + f.height - f.bottom, r: f.radius })

/**
 * The actions under the right thumb, on two arcs around `fire` opening up and to the left, within
 * a thumb's reach; and the match menu, the scoreboard and the quick phrases in a row in the
 * top-left corner, out of the thumbs' way.
 */
const buttonsAround = (f: Frame, fire: Circle): TouchLayout["buttons"] => {
  const { btn, gap } = f
  const ring = fire.r + btn + gap
  const ring2 = ring + 2 * btn + gap
  const around = (d: number, deg: number, r = btn): Circle => {
    const a = (deg * Math.PI) / 180
    return { x: fire.x + d * Math.cos(a), y: fire.y + d * Math.sin(a), r }
  }
  const small = cornerR(f)
  const corner = (i: number): Circle => ({ x: f.x0 + f.margin + small + i * (2 * small + gap), y: f.y0 + f.margin + small, r: small })
  return {
    crouch: around(ring, 155),
    aim: around(ring, 200),
    jump: around(ring, 245),
    reload: around(ring, 290),
    bomb: around(ring2, 220),
    mine: around(ring2, 255),
    use: around(ring2, 290, btn * 1.1),
    menu: corner(0),
    board: corner(1),
    phrases: corner(2)
  }
}

/** The corner buttons' radius. */
const cornerR = (f: Frame) => Math.max(22, f.btn * 0.9)

const weaponSize = (f: Frame) => ({ width: clamp(f.short * 0.32, 110, 160), height: f.btn * 1.6 })

/** The weapon above the buttons around fire, within the right thumb's reach. */
const weaponAboveButtons = (f: Frame, buttons: TouchLayout["buttons"]): Rect => {
  const w = weaponSize(f)
  return { left: f.x0 + f.width - f.margin - w.width, top: buttons.mine.y - f.btn - f.gap - w.height, ...w }
}

/**
 * The touch layout for a canvas of this size, inside the safe area the insets leave. In portrait
 * the controls take the lower third of the screen and the HUD sits above them.
 */
export const touchLayout = (size: { readonly width: number; readonly height: number }, insets: Insets = NO_INSETS): TouchLayout => {
  const f = frameOf(size, insets)
  const { x0, y0, width, height, gap, radius, portrait } = f
  const rest = stickRest(f)
  const fire = rightFire(f)
  const leftR = f.fireR * 0.85
  const leftFire: Circle = { x: rest.x, y: rest.y - radius - 2 * gap - leftR, r: leftR }
  const buttons = buttonsAround(f, fire)
  const weapon = weaponAboveButtons(f, buttons)
  // The picker opens beside the weapon, towards the middle and downwards, over the controls it covers while open.
  const toRight = weapon.left + weapon.width / 2 < x0 + width / 2
  const step = weapon.height + gap / 1.5
  const pickerLeft = toRight ? weapon.left + weapon.width + gap : weapon.left - gap - weapon.width
  const picker = SLOTS.map((_, i): Rect => ({ left: pickerLeft, top: weapon.top + i * step, width: weapon.width, height: weapon.height }))
  // The controls under the thumbs: the stick at rest, the fire buttons, the buttons around them and the weapon.
  const box = (c: Circle): Rect => ({ left: c.x - c.r, top: c.y - c.r, width: 2 * c.r, height: 2 * c.r })
  const all = [rest, fire, leftFire, ...TOUCH_BUTTONS.map((b) => buttons[b])].map(box).concat([weapon])
  // The controls under the thumbs, in the lower half, and the corner buttons on the top row.
  const low = all.filter((b) => b.top > y0 + height / 2)
  const controlsTop = Math.min(...low.map((b) => b.top))
  const cornersBottom = Math.max(...all.filter((b) => !low.includes(b)).map((b) => b.top + b.height))
  // In landscape the HUD takes the column between everything on the left half and everything on the right.
  const mid = x0 + width / 2
  const left = Math.max(...all.filter((b) => b.left + b.width / 2 < mid).map((b) => b.left + b.width)) + gap
  const right = Math.min(...all.filter((b) => b.left + b.width / 2 >= mid).map((b) => b.left)) - gap
  // Portrait: the vitals take the weapon's row, over the left thumb's controls. Landscape: the foot of the column.
  const vitals: Rect = portrait
    ? { left: x0 + f.margin, top: weapon.top, width: weapon.left - gap - (x0 + f.margin), height: weapon.height }
    : { left, top: y0 + height - gap - weapon.height, width: right - left, height: weapon.height }
  const free: Rect = portrait
    ? { left: x0 + f.margin, top: cornersBottom + gap, width: width - 2 * f.margin, height: controlsTop - gap - (cornersBottom + gap) }
    : { left, top: y0 + gap, width: right - left, height: vitals.top - gap - (y0 + gap) }
  // A thumb holds the stick on and around it.
  const reach = radius * 1.6
  const regionLeft = Math.max(x0, rest.x - reach)
  const regionTop = Math.max(y0, rest.y - reach)
  const region: Rect = { left: regionLeft, top: regionTop, width: rest.x + reach - regionLeft, height: Math.min(y0 + height, rest.y + reach) - regionTop }
  return { portrait, stick: { region, radius, rest }, fire, leftFire, buttons, weapon, vitals, picker, free }
}

export const inCircle = (c: Circle, x: number, y: number) => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r ** 2
export const inRect = (r: Rect, x: number, y: number) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height

/** One weapon the picker lists: the slot that selects it (as the number keys do) and the weapon. */
export interface PickerEntry {
  readonly slot: Slot
  readonly id: WeaponId
}

/** What the picker lists: the weapons the player owns, in slot order. */
export const pickerEntries = (a: ArsenalValue): readonly PickerEntry[] =>
  SLOTS.flatMap((slot) => {
    const id = weaponInSlot(a, slot)
    return id ? [{ slot, id }] : []
  })

/** What the HUD draws of the touch controls; `Controls` updates it in place, so drawing allocates nothing. */
export interface TouchView {
  /** The stick under the left thumb: the knob, from the stick's centre, drawn on the rim at most. */
  readonly stick: { held: boolean; kx: number; ky: number }
  fire: boolean
  /** The buttons under a finger right now, one bit each (`buttonBit`). */
  pressed: number
  /** The aim and crouch toggles, and whether a tap opened the scoreboard. */
  aim: boolean
  crouch: boolean
  board: boolean
  /** What the "use" button does now (mount a turret, dismount, tear off the casot's panel), or null while it is hidden. */
  use: "use" | "dismount" | "tear" | null
  /** The weapon picker's entries while it is open. */
  picker: readonly PickerEntry[] | null
}
