/**
 * The keyboard's keys the game takes from the browser: a key taken on its press is the game's for
 * as long as it is held, so a held Tab shows the scoreboard and never walks the focus through the page.
 */
import { beforeAll, expect, test } from "bun:test"

type Listener = (e: unknown) => void
const listeners = new Map<string, Listener[]>()
const page = { addEventListener: (type: string, on: Listener) => void listeners.set(type, [...(listeners.get(type) ?? []), on]) }

let Controls: typeof import("../client/controls.ts").Controls
beforeAll(async () => {
  // Controls listens to the DOM: in Bun a page that keeps its listeners is enough to press keys on.
  Object.assign(globalThis, { document: page, window: page })
  ;({ Controls } = await import("../client/controls.ts"))
})

/** A keyboard in front of a game that takes the keys in `takes` as its own. */
const keyboard = (takes: readonly string[]) => {
  listeners.clear()
  const seen: string[] = []
  new Controls({ addEventListener() {} } as unknown as HTMLElement, {
    onSlot: () => {},
    onLastWeapon: () => {},
    onWheel: () => {},
    onKey: (code, down) => {
      seen.push(`${code}:${down ? "down" : "up"}`)
      return down && takes.includes(code)
    },
    onPause: () => {}
  })
  /** Fires a key event; says whether the browser still does its own thing with it. */
  const fire = (type: "keydown" | "keyup", code: string, repeat: boolean) => {
    let reachesBrowser = true
    for (const on of listeners.get(type) ?? []) on({ code, repeat, preventDefault: () => (reachesBrowser = false) })
    return reachesBrowser
  }
  return { seen, press: (code: string) => fire("keydown", code, false), repeat: (code: string) => fire("keydown", code, true), release: (code: string) => fire("keyup", code, false) }
}

test("a held Tab the game took for the scoreboard never reaches the browser, its repeats included", () => {
  const k = keyboard(["Tab"])
  expect(k.press("Tab")).toBe(false)
  expect(k.repeat("Tab")).toBe(false)
  expect(k.repeat("Tab")).toBe(false)
  // The game hears one press, not one per repeat.
  expect(k.seen).toEqual(["Tab:down"])
  k.release("Tab")
  expect(k.seen).toEqual(["Tab:down", "Tab:up"])
})

test("a key the game did not take keeps its meaning in the browser: Tab moves through an open menu", () => {
  const k = keyboard([])
  expect(k.press("Tab")).toBe(true)
  expect(k.repeat("Tab")).toBe(true)
})

test("a key is taken press by press: released, its next press is asked again", () => {
  const takes = ["Tab"]
  const k = keyboard(takes)
  expect(k.press("Tab")).toBe(false)
  k.release("Tab")
  takes.length = 0
  expect(k.press("Tab")).toBe(true)
  expect(k.repeat("Tab")).toBe(true)
})
