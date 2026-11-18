/**
 * Station 10, the medic: the trainee is given the Cassele dal Miedi and heals a wounded teammate,
 * a Benandante who stands still and never fires, to full health.
 */
import { SAGRE_STATIONS } from "../../maps/sagre.ts"
import { MAX_HP } from "../../sim/rules.ts"
import { counted, station, type Seen } from "../station.ts"

/** The wounded teammate's health on every spawn: the step asks for the rest, up to full. */
export const WOUNDED_HP = 30

/** How much health the trainee must restore to the teammate: from `WOUNDED_HP` to full. */
export const TO_RESTORE = MAX_HP - WOUNDED_HP

const PLACE = SAGRE_STATIONS[9]

/**
 * Health the trainee restored to a teammate this tick, by the beam or by standing near (both are the
 * medic's healing). Heals are clamped at full health and nothing else at the station heals or hurts
 * the teammate, so the count reaches `TO_RESTORE` on the tick the teammate is whole again.
 */
const restored = (seen: Seen) => {
  let n = 0
  for (const e of seen.events) if (e.t === "heal" && e.s === seen.me.session && e.v !== seen.me.session) n += e.n
  return n
}

export const MEDIC_STATION = station({
  setup: {
    primary: "miedi",
    objective: "none",
    bots: [{ team: "benandanti", route: [PLACE.wounded.at], fires: false, hp: WOUNDED_HP }]
  },
  steps: {
    heal: counted("fire", TO_RESTORE, restored)
  }
})
