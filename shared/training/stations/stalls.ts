/**
 * Station 5. The stalls: one step per primary that shoots, each at its own stall, with that weapon
 * given in hand and its ammunition refilled. The Cramâr on a moving bot, the Dopiete on a close
 * one, the Cjampanili on a far one through the scope, the Mulin spun up and firing, and a hen of the
 * Cjanon des Gjalinis that finds a moving bot. The Cassele dal Miedi has its own station (10).
 *
 * The map gives each stall a target; a station keeps four bots at most, so the Mulin shares the
 * Cjanon's moving bot and the map's own Mulin target stays empty.
 */
import { SAGRE_STATIONS } from "../../maps/sagre.ts"
import { held } from "../../sim/controls.ts"
import { WEAPONS, type PrimaryId } from "../../weapons.ts"
import { blastHit, counted, harmlessFoe, NOTHING_YET, station, type ControlId, type Seen, type StationBot, type StepRule } from "../station.ts"

const PLACE = SAGRE_STATIONS.stalls

/** A stall: one per primary that shoots (not the Miedi's beam, nor the Motosee, which the training leaves out). Its id is its weapon's. */
export type StallId = Exclude<PrimaryId, "miedi" | "motosee">

/** Whose target each stall's weapon is meant for: the Mulin shares the Cjanon's moving bot. */
export const STALL_SHOOTS_AT = {
  cramar: "cramar",
  doplete: "doplete",
  cjampanili: "cjampanili",
  mulin: "gjalinis",
  gjalinis: "gjalinis"
} as const satisfies Record<StallId, StallId>

/** Hits on the moving bot the Cramâr's step needs. */
export const CRAMAR_HITS = 5
/** Hits the Mulin's step needs once it is spun up. */
export const MULIN_HITS = 8
/** The farthest a Dopiete hit counts as close (m). */
export const DOPLETE_CLOSE = 8
/** The nearest a Cjampanili hit counts as far (m). */
export const CJAMPANILI_FAR = 30
/**
 * Ticks the aim must be held before a shot is one through the scope: the first-person view puts
 * the scope up once aiming is 85% done, which takes about 10 ticks (`client/firstperson.ts`).
 */
export const SCOPED_AFTER_TICKS = 10

/** A stall's target: a Malandant on its route that never fires. */
const target = (stall: StallId): StationBot => harmlessFoe(PLACE.stalls[stall].target)

/**
 * How many players the trainee hit this tick with a shot of `weapon` whose distance passes `within`
 * (the distance from the muzzle to where a pellet stopped on a body).
 */
const shotHits = (seen: Seen, weapon: StallId, within: (metres: number) => boolean = () => true) => {
  const me = seen.me.session
  const shot = seen.events.find((e) => e.t === "shot" && e.s === me && e.w === weapon)
  if (shot?.t !== "shot") return 0
  const range = WEAPONS[weapon].range
  const onBody = shot.e.some((end, i) => {
    if (shot.hw[i]) return false
    const dx = end[0] - shot.o[0]
    const dy = end[1] - shot.o[1]
    const dz = end[2] - shot.o[2]
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    return d < range - 1e-3 && within(d)
  })
  if (!onBody) return 0
  let n = 0
  for (const e of seen.events) if (e.t === "hit" && e.a === me && e.v !== me) n++
  return n
}

/** A stall's step: its weapon given as it begins. */
const stall = (weapon: StallId, rule: StepRule): StepRule => ({ ...rule, given: { primary: weapon, hold: weapon } })

/** The Cjampanili's step: `mark` counts the ticks the aim has been held without a break. */
const throughTheScope = (control: ControlId): StepRule => ({
  control,
  target: 1,
  begin: () => NOTHING_YET,
  advance: (seen, now) => {
    const aimed = held(seen.me.controls, "aim") ? now.mark + 1 : 0
    const scoped = aimed > SCOPED_AFTER_TICKS && shotHits(seen, "cjampanili", (d) => d >= CJAMPANILI_FAR) > 0
    return { count: now.count + (scoped ? 1 : 0), mark: aimed }
  }
})

export const STALLS_STATION = station({
  setup: {
    objective: "none",
    bots: [target("cramar"), target("doplete"), target("cjampanili"), target("gjalinis")]
  },
  steps: {
    cramar: stall("cramar", counted("fire", CRAMAR_HITS, (seen) => shotHits(seen, "cramar"))),
    doplete: stall("doplete", counted("fire", 1, (seen) => (shotHits(seen, "doplete", (d) => d <= DOPLETE_CLOSE) > 0 ? 1 : 0))),
    cjampanili: stall("cjampanili", throughTheScope("aim")),
    // The Mulin fires only once spun up: a hit with it is a hit after the spin-up.
    mulin: stall("mulin", counted("fire", MULIN_HITS, (seen) => (seen.me.arsenal.spin >= WEAPONS.mulin.spinTicks ? shotHits(seen, "mulin") : 0))),
    gjalinis: stall("gjalinis", counted("fire", 1, (seen) => (blastHit(seen, "gjaline") ? 1 : 0)))
  }
})
