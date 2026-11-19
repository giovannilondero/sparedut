/**
 * Carries out the `tooOld` decision in the page: the update check, the take-over, the one reload,
 * the messages. `client/main.ts` reports the server's refusals and the returns to the menu.
 * Beside it, `CheckOnReturn` carries out `checkOnReturn`: the quiet check of a page the player comes back to.
 */
import { checkOnReturn } from "./on-return.ts"
import { FINE, tooOld, type Effect, type Notice, type TooOld, type TooOldEvent } from "./too-old.ts"
import { checkForUpdate, takeOver, type RegistrationLike } from "./update.ts"

/**
 * Set just before the automatic reload; `sessionStorage` keeps it for this tab across the reload.
 * Removed once the server accepts the page, so a later refusal in the same tab gets its own update.
 */
export const RELOADED_KEY = "sparedut.reloadedForUpdate"
/** How long a check may take, the new version's download included, before the player is told. */
const CHECK_MS = 60_000
/** How long the waiting version may take to take control. */
const TAKE_OVER_MS = 15_000

export interface SelfUpdateDeps {
  /** The page's service worker registration once registered; `null` when there is none. */
  readonly registration: Promise<RegistrationLike | null>
  /** Where `controllerchange` fires; missing without service worker support. */
  readonly container: { addEventListener(type: "controllerchange", listener: () => void): void } | undefined
  readonly session: Pick<Storage, "getItem" | "setItem" | "removeItem">
  readonly reload: () => void
  readonly tell: (notice: Notice) => void
  /** A match, the training or an Offline room is in progress, or starting. */
  readonly playing: () => boolean
}

export class SelfUpdate {
  private state: TooOld = FINE
  private timer = 0
  /** The server refused this page since its last `welcome`: that welcome answers a refused hello. */
  private refusedSinceWelcome = false

  constructor(private readonly d: SelfUpdateDeps) {
    d.container?.addEventListener("controllerchange", () => this.dispatch({ t: "tookOver" }))
  }

  /** The server answered `error version`. */
  refused() {
    this.refusedSinceWelcome = true
    this.dispatch({ t: "refused" })
  }

  /** The server answered a hello with `welcome`; with no version error before it, it accepts this page. */
  welcomed() {
    const refused = this.refusedSinceWelcome
    this.refusedSinceWelcome = false
    if (!refused) this.dispatch({ t: "accepted" })
  }

  /** The player is back in the menu. */
  atMenu() {
    this.dispatch({ t: "atMenu" })
  }

  private dispatch(event: TooOldEvent) {
    const reloaded = this.d.session.getItem(RELOADED_KEY) !== null
    const step = tooOld(this.state, event, { reloaded, playing: this.d.playing() })
    this.state = step.state
    for (const effect of step.effects) this.carryOut(effect)
  }

  private carryOut(effect: Effect) {
    switch (effect.do) {
      case "check":
        this.giveUpAfter(CHECK_MS)
        void this.d.registration
          .then(checkForUpdate)
          .catch(() => "none" as const)
          .then((outcome) => this.dispatch({ t: "checked", outcome }))
        return
      case "takeOver":
        this.giveUpAfter(TAKE_OVER_MS)
        void this.d.registration.then((registration) => {
          if (!takeOver(registration)) this.dispatch({ t: "gaveUp" })
        })
        return
      case "reload":
        clearTimeout(this.timer)
        this.d.session.setItem(RELOADED_KEY, "1")
        this.d.reload()
        return
      case "tell":
        this.d.tell(effect.say)
        return
      case "forget":
        this.d.session.removeItem(RELOADED_KEY)
        return
    }
  }

  private giveUpAfter(ms: number) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.dispatch({ t: "gaveUp" }), ms) as unknown as number
  }
}

export interface CheckOnReturnDeps {
  /** The page's service worker registration once registered; `null` when there is none (dev server). */
  readonly registration: Promise<{ update(): Promise<unknown> } | null>
  readonly visible: () => boolean
  /** A match, the training or an Offline room is in progress, or starting. */
  readonly playing: () => boolean
  /** Wall-clock time (`Date.now`): unlike the page's own clock it counts the time the device slept. */
  readonly now: () => number
}

/**
 * Asks the browser to look for a new `/sw.js` when the player comes back, at most once an hour
 * (`./on-return.ts`). Quiet: a check that fails (no network) says nothing. A version that arrives
 * waits, and `watchNewVersion` (`./update.ts`) has the menu's update notice show it.
 */
export class CheckOnReturn {
  /** The page's load: the browser looked for a new version then. */
  private lastCheck: number

  constructor(private readonly d: CheckOnReturnDeps) {
    this.lastCheck = d.now()
  }

  /** The page came back into view, or the player is back in the menu. */
  returned() {
    const now = this.d.now()
    if (!checkOnReturn({ visible: this.d.visible(), playing: this.d.playing(), now, lastCheck: this.lastCheck })) return
    this.lastCheck = now
    void this.d.registration.then((registration) => registration?.update()).catch(() => {})
  }
}
