/**
 * Station 12, the skirmish: a short Bataie di Gnot on the square's east half against bots that
 * fire, at the room's skill (a training's is the lowest); then the scoreboard and a quick phrase,
 * which the simulation cannot see, so the client reports them (`../interface.ts`).
 *
 * Here the trainee can die (`../spared.ts`) and respawns on the Benandanti's side of the skirmish
 * (`SAGRE.spawns`). Kills score as in a Bataie (`ApplyDamage`), but the earlier stations' objectives
 * have already raised the score: the step counts the Benandanti's points from when it began.
 */
import { SAGRE } from "../../maps/sagre.ts"
import { MAX_HP } from "../../sim/rules.ts"
import { counted, pointsSince, station, type StationBot, type StepRule } from "../station.ts"

/** The Benandanti's points that win the skirmish: one a kill. */
export const SKIRMISH_SCORE = 5

/** A Malandant that fights, posted on one of its side's spawns. */
const foe = (i: number): StationBot => ({ team: "malandanti", route: [SAGRE.spawns.malandanti[i].at], fires: true, hp: MAX_HP })

/** A step done by the client's report of `action`. */
const reported = (action: "board" | "phrases"): StepRule => ({ ...counted(action, 1, (seen) => seen.reported), report: action })

export const SKIRMISH_STATION = station({
  // Two foes and no bot teammate: the trainee's own kills win it, and two is a first fight a newcomer can win.
  setup: { objective: "none", bots: [foe(0), foe(1)] },
  steps: {
    /** Win the skirmish: the Benandanti score `SKIRMISH_SCORE`. */
    win: pointsSince("fire", SKIRMISH_SCORE),
    /** Open the scoreboard. */
    board: reported("board"),
    /** Send a quick phrase. */
    phrases: reported("phrases")
  }
})
