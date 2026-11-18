/**
 * The in-match menus' steps, with no DOM: which menu Esc goes back to, and where focus lands
 * when one opens. The game draws the menus; this decides the order between them.
 */

/** The menu open over the match: the match menu, the loadout, the settings, or none. */
export type MatchMenu = "none" | "pause" | "loadout" | "settings"

/** Esc closes one step: the settings go back to the match menu, the loadout to where it was opened from. */
export function afterEscape(open: MatchMenu, loadoutFrom: "none" | "pause"): MatchMenu {
  if (open === "loadout") return loadoutFrom
  if (open === "settings") return "pause"
  return "none"
}

/**
 * The id of the control that takes focus when `which` opens after `previous`, or null for the
 * menu's first control. Back in the match menu, focus returns to the button that left it.
 */
export function focusOnOpen(which: MatchMenu, previous: MatchMenu): string | null {
  if (which !== "pause") return null
  if (previous === "settings") return "p-settings"
  if (previous === "loadout") return "p-loadout"
  return "p-resume"
}

/** The end screen's first focus: another round for the host, who alone can start one; leaving for the rest. */
export const endFocus = (host: boolean): string => (host ? "e-again" : "e-leave")
