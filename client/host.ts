/**
 * The host of an Offline room: the game server's own `Hub`, rooms, bots and navigation, run in
 * the player's browser (off the main thread, see `host.worker.ts`). It creates only Offline rooms.
 * See docs/adr/0001-offline-rooms-hosted-in-the-browser.md.
 */
import { Hub, type HubOptions } from "../server/hub.ts"
import { BROWSER_REACHES } from "../shared/protocol.ts"

export const createBrowserHost = (options: Omit<HubOptions, "reaches"> = {}) => new Hub({ ...options, reaches: BROWSER_REACHES })
