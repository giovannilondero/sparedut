/** Where the player is, as far as keeping the screen awake goes. */
export interface WakeSituation {
  /** A match is on: the player is in a room, not in the main menu. */
  readonly inMatch: boolean
  /** A menu is open over the match: the match menu, or the loadout and settings reached from it. */
  readonly inMatchMenu: boolean
  /** The page is visible, not behind another app or tab. */
  readonly visible: boolean
}

/** Whether the screen should be held awake. */
export function holdsScreenAwake(s: WakeSituation): boolean {
  return s.inMatch && !s.inMatchMenu && s.visible
}

/** The part of `navigator.wakeLock` used here: missing in a browser without the Screen Wake Lock API, or over plain http. */
export interface WakeLocker {
  request(type: "screen"): Promise<WakeSentinel>
}

/** A held lock: the browser releases it on its own when the page is hidden. */
export interface WakeSentinel {
  readonly released: boolean
  release(): Promise<void>
}

/**
 * Applies `holdsScreenAwake` with the browser's Screen Wake Lock. Called whenever the situation
 * may have changed; a lock the browser released on hiding is taken again on the next call that
 * wants it (the page becoming visible during a match). A missing API or a refused lock leaves
 * the match exactly as it was: the screen merely keeps the device's own sleep.
 */
export class ScreenWake {
  private sentinel: WakeSentinel | null = null
  private requesting = false
  private wanted = false

  constructor(private readonly locker: WakeLocker | undefined) {}

  sync(situation: WakeSituation) {
    this.wanted = holdsScreenAwake(situation)
    if (this.sentinel?.released) this.sentinel = null
    if (this.wanted) this.take()
    else this.release()
  }

  private take() {
    if (this.sentinel || this.requesting || !this.locker) return
    this.requesting = true
    let asked: Promise<WakeSentinel>
    try {
      asked = this.locker.request("screen")
    } catch (error) {
      // A browser that throws instead of rejecting: a refusal all the same.
      this.refused(error)
      return
    }
    asked.then(
      (sentinel) => {
        this.requesting = false
        this.sentinel = sentinel
        // The situation changed while the browser answered.
        if (!this.wanted) this.release()
      },
      (error: unknown) => this.refused(error)
    )
  }

  private release() {
    const sentinel = this.sentinel
    this.sentinel = null
    if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined)
  }

  private refused(error: unknown) {
    this.requesting = false
    console.warn("screen wake lock refused", error)
  }
}
