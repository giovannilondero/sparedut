/**
 * The others' bodies: one drawn for each player the latest snapshot has, taken away once a snapshot
 * no longer has it (a player who left, a training station's bots replaced by the next station's).
 * The roster only names and colours them: taking bodies away on a roster that arrives between two
 * snapshots let the last snapshot draw them again, and nothing took them away after.
 */
export function takeAwayDeparted<Body>(drawn: Map<string, Body>, present: ReadonlyMap<string, unknown>, takeAway: (body: Body) => void) {
  for (const [id, body] of drawn) {
    if (present.has(id)) continue
    takeAway(body)
    drawn.delete(id)
  }
}
