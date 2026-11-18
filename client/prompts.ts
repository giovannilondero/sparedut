/**
 * What the prompts say for the active device: the prompt to start playing, near a turret
 * the control that mounts it or, while mounted, the one that dismounts, and the control that
 * opens the match menu. Plain lookups: the HUD
 * asks every frame, and nothing is allocated.
 */
import type { Device } from "./device.ts"
import type { Strings } from "./i18n.ts"

export const playPrompt = (s: Strings, device: Device): string => s.hud.play[device]

/** The control that opens the match menu: Esc, the controller's Options, the ☰ button on the screen. */
const MENU_CONTROL = { keyboard: "<kbd>Esc</kbd>", pad: "<kbd>Options</kbd>", touch: "<kbd>☰</kbd>" } as const satisfies Record<Device, string>

export const menuControl = (device: Device): string => MENU_CONTROL[device]

export const turretPrompt = (s: Strings, device: Device, mounted: boolean): string => (mounted ? s.hud.turretLeave : s.hud.turretUse)[device]
