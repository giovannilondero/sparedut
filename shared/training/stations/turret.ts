/**
 * Station 9, the turret and the Lanciafrico: mount the turret, fire the mitraie until it
 * overheats, dismount; then pick up the Lanciafrico and fire it.
 */
import { WEAPONS } from "../../weapons.ts"
import { SAGRE_STATIONS } from "../../maps/sagre.ts"
import { once, station, type Seen } from "../station.ts"

const PLACE = SAGRE_STATIONS.turret

/** The trainee's turret did this, this tick. */
const turret = (a: "on" | "off" | "hot") => (seen: Seen) => seen.events.some((e) => e.t === "turret" && e.i === PLACE.turret && e.a === a && e.s === seen.me.session)

export const TURRET_STATION = station({
  // The Lanciafrico is back on its spot on arrival; arriving takes away any launcher already held.
  setup: { objective: "none", bots: [], pickups: [PLACE.lanciafrico] },
  steps: {
    mount: once("use", turret("on")),
    overheat: once("fire", turret("hot")),
    dismount: once("use", turret("off")),
    pickLanciafrico: once("move", (seen) => seen.events.some((e) => e.t === "pick" && e.k === "lanciafrico" && e.s === seen.me.session)),
    fireLanciafrico: once(
      "fire",
      (seen) => seen.me.arsenal.current === "lanciafrico" && seen.events.some((e) => e.t === "launch" && e.k === WEAPONS.lanciafrico.shell && e.s === seen.me.session)
    )
  }
})
