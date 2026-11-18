import { expect, test } from "bun:test"
import { FINE, tooOld, type Effect, type TooOld, type TooOldEvent } from "../client/offline-cache/too-old.ts"
import { checkForUpdate, takeOver, TAKE_OVER } from "../client/offline-cache/update.ts"

/** Plays the events in order on one page and collects what the client is told to do. */
const run = (events: readonly TooOldEvent[], context: { reloaded?: boolean; playing?: boolean } = {}) => {
  let state: TooOld = FINE
  const effects: Effect[] = []
  for (const event of events) {
    const next = tooOld(state, event, { reloaded: context.reloaded ?? false, playing: context.playing ?? false })
    state = next.state
    effects.push(...next.effects)
  }
  return { state, effects, reloads: effects.filter((e) => e.do === "reload").length }
}

test("a refusal from the server asks for an update check at once", () => {
  expect(run([{ t: "refused" }]).effects).toContainEqual({ do: "check" })
})

test("a new version that arrives takes over and the page reloads once it is in control", () => {
  const { effects, reloads } = run([{ t: "refused" }, { t: "checked", outcome: "waiting" }, { t: "tookOver" }])
  expect(effects).toContainEqual({ do: "takeOver" })
  expect(reloads).toBe(1)
})

test("no reload when no new version arrived: a message instead", () => {
  const { effects, reloads } = run([{ t: "refused" }, { t: "checked", outcome: "none" }])
  expect(reloads).toBe(0)
  expect(effects).toContainEqual({ do: "tell", say: "noUpdate" })
})

test("no reload before the new version has taken control", () => {
  expect(run([{ t: "refused" }, { t: "checked", outcome: "waiting" }]).reloads).toBe(0)
})

test("no reload when the new version never takes control: a message instead", () => {
  const { effects, reloads } = run([{ t: "refused" }, { t: "checked", outcome: "waiting" }, { t: "gaveUp" }, { t: "tookOver" }])
  expect(reloads).toBe(0)
  expect(effects).toContainEqual({ do: "tell", say: "noUpdate" })
})

test("a check that never ends gives up with a message and no reload", () => {
  const { effects, reloads } = run([{ t: "refused" }, { t: "gaveUp" }, { t: "checked", outcome: "waiting" }, { t: "tookOver" }])
  expect(reloads).toBe(0)
  expect(effects).toContainEqual({ do: "tell", say: "noUpdate" })
})

test("still refused after the automatic reload: a message, no second check, no second reload", () => {
  const { effects, reloads } = run([{ t: "refused" }, { t: "checked", outcome: "waiting" }, { t: "tookOver" }, { t: "refused" }], { reloaded: true })
  expect(reloads).toBe(0)
  expect(effects).not.toContainEqual({ do: "check" })
  expect(effects).toContainEqual({ do: "tell", say: "stillRefused" })
})

test("at most one automatic reload on a page, however often the server refuses", () => {
  const refusalsAndUpdates: TooOldEvent[] = []
  for (let i = 0; i < 4; i++) refusalsAndUpdates.push({ t: "refused" }, { t: "checked", outcome: "waiting" }, { t: "tookOver" }, { t: "atMenu" })
  expect(run(refusalsAndUpdates).reloads).toBe(1)
})

test("with no service worker the page is not cached: the player is told to reload it, nothing reloads on its own", () => {
  const { effects, reloads } = run([{ t: "refused" }, { t: "checked", outcome: "noWorker" }])
  expect(reloads).toBe(0)
  expect(effects).toContainEqual({ do: "tell", say: "noWorker" })
})

test("a worker taking control with no refusal (the first install) never reloads", () => {
  expect(run([{ t: "tookOver" }, { t: "atMenu" }]).reloads).toBe(0)
})

test("a match in progress is never cut: the new version takes over on return to the menu", () => {
  let state: TooOld = FINE
  const effects: Effect[] = []
  const step = (event: TooOldEvent, playing: boolean) => {
    const next = tooOld(state, event, { reloaded: false, playing })
    state = next.state
    effects.push(...next.effects)
  }
  step({ t: "refused" }, false)
  step({ t: "checked", outcome: "waiting" }, true)
  expect(effects).not.toContainEqual({ do: "takeOver" })
  step({ t: "atMenu" }, false)
  expect(effects).toContainEqual({ do: "takeOver" })
  step({ t: "tookOver" }, false)
  expect(effects.filter((e) => e.do === "reload")).toHaveLength(1)
})

