/**
 * Where the touch controls sit on the game canvas, from its size alone: the
 * input in `Controls` hit-tests against it and the HUD draws it, so the two
 * never disagree. Layout A: the stick appears where the left thumb lands, one
 * fire button sits under the right thumb with the other actions around it,
 * and the rest of the screen looks. `Controls.relayout` computes it once per
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

export interface TouchLayout {
  readonly portrait: boolean
  /** Where a thumb starts the stick (centred where it lands); `radius` is the drag for full tilt. */
  readonly stick: { readonly region: Rect; readonly radius: number; readonly rest: Circle }
  /** A finger that lands here fires, and still looks when it drags. */
  readonly fire: Circle
  readonly buttons: { readonly [B in TouchButton]: Circle }
  /** The weapon's name: a tap is the next weapon, a long press opens the picker. */
  readonly weapon: Rect
  /** The picker's entries, top to bottom: room for every weapon slot. */
  readonly picker: readonly Rect[]
  /**
   * Where the HUD goes: no control and no resting thumb inside it. In portrait it is everything
   * above the controls and below the corner buttons; in landscape the column between the stick
   * and the buttons around fire.
   */
  readonly free: Rect
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Layout A for a canvas of this size, inside the safe area the insets leave. In portrait the
 * controls take the lower third of the screen and the HUD sits above them.
 */
export const touchLayout = (size: { readonly width: number; readonly height: number }, insets: Insets = NO_INSETS): TouchLayout => {
  const portrait = size.height > size.width
  // Everything is placed in the safe area: (x0, y0) is its top-left corner.
  const x0 = insets.left
  const y0 = insets.top
  const width = size.width - insets.left - insets.right
  const height = size.height - insets.top - insets.bottom
  const short = Math.min(width, height)
  const radius = clamp(short * 0.15, 48, 84)
  const fireR = clamp(short * 0.11, 36, 60)
  const margin = clamp(short * 0.05, 16, 40)
  const bottom = fireR * 2.2
  const fire: Circle = { x: x0 + width - margin - fireR * 1.6, y: y0 + height - bottom, r: fireR }

  // The other actions sit around fire on two arcs, opening up and to the left, within a thumb's reach.
  const btn = clamp(short * 0.065, 24, 34)
  const gap = clamp(short * 0.02, 6, 12)
  const ring = fireR + btn + gap
  const ring2 = ring + 2 * btn + gap
  const around = (d: number, deg: number, r = btn): Circle => {
    const a = (deg * Math.PI) / 180
    return { x: fire.x + d * Math.cos(a), y: fire.y + d * Math.sin(a), r }
  }
  const mine = around(ring2, 255)
  // The match menu, the scoreboard and the quick phrases: a row in the top-left corner, out of the thumbs' way.
  const small = Math.max(22, btn * 0.9)
  const corner = (i: number): Circle => ({ x: x0 + margin + small + i * (2 * small + gap), y: y0 + margin + small, r: small })

  const rest: Circle = { x: x0 + margin + radius * 1.4, y: y0 + height - bottom, r: radius }
  const weaponW = clamp(short * 0.32, 110, 160)
  const weaponH = btn * 1.6
  // Above the buttons in landscape; in portrait above the stick, so that the controls keep to the lower third.
  const weapon: Rect = portrait
    ? { left: x0 + margin, top: rest.y - radius - gap - weaponH, width: weaponW, height: weaponH }
    : { left: x0 + width - margin - weaponW, top: mine.y - btn - gap - weaponH, width: weaponW, height: weaponH }
  // The picker opens beside the name, towards the middle and downwards, over the controls it covers while open.
  const step = weaponH + gap / 1.5
  const pickerLeft = portrait ? weapon.left + weaponW + gap : weapon.left - gap - weaponW
  const picker = [0, 1, 2, 3].map((i): Rect => ({ left: pickerLeft, top: weapon.top + i * step, width: weaponW, height: weaponH }))
  const buttons = {
    crouch: around(ring, 155),
    aim: around(ring, 200),
    jump: around(ring, 245),
    reload: around(ring, 290),
    bomb: around(ring2, 220),
    mine,
    use: around(ring2, 290, btn * 1.1),
    menu: corner(0),
    board: corner(1),
    phrases: corner(2)
  }
  // The controls under the thumbs: the stick at rest, fire, the name and the buttons around them.
  const thumbs = [rest, fire, buttons.crouch, buttons.aim, buttons.jump, buttons.reload, buttons.bomb, buttons.mine, buttons.use]
  const controlsTop = Math.min(weapon.top, ...thumbs.map((c) => c.y - c.r))
  const corners = buttons.menu.y + small
  const free: Rect = portrait
    ? { left: x0 + margin, top: corners + gap, width: width - 2 * margin, height: controlsTop - gap - (corners + gap) }
    : (() => {
        const left = Math.max(rest.x + radius, buttons.phrases.x + small) + gap
        const right = Math.min(weapon.left, ...thumbs.filter((c) => c !== rest).map((c) => c.x - c.r)) - gap
        return { left, top: y0 + gap, width: right - left, height: height - 2 * gap }
      })()
  // In portrait a thumb starts the stick only among the controls, below the HUD.
  const top = portrait ? controlsTop : y0 + height * 0.2

  return {
    portrait,
    stick: { region: { left: x0, top, width: width / 2, height: y0 + height - top }, radius, rest },
    fire,
    buttons,
    weapon,
    picker,
    free
  }
}

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
