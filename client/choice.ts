/**
 * A `valuechange` listener for a UI SDK choice that always has a value (a card group, a select): a
 * change to none is refused, and `choose` hears every other value (an item's key) with the reason
 * it changed.
 */
export const alwaysChosen =
  (choose: (value: string, reason: string) => void) =>
  (e: CustomEvent<{ readonly value: unknown; readonly reason: string }>): void => {
    if (e.detail.value === null) return e.preventDefault()
    choose(String(e.detail.value), e.detail.reason)
  }
