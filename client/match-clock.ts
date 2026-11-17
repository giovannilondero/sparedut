/**
 * The time an Offline match lives in: a clock that stands still while the match is paused, and
 * after a resume goes on from where it stopped. The paused time never happened, for whoever reads it
 * (the host's steps, the client's prediction and its interpolation of the others).
 */
export class MatchClock {
  private stopped: number | null = null
  /** Real time spent paused, already left out. */
  private away = 0

  /** `real`: milliseconds from any origin, e.g. `performance.now`. */
  constructor(private readonly real: () => number) {}

  /** Milliseconds, from the same origin as the real clock until the first pause. */
  now() {
    return (this.stopped ?? this.real()) - this.away
  }

  get paused() {
    return this.stopped !== null
  }

  pause() {
    this.stopped ??= this.real()
  }

  resume() {
    if (this.stopped === null) return
    this.away += this.real() - this.stopped
    this.stopped = null
  }
}
