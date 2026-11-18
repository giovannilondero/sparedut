/**
 * The page side of the update notice (`client/offline-cache/update.ts`), with a fake registration:
 * when the menu hears of a new version, and what the notice's tap does.
 */
import { expect, test } from "bun:test"
import { loadNewVersion, TAKE_OVER, watchNewVersion } from "../client/offline-cache/update.ts"

type State = "installing" | "installed" | "activating" | "activated" | "redundant"

class FakeWorker {
  readonly posted: unknown[] = []
  private readonly listeners = new Set<() => void>()
  constructor(public state: State) {}
  postMessage(message: unknown) {
    this.posted.push(message)
  }
  addEventListener(_type: "statechange", listener: () => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: "statechange", listener: () => void) {
    this.listeners.delete(listener)
  }
  become(state: State) {
    this.state = state
    for (const listener of [...this.listeners]) listener()
  }
}

/** A registration the browser can find a new version for (`find`), as `updatefound` does. */
function registration(waiting: FakeWorker | null = null) {
  const found = new Set<() => void>()
  return {
    installing: null as FakeWorker | null,
    waiting,
    update: async () => undefined,
    addEventListener(_type: "updatefound", listener: () => void) {
      found.add(listener)
    },
    find(worker: FakeWorker) {
      this.installing = worker
      for (const listener of found) listener()
    }
  }
}

/** A page controlled by a worker or not, whose `controllerchange` can be fired. */
function page(controlled = true) {
  const changes = new Set<() => void>()
  return {
    controlled,
    reloads: 0,
    container: { addEventListener: (_type: "controllerchange", listener: () => void) => void changes.add(listener) },
    takeControl() {
      for (const listener of changes) listener()
    }
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test("a version already waiting when the page opens is announced", async () => {
  const reg = registration(new FakeWorker("installed"))
  const p = page()
  let heard = 0
  watchNewVersion(reg, () => p.controlled, () => heard++)
  await settle()
  expect(heard).toBe(1)
})

test("a version the browser finds later is announced once it is installed, not while it downloads", async () => {
  const reg = registration()
  const p = page()
  let heard = 0
  watchNewVersion(reg, () => p.controlled, () => heard++)
  const worker = new FakeWorker("installing")
  reg.find(worker)
  await settle()
  expect(heard).toBe(0)
  worker.become("installed")
  await settle()
  expect(heard).toBe(1)
})

test("a version that fails to install is not announced", async () => {
  const reg = registration()
  let heard = 0
  watchNewVersion(reg, () => true, () => heard++)
  const worker = new FakeWorker("installing")
  reg.find(worker)
  worker.become("redundant")
  await settle()
  expect(heard).toBe(0)
})

test("the first version a page installs is not new: nothing controlled the page before it", async () => {
  const reg = registration()
  let heard = 0
  watchNewVersion(reg, () => false, () => heard++)
  const worker = new FakeWorker("installing")
  reg.find(worker)
  worker.become("installed")
  worker.become("activated")
  await settle()
  expect(heard).toBe(0)
})

test("the notice's tap asks the waiting version to take over, and reloads once it has", () => {
  const waiting = new FakeWorker("installed")
  const p = page()
  loadNewVersion(registration(waiting), p.container, () => p.reloads++)
  expect(waiting.posted).toEqual([TAKE_OVER])
  expect(p.reloads).toBe(0)
  p.takeControl()
  expect(p.reloads).toBe(1)
  p.takeControl()
  expect(p.reloads).toBe(1)
})

test("with no version waiting any more (another tab let it take over), the tap reloads at once", () => {
  const p = page()
  loadNewVersion(registration(null), p.container, () => p.reloads++)
  expect(p.reloads).toBe(1)
})
