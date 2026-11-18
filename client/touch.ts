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
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Layout A for a canvas of this size; in portrait the controls keep to the lower part of the screen. */
export const touchLayout = ({ width, height }: { readonly width: number; readonly height: number }): TouchLayout => {
  const portrait = height > width
  const short = Math.min(width, height)
  const radius = clamp(short * 0.15, 48, 84)
  const fireR = clamp(short * 0.11, 36, 60)
  // In portrait the HUD sits above the controls, which take the lower part of the screen.
  const top = portrait ? height * 0.5 : height * 0.2
  const margin = clamp(short * 0.05, 16, 40)
  const bottom = portrait ? height / 6 : fireR * 2.2
  const fire: Circle = { x: width - margin - fireR * 1.6, y: height - bottom, r: fireR }

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
  const corner = (i: number): Circle => ({ x: margin + small + i * (2 * small + gap), y: margin + small, r: small })

  const weaponW = clamp(short * 0.32, 110, 160)
  const weaponH = btn * 1.6
  const weapon: Rect = { left: width - margin - weaponW, top: mine.y - btn - gap - weaponH, width: weaponW, height: weaponH }
  // The picker opens beside the name, downwards, over the buttons it covers while open.
  const step = weaponH + gap / 1.5
  const picker = [0, 1, 2, 3].map((i): Rect => ({ left: weapon.left - gap - weaponW, top: weapon.top + i * step, width: weaponW, height: weaponH }))

  return {
    portrait,
    stick: {
      region: { left: 0, top, width: width / 2, height: height - top },
      radius,
      rest: { x: margin + radius * 1.4, y: height - bottom, r: radius }
    },
    fire,
    buttons: {
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
    },
    weapon,
    picker
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
