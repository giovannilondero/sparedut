/**
 * Station 8, pickups: the trainee arrives hurt, without armour and with only what is in each
 * magazine, so that every pickup does something, and takes each kind in turn.
 */
import type { PickupKind } from "../../map.ts"
import { SAGRE_STATIONS } from "../../maps/sagre.ts"
import { once, station, type Seen } from "../station.ts"

/** Health on arrival: low enough that a frico heals all it gives (+40). */
export const PICKUPS_HP = 40

const PLACE = SAGRE_STATIONS[7]

/** The trainee took a pickup of this kind this tick. */
const took = (kind: PickupKind) => (seen: Seen) => seen.events.some((e) => e.t === "pick" && e.k === kind && e.s === seen.me.session)

/** A step that asks for the station's pickup of this kind: put back as the step begins, if it was taken out of turn. */
const take = (kind: keyof typeof PLACE.pickups) => ({ ...once("move", took(kind)), given: { pickups: [PLACE.pickups[kind]] } })

export const PICKUPS_STATION = station({
  setup: { objective: "none", bots: [], hp: PICKUPS_HP, armor: 0, ammo: "loaded", pickups: Object.values(PLACE.pickups) },
  steps: {
    frico: take("frico"),
    gubane: take("gubane"),
    sgnape: take("sgnape"),
    munizions: take("munizions")
  }
})
