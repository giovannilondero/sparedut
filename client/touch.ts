/**
 * Where the touch controls sit on the game canvas, from its size alone: the
 * input in `Controls` hit-tests against it and the HUD draws it, so the two
 * never disagree. Three layouts are under trial (A, B, C, below); in each the
 * rest of the screen looks. `Controls.relayout` computes the layout once per
 * canvas size, so rotating the device re-lays the controls without dropping
 * a finger already down.
 */
import { owned } from "../shared/sim/rules.ts"
import type { ArsenalValue } from "../shared/sim/schema.ts"
import type { WeaponId } from "../shared/weapons.ts"

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

/**
 * The three touch layouts under trial (spec #20), chosen with `?touch=a|b|c`. Once the owner picks
 * one (#35), the other two functions below, their entries here and their tests are deleted, with the
 * parameter (#36). `Controls` and the HUD read only the layout's data (`stick.fixed`, `leftFire`,
 * `autoFire`), never which one it is.
 */
export const TOUCH_LAYOUT_IDS = ["a", "b", "c"] as const
export type TouchLayoutId = (typeof TOUCH_LAYOUT_IDS)[number]

/** The layout `?touch=` names in a page address's query (`location.search`); A without one or with an unknown one. */
export const touchLayoutFromUrl = (search: string): TouchLayoutId => {
  const q = new URLSearchParams(search).get("touch")?.toLowerCase()
  return TOUCH_LAYOUT_IDS.find((id) => id === q) ?? "a"
}

