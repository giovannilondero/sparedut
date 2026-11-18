/**
 * The client's side of a step the active device has no control for: once the step has been shown
 * as not available for a moment, the client tells the host so, naming the step and the device.
 * No DOM: the training's view, the device and the time go in, the message to send comes out.
 */
import { describe, expect, test } from "bun:test"
import type { TrainingView } from "../shared/sim/view.ts"
import { UNAVAILABLE_SHOWN_MS, UnavailableSteps } from "../client/training-unavailable.ts"

const at = (station: string, step: string | null): TrainingView => ({ tag: "station", station, step, count: 0, target: 1, unlocked: 12 }) as TrainingView

describe("a step the active device cannot perform", () => {
  test("on a controller, quick phrases are told unavailable once shown for a moment", () => {
    const u = new UnavailableSteps()
    const phrases = at("skirmish", "phrases")
    expect(u.check(phrases, "pad", 1000)).toBeNull()
    expect(u.check(phrases, "pad", 1000 + UNAVAILABLE_SHOWN_MS - 1)).toBeNull()
    expect(u.check(phrases, "pad", 1000 + UNAVAILABLE_SHOWN_MS)).toEqual({ t: "unavailable", station: "skirmish", step: "phrases", device: "pad" })
    // Not again at once: only if the host has not moved on after another moment.
    expect(u.check(phrases, "pad", 1000 + UNAVAILABLE_SHOWN_MS + 16)).toBeNull()
    expect(u.check(phrases, "pad", 1000 + 2 * UNAVAILABLE_SHOWN_MS)).toEqual({ t: "unavailable", station: "skirmish", step: "phrases", device: "pad" })
  })

  test("the previous weapon on touch and on a controller; never on a keyboard", () => {
    for (const device of ["touch", "pad"] as const) {
      const u = new UnavailableSteps()
      u.check(at("switch", "lastWeapon"), device, 0)
      expect(u.check(at("switch", "lastWeapon"), device, UNAVAILABLE_SHOWN_MS)).toEqual({ t: "unavailable", station: "switch", step: "lastWeapon", device })
    }
    const u = new UnavailableSteps()
    u.check(at("switch", "lastWeapon"), "keyboard", 0)
    expect(u.check(at("switch", "lastWeapon"), "keyboard", 10 * UNAVAILABLE_SHOWN_MS)).toBeNull()
  })

  test("a step every device can perform, a completed training or a regular room say nothing", () => {
    const u = new UnavailableSteps()
    for (const view of [at("skirmish", "board"), { tag: "complete" } as const, null]) {
      u.check(view, "pad", 0)
      expect(u.check(view, "pad", 10 * UNAVAILABLE_SHOWN_MS)).toBeNull()
    }
  })

  test("switching to a device that has the control stops it; switching back starts the moment again", () => {
    const u = new UnavailableSteps()
    const phrases = at("skirmish", "phrases")
    u.check(phrases, "pad", 0)
    expect(u.check(phrases, "keyboard", UNAVAILABLE_SHOWN_MS)).toBeNull()
    expect(u.check(phrases, "pad", UNAVAILABLE_SHOWN_MS + 10)).toBeNull()
    expect(u.check(phrases, "pad", 2 * UNAVAILABLE_SHOWN_MS + 10)).toEqual({ t: "unavailable", station: "skirmish", step: "phrases", device: "pad" })
  })
})
