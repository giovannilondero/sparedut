/**
 * What the prompts say for the active device: the prompt to start playing, and near a turret
 * the control that mounts it or, while mounted, the one that dismounts. Plain lookups: the HUD
 * asks every frame, and nothing is allocated.
 */
import type { Device } from "./device.ts"
import type { Strings } from "./i18n.ts"

export const playPrompt = (s: Strings, device: Device): string => s.hud.play[device]

export const turretPrompt = (s: Strings, device: Device, mounted: boolean): string => (mounted ? s.hud.turretLeave : s.hud.turretUse)[device]