test("a new version taking control during a match reloads only on return to the menu", () => {
  let state: TooOld = FINE
  const effects: Effect[] = []
  const step = (event: TooOldEvent, playing: boolean) => {
    const next = tooOld(state, event, { reloaded: false, playing })
    state = next.state
    effects.push(...next.effects)
  }
  step({ t: "refused" }, false)
  step({ t: "checked", outcome: "waiting" }, false)
  step({ t: "tookOver" }, true)
  expect(effects.filter((e) => e.do === "reload")).toHaveLength(0)
  step({ t: "atMenu" }, false)
  expect(effects.filter((e) => e.do === "reload")).toHaveLength(1)
})

test("refusals while the update is under way say so, without a second check", () => {
  const { effects } = run([{ t: "refused" }, { t: "refused" }])
  expect(effects.filter((e) => e.do === "check")).toHaveLength(1)
  expect(effects.filter((e) => e.do === "tell" && e.say === "updating")).toHaveLength(2)
})

test("a refusal after a failed update repeats the message, and checks no more", () => {
  const { effects } = run([{ t: "refused" }, { t: "checked", outcome: "none" }, { t: "refused" }])
  expect(effects.filter((e) => e.do === "check")).toHaveLength(1)
  expect(effects.filter((e) => e.do === "tell" && e.say === "noUpdate")).toHaveLength(2)
})

// The seam to the browser's service worker registration (`client/offline-cache/update.ts`).

/** A service worker as the page sees it: its state changes as the browser installs it. */
class FakeWorker {
  readonly posted: unknown[] = []
  private readonly listeners = new Set<() => void>()
  constructor(public state: "installing" | "installed" | "activating" | "activated" | "redundant") {}
  postMessage(message: unknown) {
    this.posted.push(message)
  }
  addEventListener(_type: "statechange", listener: () => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: "statechange", listener: () => void) {
    this.listeners.delete(listener)
  }
  become(state: FakeWorker["state"]) {
    this.state = state
    for (const listener of [...this.listeners]) listener()
  }
}

/** A registration whose `update()` finds `found` (or fails, offline). */
const registration = (options: { waiting?: FakeWorker; found?: FakeWorker; offline?: boolean } = {}) => {
  const reg = {
    installing: null as FakeWorker | null,
    waiting: options.waiting ?? null,
    updates: 0,
    update: async () => {
      reg.updates++
      if (options.offline) throw new TypeError("Failed to fetch")
      if (options.found) reg.installing = options.found
      return reg
    }
  }
  return reg
}

test("a version already downloaded and waiting is found without another download", async () => {
  const reg = registration({ waiting: new FakeWorker("installed") })
  expect(await checkForUpdate(reg)).toBe("waiting")
  expect(reg.updates).toBe(0)
})

test("a new version found by the check is waiting once the browser has installed it", async () => {
  const worker = new FakeWorker("installing")
  const checked = checkForUpdate(registration({ found: worker }))
  await Promise.resolve()
  worker.become("installed")
  expect(await checked).toBe("waiting")
})

test("a new version that fails to install (the network went away) is no update", async () => {
  const worker = new FakeWorker("installing")
  const checked = checkForUpdate(registration({ found: worker }))
  await Promise.resolve()
  worker.become("redundant")
  expect(await checked).toBe("none")
})

test("no network, or the same version on the server, is no update", async () => {
  expect(await checkForUpdate(registration({ offline: true }))).toBe("none")
  expect(await checkForUpdate(registration())).toBe("none")
})

test("with no service worker there is nothing to check", async () => {
  expect(await checkForUpdate(null)).toBe("noWorker")
})

test("taking over asks the waiting version, and only it", () => {
  const waiting = new FakeWorker("installed")
  expect(takeOver(registration({ waiting }))).toBe(true)
  expect(waiting.posted).toEqual([TAKE_OVER])
  expect(takeOver(registration())).toBe(false)
  expect(takeOver(null)).toBe(false)
})
