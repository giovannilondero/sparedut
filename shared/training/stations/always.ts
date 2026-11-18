/**
 * Station 3. Always with you: the Mandi and the mescul, the two weapons every player carries.
 * Hit a target with the Mandi, hit one while aiming, reload, hit one with the mescul, then kick
 * the shed's door down with the mescul. The targets are bots that walk or stand and never fire.
 */
import { SAGRE_STATIONS } from "../../maps/sagre.ts"
import { MAX_HP } from "../../sim/rules.ts"
import { held, justPressed } from "../../sim/controls.ts"
import { once, station, type Seen, type StationBot } from "../station.ts"

const PLACE = SAGRE_STATIONS[2]

/** A target: a Malandant that walks its route, or stands, and never fires. */
const target = (route: StationBot["route"]): StationBot => ({ team: "malandanti", route, fires: false, hp: MAX_HP })

/** Whether the trainee hit someone this tick with a shot of `weapon`. */
const shotHit = (seen: Seen, weapon: "mandi") =>
  seen.events.some((e) => e.t === "shot" && e.s === seen.me.session && e.w === weapon) && seen.events.some((e) => e.t === "hit" && e.a === seen.me.session)

/** Whether the trainee swung the mescul this tick. */
const swung = (seen: Seen) => seen.events.some((e) => e.t === "melee" && e.s === seen.me.session)

export const ALWAYS_STATION = station({
  setup: {
    hold: "mandi",
    objective: "none",
    bots: [target(PLACE.targets.mandi), target(PLACE.targets.aim), target(PLACE.targets.mescul)]
  },
  steps: {
    mandiHit: once("fire", (seen) => shotHit(seen, "mandi")),
    aimedHit: once("aim", (seen) => shotHit(seen, "mandi") && held(seen.me.controls, "aim")),
    reload: once("reload", (seen) => justPressed(seen.me.controls, "reload") && seen.events.some((e) => e.t === "reload" && e.s === seen.me.session)),
    mesculHit: once("slot", (seen) => swung(seen) && seen.events.some((e) => e.t === "hit" && e.a === seen.me.session)),
    doorDown: once("fire", (seen) => swung(seen) && seen.events.some((e) => e.t === "door" && e.a === "broken" && e.i === PLACE.door && e.s === seen.me.session))
  }
})
