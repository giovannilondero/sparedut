/**
 * "Villotta dal Sparedût": musica originale del menu, valzer in 3/4 in sol maggiore.
 * Fisarmonica musette, clarinetto e oom-pah-pah. 32 battute, loop senza cuciture:
 * la coda del riverbero viene ripiegata sull'inizio.
 */
import { buffer, len, normalize, reverb, voice } from "./dsp.ts"
import { accordion, clarinet, melody, oomPahPah, thirdBelow, type Chord, type Note } from "./instruments.ts"

const BEAT = 60 / 144
const BAR = BEAT * 3

const A: readonly Note[] = [
  [71, 1.5], [72, 0.5], [74, 1],
  [79, 2], [74, 1],
  [72, 1], [69, 1], [66, 1],
  [67, 2], [71, 1],
  [76, 1.5], [74, 0.5], [72, 1],
  [71, 1], [74, 1], [79, 1],
  [78, 1], [76, 1], [72, 1],
  [67, 2], [62, 1]
]
const A_END: readonly Note[] = [...A.slice(0, -2), [67, 2], [74, 1]]
const B: readonly Note[] = [
  [81, 1], [78, 1], [74, 1],
  [78, 1.5], [76, 0.5], [74, 1],
  [71, 1], [74, 1], [79, 1],
  [83, 2], [81, 1],
  [79, 1], [76, 1], [72, 1],
  [76, 1.5], [78, 0.5], [79, 1],
  [81, 1], [78, 1], [72, 1],
  [71, 2], [74, 1]
]
const CH_A: readonly Chord[] = ["G", "G", "D7", "G", "C", "G", "D7", "G"]
const CH_B: readonly Chord[] = ["D7", "D7", "G", "G", "C", "C", "D7", "G"]

/** Ogni compito suona un pezzetto; fra uno e l'altro si cede il controllo al browser. */
type Job = (out: Float32Array) => void

export async function renderVillotta(): Promise<Float32Array> {
  const loop = len(BAR * 32)
  const out = buffer(BAR * 32 + 3)
  const jobs: Job[] = []
  const sections: [readonly Note[], readonly Chord[], "cla" | "acc" | "both"][] = [
    [A, CH_A, "cla"],
    [A, CH_A, "acc"],
    [B, CH_B, "cla"],
    [A_END, CH_A, "both"]
  ]
  sections.forEach(([notes, chords, lead], s) => {
    const at = s * 8 * BAR
    // un compito per nota: ognuno dura pochi millisecondi
    if (lead !== "acc") melody(notes, at, BEAT, (t, n, d) => jobs.push(o => clarinet(o, t, n, d, lead === "both" ? 0.16 : 0.2)))
    if (lead !== "cla") melody(notes, at, BEAT, (t, n, d) => jobs.push(o => accordion(o, t, n + (lead === "both" ? 12 : 0), d, 0.08, 3200)))
    // seconda voce a terze nella ripresa
    if (lead === "acc") melody(notes, at, BEAT, (t, n, d) => jobs.push(o => clarinet(o, t, thirdBelow(n), d, 0.1)))
    chords.forEach((c, i) => jobs.push(o => oomPahPah(o, at + i * BAR, BEAT, c, i % 2 === 1, 0.9)))
    // tamburello leggero sul due e sul tre
    jobs.push(o => {
      for (let i = 0; i < 8; i++) {
        for (const b of [1, 2]) voice(o, { at: at + i * BAR + b * BEAT, dur: 0.06, wave: "noise", hp: 6000, amp: 0.05, d: 0.02 })
      }
    })
  })
  let last = performance.now()
  for (const job of jobs) {
    job(out)
    if (performance.now() - last > 8) {
      await new Promise(r => setTimeout(r, 0))
      last = performance.now()
    }
  }
  reverb(out, 0.18, 1.1, 0.35)
  await new Promise(r => setTimeout(r, 0))
  // ripiega la coda sull'inizio: il loop non ha salti
  for (let i = loop; i < out.length; i++) out[i - loop] += out[i]
  return normalize(out.slice(0, loop), 0.8)
}
