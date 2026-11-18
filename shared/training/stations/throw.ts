/**
 * Station 7, bombs and mines: throw a bomba di sgnape at the Malandants standing down the street,
 * then plant a mina di Raibl where one walks, and let him set it off. The bots never fire. Bombs
 * and mines are given back as soon as the last is used, so a miss never leaves the step undoable.
 */
import { SAGRE_STATIONS } from "../../maps/sagre.ts"
import { MAX_HP } from "../../sim/rules.ts"
import { once, station, type Seen, type StationBot } from "../station.ts"

const PLACE = SAGRE_STATIONS.throw

/** A target: a Malandant that stands, or walks its route, and never fires. */
const target = (route: StationBot["route"]): StationBot => ({ team: "malandanti", route, fires: false, hp: MAX_HP })

/** Whether something of `kind` went off this tick and hurt someone other than the trainee, by the trainee's hand. */
const blastHit = (seen: Seen, kind: "sgnape" | "mine") =>
  seen.events.some((e) => e.t === "boom" && e.k === kind) && seen.events.some((e) => e.t === "hit" && e.a === seen.me.session && e.v !== seen.me.session)

/**
 * Whether a mine went off this tick. Only the trainee plants mines in a training (the station's
 * bots never fire) and a planted mine goes off only when an enemy walks over it, or after an hour
 * and a half: so this is a bot setting off the trainee's mine, hurt or not (a bot just back keeps
 * its shield a moment).
 */
const mineSetOff = (seen: Seen) => seen.events.some((e) => e.t === "boom" && e.k === "mine")

export const THROW_STATION = station({
  setup: {
    objective: "none",
    bots: [...PLACE.bombTargets.map((at) => target([at])), target(PLACE.mineRoute)],
    restock: true
  },
  steps: {
    bomb: once("bomb", (seen) => blastHit(seen, "sgnape")),
    mine: once("mine", mineSetOff)
  }
})
