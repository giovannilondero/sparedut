/**
 * The HUD's weapon panel, from what the player carries: no DOM.
 */
import { expect, test } from "bun:test"
import { freshArsenal } from "../shared/sim/rules.ts"
import { hudSlots } from "../client/hud.ts"

test("with the full kit the panel lists the four slots, the Lanciafrico greyed out until it is picked up, and the bombs and mines", () => {
  const a = freshArsenal("cramar")
  expect(hudSlots(a)).toEqual({
    slots: [
      { key: "1", id: "cramar", state: "inHand" },
      { key: "2", id: "mandi", state: "owned" },
      { key: "3", id: "lanciafrico", state: "missing" },
      { key: "4", id: "mescul", state: "owned" }
    ],
    sidearms: true
  })
  expect(hudSlots({ ...a, power: "lanciafrico", current: "lanciafrico" }).slots[2]).toEqual({ key: "3", id: "lanciafrico", state: "inHand" })
})

test("under single weapon the panel lists only what the player can have: the primary and the Mescul, no bombs or mines", () => {
  const a = { ...freshArsenal("motosee", "single"), current: "mescul" as const }
  expect(hudSlots(a)).toEqual({
    slots: [
      { key: "1", id: "motosee", state: "owned" },
      { key: "4", id: "mescul", state: "inHand" }
    ],
    sidearms: false
  })
})

test("under single weapon the casot's panel, which still can be carried, shows in its slot while carried", () => {
  const a = { ...freshArsenal("doplete", "single"), power: "panel" as const }
  expect(hudSlots(a).slots.map((s) => s.id)).toEqual(["doplete", "panel", "mescul"])
})
