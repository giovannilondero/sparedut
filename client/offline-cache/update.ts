/**
 * The seam between the page and its service worker's updates: is a new version waiting, and make
 * it take over. Written against the few members it uses, so a test hands it a fake registration.
 *
 * A new worker installs beside the one in control and waits (`./sw.ts`): it takes over only when
 * asked with `TAKE_OVER`, or once no page runs the old build. Taking over fires `controllerchange`
 * on every page it controls; a page that took over reloads into the new build.
 */
import type { CheckOutcome } from "./too-old.ts"

/** The message the page posts to a waiting worker to make it take over (`self.skipWaiting()`). */
export const TAKE_OVER = "sparedut:takeOver"

/** A service worker as the page sees it. */
export interface WorkerLike {
  readonly state: string
  postMessage(message: unknown): void
  addEventListener(type: "statechange", listener: () => void): void
  removeEventListener(type: "statechange", listener: () => void): void
}

/** A service worker registration as the page sees it. */
export interface RegistrationLike {
  readonly installing: WorkerLike | null
  readonly waiting: WorkerLike | null
  update(): Promise<unknown>
}

/**
 * Whether a new version is (or becomes) waiting, without asking the server: one already waiting,
 * or the one installing once the browser has installed it. `false` when it fails to install.
 */
export function newVersionWaiting(registration: RegistrationLike): Promise<boolean> {
  if (registration.waiting) return Promise.resolve(true)
  const worker = registration.installing
  if (!worker) return Promise.resolve(false)
  return new Promise((resolve) => {
    const settle = () => {
      if (worker.state === "installing") return
      worker.removeEventListener("statechange", settle)
      // `installed` is waiting; past it (activating, activated) it took over on its own: still new.
      resolve(worker.state !== "redundant")
    }
    worker.addEventListener("statechange", settle)
    settle()
  })
}

/** Asks the server for a new version at once and waits for the browser to install it. */
export async function checkForUpdate(registration: RegistrationLike | null): Promise<CheckOutcome> {
  if (!registration) return "noWorker"
  if (registration.waiting) return "waiting"
  try {
    await registration.update()
  } catch {
    // No network, or the worker script failed to load: the cached version keeps working.
    return "none"
  }
  return (await newVersionWaiting(registration)) ? "waiting" : "none"
}

/** Asks the waiting version to take over. `false` when no version is waiting. */
export function takeOver(registration: RegistrationLike | null): boolean {
  const waiting = registration?.waiting
  if (!waiting) return false
  waiting.postMessage(TAKE_OVER)
  return true
}

/** A registration that says when the browser found a new version to download. */
export interface WatchedRegistration extends RegistrationLike {
  addEventListener(type: "updatefound", listener: () => void): void
}

/**
 * Calls `onWaiting` whenever a new version waits beside the one in control: one already waiting
 * when the page opens, and each one the browser finds later, once installed. The first version a
 * page installs is not new: nothing controlled the page before it (`controlled`).
 */
export function watchNewVersion(registration: WatchedRegistration, controlled: () => boolean, onWaiting: () => void) {
  const check = () => {
    if (controlled()) void newVersionWaiting(registration).then((waiting) => waiting && onWaiting())
  }
  registration.addEventListener("updatefound", check)
  check()
}

/**
 * The update notice's tap: the waiting version takes over, and the page reloads once it has
 * control. With none waiting any more (another tab of the game let it take over) the page reloads
 * at once, into the version now in control.
 */
export function loadNewVersion(
  registration: RegistrationLike | null,
  container: { addEventListener(type: "controllerchange", listener: () => void): void } | undefined,
  reload: () => void
) {
  let reloaded = false
  container?.addEventListener("controllerchange", () => {
    if (reloaded) return
    reloaded = true
    reload()
  })
  if (!takeOver(registration)) {
    reloaded = true
    reload()
  }
}
