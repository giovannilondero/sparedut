/**
 * Calls `changed` whenever the page's size or orientation may have changed. A phone still reports
 * the old size while it rotates and settles its safe area a moment later, so every change is
 * followed up on the next frame and once more when the rotation has ended. `changed` runs several
 * times per change: it must cost nothing when nothing moved.
 */
export const onViewportChange = (changed: () => void) => {
  let settled = 0
  const follow = () => {
    changed()
    requestAnimationFrame(changed)
    clearTimeout(settled)
    settled = window.setTimeout(changed, 400)
  }
  addEventListener("resize", follow)
  addEventListener("orientationchange", follow)
  window.visualViewport?.addEventListener("resize", follow)
}
