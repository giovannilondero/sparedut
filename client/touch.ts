/**
 * Where the touch controls sit on the game canvas, from its size alone: the
 * input in `Controls` hit-tests against it and the HUD draws it, so the two
 * never disagree. Layout A: the stick appears where the left thumb lands, one
 * fire button sits under the right thumb, and the rest of the screen looks.
 * Read again on every new touch and on every resize, so rotating the device
 * re-lays the controls without dropping a finger already down.
 */

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

export interface TouchLayout {
  readonly portrait: boolean
  /** Where a thumb starts the stick (centred where it lands); `radius` is the drag for full tilt. */
  readonly stick: { readonly region: Rect; readonly radius: number; readonly rest: Circle }
  /** A finger that lands here fires, and still looks when it drags. */
  readonly fire: Circle
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
  return {
    portrait,
    stick: {
      region: { left: 0, top, width: width / 2, height: height - top },
      radius,
      rest: { x: margin + radius * 1.4, y: height - bottom, r: radius }
    },
    fire: { x: width - margin - fireR * 1.6, y: height - bottom, r: fireR }
  }
}

/** What the HUD draws of the touch controls; `Controls` updates it in place, so drawing allocates nothing. */
export interface TouchView {
  /** The stick under the left thumb: where it landed and the knob, drawn on the rim at most. */
  readonly stick: { held: boolean; ox: number; oy: number; kx: number; ky: number }
  fire: boolean
}
