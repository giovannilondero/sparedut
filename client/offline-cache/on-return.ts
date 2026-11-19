/**
 * An installed game kept in the background checks for a new version when the player comes back.
 *
 * The browser looks for a new `/sw.js` only when a page loads, or at most once a day on its own;
 * an installed game opened from its icon or shortcut is brought to the front without a reload
 * (`launch_handler: focus-existing`). So the page asks for an update check itself when it comes
 * back into view or back to the menu. A version that arrives waits and the menu's update notice
 * shows it (`./update.ts`); nothing takes over on its own.
 *
 * The decision is this pure function; `CheckOnReturn` (`./self-update.ts`) carries it out.
 */

/** At most one check an hour. */
export const CHECK_EVERY_MS = 60 * 60 * 1000

export interface ReturnContext {
  /** The page is in view. */
  readonly visible: boolean
  /** A match (online, offline or the training) is in progress or starting. */
  readonly playing: boolean
  /** Wall-clock time, in milliseconds: it keeps running while the device sleeps. */
  readonly now: number
  /** When the page last checked: its load, which the browser checks on, or its last check since. */
  readonly lastCheck: number
}

/** Whether a page back in view or back to the menu asks the server for a new version now. */
export function checkOnReturn(context: ReturnContext): boolean {
  if (!context.visible || context.playing) return false
  const since = context.now - context.lastCheck
  // Before the last check: the device's clock was set back; waiting for it to catch up could take days.
  return since < 0 || since > CHECK_EVERY_MS
}