export interface TouchLayout {
  readonly portrait: boolean
  /**
   * Where a thumb starts the stick; `radius` is the drag for full tilt. A floating stick centres
   * where the thumb lands; a fixed one stays at `rest`, so a thumb landing off-centre tilts it at once.
   */
  readonly stick: { readonly region: Rect; readonly radius: number; readonly rest: Circle; readonly fixed: boolean }
  /**
   * A finger that lands here fires, and still looks when it drags. With `autoFire` this is the
   * manual fire, shown only while the weapon in hand is one that does not fire by itself.
   */
  readonly fire: Circle
  /** A second fire button, under the left thumb (layout B), or null. */
  readonly leftFire: Circle | null
  /** The weapon fires by itself while the crosshair rests on an enemy within its range (layout C). */
  readonly autoFire: boolean
  readonly buttons: { readonly [B in TouchButton]: Circle }
  /** The weapon's name: a tap is the next weapon, a long press opens the picker. */
  readonly weapon: Rect
  /** The picker's entries, top to bottom: room for every weapon slot. */
  readonly picker: readonly Rect[]
  /**
   * Where the HUD goes: no control and no resting thumb inside it. In portrait it is everything
   * above the controls and below the corner buttons; in landscape the column between the controls
   * on the left and those on the right.
   */
  readonly free: Rect
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The sizes every layout shares, from the safe area: (x0, y0) is its top-left corner. */
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

/** Fire under the right thumb, near the bottom-right corner, with radius `r`. */
const rightFire = (f: Frame, r = f.fireR): Circle => ({ x: f.x0 + f.width - f.margin - f.fireR * 1.6, y: f.y0 + f.height - f.bottom, r })

/** The stick at rest under the left thumb, near the bottom-left corner. */
const stickRest = (f: Frame): Circle => ({ x: f.x0 + f.margin + f.radius * 1.4, y: f.y0 + f.height - f.bottom, r: f.radius })

/**
 * The actions under the right thumb, on two arcs around `fire` opening up and to the left, within
 * a thumb's reach; and the match menu, the scoreboard and the quick phrases in a row in the
 * top-left corner, out of the thumbs' way.
 */
const buttonsAround = (f: Frame, fire: Circle): TouchLayout["buttons"] => {
  const { btn, gap } = f
  // As far out as around a full-size fire, so that a smaller fire leaves them apart.
  const ring = Math.max(fire.r, f.fireR) + btn + gap
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

/** The weapon's name above the stick (left), so that in portrait the controls keep to the lower third. */
const nameAboveStick = (f: Frame, rest: Circle): Rect => {
  const w = weaponSize(f)
  return { left: f.x0 + f.margin, top: rest.y - f.radius - f.gap - w.height, ...w }
}

/** The weapon's name above the buttons around fire (right). */
const nameAboveButtons = (f: Frame, buttons: TouchLayout["buttons"]): Rect => {
  const w = weaponSize(f)
  return { left: f.x0 + f.width - f.margin - w.width, top: buttons.mine.y - f.btn - f.gap - w.height, ...w }
}

/** The weapon's name in the top-right corner, on the row of the corner buttons. */
const nameInCorner = (f: Frame): Rect => {
  const w = weaponSize(f)
  return { left: f.x0 + f.width - f.margin - w.width, top: f.y0 + f.margin + cornerR(f) - w.height / 2, ...w }
}

/** What a layout places; `finish` derives the rest (the picker, the stick's region, the HUD's free area). */
interface Placed {
  readonly rest: Circle
  readonly fixed: boolean
  readonly fire: Circle
  readonly leftFire: Circle | null
  readonly autoFire: boolean
  readonly buttons: TouchLayout["buttons"]
  readonly weapon: Rect
}

const finish = (f: Frame, p: Placed): TouchLayout => {
  const { x0, y0, width, height, gap, radius, portrait } = f
  const { rest, fire, leftFire, buttons, weapon } = p
  // The picker opens beside the name, towards the middle and downwards, over the controls it covers while open.
  const toRight = weapon.left + weapon.width / 2 < x0 + width / 2
  const step = weapon.height + gap / 1.5
  const pickerLeft = toRight ? weapon.left + weapon.width + gap : weapon.left - gap - weapon.width
  const picker = [0, 1, 2, 3].map((i): Rect => ({ left: pickerLeft, top: weapon.top + i * step, width: weapon.width, height: weapon.height }))
  // The controls under the thumbs: the stick at rest, fire, the buttons around them and the name.
  const box = (c: Circle): Rect => ({ left: c.x - c.r, top: c.y - c.r, width: 2 * c.r, height: 2 * c.r })
  const all = [rest, fire, ...(leftFire ? [leftFire] : []), ...TOUCH_BUTTONS.map((b) => buttons[b])].map(box).concat([weapon])
  // The controls under the thumbs, in the lower half, and those on the top row (the corner buttons, maybe the name).
  const low = all.filter((b) => b.top > y0 + height / 2)
  const controlsTop = Math.min(...low.map((b) => b.top))
  const cornersBottom = Math.max(...all.filter((b) => !low.includes(b)).map((b) => b.top + b.height))
  // In landscape the HUD takes the column between everything on the left half and everything on the right.
  const mid = x0 + width / 2
  const left = Math.max(...all.filter((b) => b.left + b.width / 2 < mid).map((b) => b.left + b.width)) + gap
  const right = Math.min(...all.filter((b) => b.left + b.width / 2 >= mid).map((b) => b.left)) - gap
  const free: Rect = portrait
    ? { left: x0 + f.margin, top: cornersBottom + gap, width: width - 2 * f.margin, height: controlsTop - gap - (cornersBottom + gap) }
    : { left, top: y0 + gap, width: right - left, height: height - 2 * gap }
  // A floating stick starts anywhere in the lower left (in portrait only among the controls, below
  // the HUD); a fixed one only on and around itself.
  const top = portrait ? controlsTop : y0 + height * 0.2
  const reach = radius * 1.6
  const region: Rect = p.fixed
    ? { left: Math.max(x0, rest.x - reach), top: Math.max(y0, rest.y - reach), width: rest.x + reach - Math.max(x0, rest.x - reach), height: Math.min(y0 + height, rest.y + reach) - Math.max(y0, rest.y - reach) }
    : { left: x0, top, width: width / 2, height: y0 + height - top }
  return { portrait, stick: { region, radius, rest, fixed: p.fixed }, fire, leftFire, autoFire: p.autoFire, buttons, weapon, picker, free }
}

/** Layout A: the stick appears where the left thumb lands; one fire button under the right thumb, the other actions around it. */
export const layoutA = (size: { readonly width: number; readonly height: number }, insets: Insets = NO_INSETS): TouchLayout => {
  const f = frameOf(size, insets)
  const rest = stickRest(f)
  const fire = rightFire(f)
  const buttons = buttonsAround(f, fire)
  const weapon = f.portrait ? nameAboveStick(f, rest) : nameAboveButtons(f, buttons)
  return finish(f, { rest, fixed: false, fire, leftFire: null, autoFire: false, buttons, weapon })
}

/**
 * Layout B: a fixed stick, and a fire button on each side: one above the stick for the left thumb,
 * so the right thumb only looks, and one under the right thumb as in A.
 */
export const layoutB = (size: { readonly width: number; readonly height: number }, insets: Insets = NO_INSETS): TouchLayout => {
  const f = frameOf(size, insets)
  const rest = stickRest(f)
  const fire = rightFire(f)
  const leftR = f.fireR * 0.85
  const leftFire: Circle = { x: rest.x, y: rest.y - f.radius - 2 * f.gap - leftR, r: leftR }
  const buttons = buttonsAround(f, fire)
  // In portrait the left column (stick, fire) leaves no room for the name under the HUD: it goes on the top row.
  return finish(f, { rest, fixed: true, fire, leftFire, autoFire: false, buttons, weapon: f.portrait ? nameInCorner(f) : nameAboveButtons(f, buttons) })
}

/**
 * Layout C, made for portrait: a fixed stick; the weapon fires by itself while the crosshair rests
 * on an enemy within its range, so no fire button sits under the right thumb, which only looks.
 * A small manual fire takes fire's place for the weapons that do not fire by itself; the other
 * actions sit closer around it.
 */
export const layoutC = (size: { readonly width: number; readonly height: number }, insets: Insets = NO_INSETS): TouchLayout => {
  const f = frameOf(size, insets)
  const rest = stickRest(f)
  const fire = rightFire(f, Math.max(f.btn * 1.25, f.fireR * 0.7))
  const buttons = buttonsAround(f, fire)
  const weapon = f.portrait ? nameAboveStick(f, rest) : nameAboveButtons(f, buttons)
  return finish(f, { rest, fixed: true, fire, leftFire: null, autoFire: true, buttons, weapon })
}

const LAYOUTS: { readonly [I in TouchLayoutId]: (size: { readonly width: number; readonly height: number }, insets?: Insets) => TouchLayout } = { a: layoutA, b: layoutB, c: layoutC }

/**
 * The touch layout `id` for a canvas of this size, inside the safe area the insets leave. In
 * portrait the controls take the lower third of the screen and the HUD sits above them.
 */
export const touchLayout = (size: { readonly width: number; readonly height: number }, insets: Insets = NO_INSETS, id: TouchLayoutId = "a"): TouchLayout => LAYOUTS[id](size, insets)

export const inCircle = (c: Circle, x: number, y: number) => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r ** 2
export const inRect = (r: Rect, x: number, y: number) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height

/** One weapon the picker lists: the slot that selects it (as the number keys do) and the weapon. */
export interface PickerEntry {
  readonly slot: 1 | 2 | 3 | 4
  readonly id: WeaponId
}

/** What the picker lists: the weapons the player owns, in slot order. */
export const pickerEntries = (a: ArsenalValue): readonly PickerEntry[] =>
  ([{ slot: 1, id: a.primary }, { slot: 2, id: "mandi" }, { slot: 3, id: "lanciafrico" }, { slot: 4, id: "mescul" }] as const).filter((e) => owned(a, e.id))

/** What the HUD draws of the touch controls; `Controls` updates it in place, so drawing allocates nothing. */
export interface TouchView {
  /** The stick under the left thumb: where it landed and the knob, drawn on the rim at most. */
  readonly stick: { held: boolean; ox: number; oy: number; kx: number; ky: number }
  fire: boolean
  /** Fire is on screen (layout C hides it while the weapon in hand fires by itself). */
  fireShown: boolean
  /** The buttons under a finger right now, one bit each (`buttonBit`). */
  pressed: number
  /** The aim and crouch toggles, and whether a tap opened the scoreboard. */
  aim: boolean
  crouch: boolean
  board: boolean
  /** What the "use" button does now, or null while it is hidden. */
  use: "use" | "dismount" | null
  /** The weapon picker's entries while it is open. */
  picker: readonly PickerEntry[] | null
}
