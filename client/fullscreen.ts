/**
 * Fullscreen for a match on a phone or a tablet, asked from the user gesture that enters it.
 * Where the browser refuses, or has no Fullscreen API for a page (Safari on an iPhone, as far as
 * is known), nothing changes: the game keeps laying out inside the visible viewport.
 */
type Prefixed = HTMLElement & { webkitRequestFullscreen?: () => void }

export function requestFullscreen(el: Prefixed = document.documentElement) {
  if (document.fullscreenElement) return
  try {
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined)
    else el.webkitRequestFullscreen?.()
  } catch {
    // An old browser that throws instead of rejecting: a refusal all the same.
  }
}
