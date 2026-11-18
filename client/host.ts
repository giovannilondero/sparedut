/**
 * The host of an Offline room: the game server's own `Hub`, rooms, bots and navigation, run in
 * the player's browser (off the main thread, see `host.worker.ts`). It creates only Offline rooms.
 * See docs/adr/0001-offline-rooms-hosted-in-the-browser.md.
 */
import { Hub, type Clock } from "../server/hub.ts"
import type { Room } from "../server/room.ts"
import { BROWSER_REACHES } from "../shared/protocol.ts"
import { MatchClock } from "./match-clock.ts"

/**
 * Pausing is the host not stepping: its match clock stops, so no tick elapses and none is caught
 * up on resume. Messages are still handled, so host tools used while paused take effect.
 * The simulation never hears about it.
 */
class BrowserHub extends Hub {
  private readonly match: MatchClock

  constructor(clock: Clock) {
    super(clock, BROWSER_REACHES)
    this.match = new MatchClock(clock)
  }

  // An Offline room has one player and nobody else to wait for: their pause is the room's.
  protected override pause(_room: Room, paused: boolean) {
    if (paused) this.match.pause()
    else this.match.resume()
  }

  override update() {
    super.update(this.match.now())
  }
}

export const createBrowserHost = (clock: Clock = () => performance.now()): Hub => new BrowserHub(clock)
