/**
 * Station 7, bombs and mines: throw a bomba di sgnape at the Malandants standing down the street,
 * then plant a mina di Raibl where one walks, and let him set it off. The bots never fire. Bombs
 * and mines are given back as soon as the last is used, so a miss never leaves the step undoable.
 */
import { SAGRE_STATIONS } from "../../maps/sagre.ts"
import { blastHit, harmlessFoe, once, station, type Seen } from "../station.ts"

const PLACE = SAGRE_STATIONS.throw

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
    bots: [...PLACE.bombTargets.map((at) => harmlessFoe([at])), harmlessFoe(PLACE.mineRoute)],
    restock: true
  },
  steps: {
    bomb: once("bomb", (seen) => blastHit(seen, "sgnape")),
    mine: once("mine", mineSetOff)
  }
})
