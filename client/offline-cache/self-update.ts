/**
 * Carries out the `tooOld` decision in the page: the update check, the take-over, the one reload,
 * the messages. `client/main.ts` reports the server's refusals and the returns to the menu.
 */
import { FINE, tooOld, type Effect, type Notice, type TooOld, type TooOldEvent } from "./too-old.ts"
import { checkForUpdate, takeOver, type RegistrationLike } from "./update.ts"

/** Set just before the automatic reload; `sessionStorage` keeps it for this tab across the reload. */
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
  readonly session: Pick<Storage, "getItem" | "setItem">
  readonly reload: () => void
  readonly tell: (notice: Notice) => void
  /** A match, the training or an Offline room is in progress, or starting. */
  readonly playing: () => boolean
}

export class SelfUpdate {
  private state: TooOld = FINE
  private timer = 0

  constructor(private readonly d: SelfUpdateDeps) {
    d.container?.addEventListener("controllerchange", () => this.dispatch({ t: "tookOver" }))
  }

  /** The server answered `error version`. */
  refused() {
    this.dispatch({ t: "refused" })
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
    }
  }

  private giveUpAfter(ms: number) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.dispatch({ t: "gaveUp" }), ms) as unknown as number
  }
}
