import { expect, test } from "bun:test"
import { DEVICES } from "../client/device.ts"
import { menuControl, playPrompt, turretPrompt } from "../client/prompts.ts"
import { STRINGS } from "../client/i18n.ts"

for (const [lang, s] of Object.entries(STRINGS)) {
  test(`${lang}: the start prompt and the turret prompts name the control of the active device`, () => {
    const p = (d: (typeof DEVICES)[number]) => ({ play: playPrompt(s, d), use: turretPrompt(s, d, false), leave: turretPrompt(s, d, true) })
    expect(p("keyboard").use).toContain("<kbd>E</kbd>")
    expect(p("keyboard").leave).toContain("<kbd>E</kbd>")
    expect(p("keyboard").play).toContain("Esc")
    // The controller: its own buttons (d-pad down mounts and dismounts, ✕ jumps off), never a key.
    expect(p("pad").use).toContain("⬇")
    expect(p("pad").leave).toContain("✕")
    // Touch: the on-screen control by the label it shows.
    expect(p("touch").use).toContain(s.hud.touchUse)
    expect(p("touch").leave).toContain(s.hud.touchLeave)
    for (const d of ["pad", "touch"] as const) {
      const all = Object.values(p(d)).join(" ")
      expect(all).not.toContain("<kbd>E</kbd>")
      expect(all).not.toContain("Esc")
    }
    // Every device's prompt is its own.
    expect(new Set(DEVICES.map((d) => p(d).play)).size).toBe(3)
    expect(new Set(DEVICES.map((d) => p(d).use)).size).toBe(3)
  })
}

for (const [lang, s] of Object.entries(STRINGS)) {
  test(`${lang}: the warm-up banner names the active device's control for the match menu, never a key on touch`, () => {
    const banner = (d: (typeof DEVICES)[number]) => s.hud.warmup("0:30", menuControl(d))
    expect(banner("keyboard")).toContain("<kbd>Esc</kbd>")
    expect(banner("pad")).toContain("<kbd>Options</kbd>")
    expect(banner("touch")).toContain("<kbd>☰</kbd>")
    for (const d of ["pad", "touch"] as const) expect(banner(d)).not.toContain("Esc")
  })
}
