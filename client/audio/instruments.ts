/**
 * Strumenti della banda di paese: fisarmonica (tre ance, "musette"), clarinetto,
 * basso della fisarmonica, ottone per le fanfare. Ognuno somma una nota in `out`.
 */
import { midi, voice } from "./dsp.ts"

/** Inviluppo attacco / sostegno / rilascio lineare. */
const asr = (a: number, hold: number, rel: number) => (t: number) =>
  t < a ? t / a : t < hold ? 1 : Math.max(0, 1 - (t - hold) / rel)

/** Fisarmonica: tre denti di sega leggermente scordati, tremolo del mantice. */
export function accordion(out: Float32Array, at: number, note: number, dur: number, amp = 0.2, bright = 2600) {
  const f = midi(note)
  const env = asr(0.025, dur, 0.07)
  const trem = (t: number) => amp * (1 + 0.12 * Math.sin(2 * Math.PI * 5.6 * t + at * 3))
  voice(out, { at, dur: dur + 0.08, wave: "saw", f, detune: [0, 9, -7], amp: trem, env, lp: bright, q: 0.9 })
}

/** Clarinetto: quadra (armoniche dispari), vibrato che arriva dopo l'attacco. */
export function clarinet(out: Float32Array, at: number, note: number, dur: number, amp = 0.25) {
  const f0 = midi(note)
  const f = (t: number) => f0 * (1 + 0.005 * Math.min(1, t / 0.25) * Math.sin(2 * Math.PI * 5.2 * t))
  const env = asr(0.035, dur, 0.06)
  voice(out, { at, dur: dur + 0.07, wave: "sqr", f, amp, env, lp: Math.min(2200, f0 * 5), q: 0.8 })
  voice(out, { at, dur: dur + 0.07, wave: "sin", f, amp: amp * 0.5, env })
}

/** Basso: "oom", corto e rotondo. */
export function bass(out: Float32Array, at: number, note: number, dur: number, amp = 0.35) {
  const f = midi(note)
  voice(out, { at, dur, wave: "saw", f, amp: amp * 0.6, a: 0.01, d: dur * 0.6, lp: 420 })
  voice(out, { at, dur, wave: "sin", f, amp, a: 0.006, d: dur * 0.7 })
}

/** Ottone: dente di sega con filtro che si apre sull'attacco. */
export function brass(out: Float32Array, at: number, note: number, dur: number, amp = 0.25) {
  const f = midi(note)
  const env = asr(0.03, dur, 0.1)
  const lp = (t: number) => 900 + 2600 * Math.exp(-t / 0.15) + 600 * Math.min(1, t / 0.05)
  voice(out, { at, dur: dur + 0.1, wave: "saw", f, detune: [0, 6], amp, env, lp, q: 1.1 })
}

/** Scala di sol maggiore (classi di altezza), per armonizzare a terze. */
const SCALE = [7, 9, 11, 0, 2, 4, 6]
export function thirdBelow(note: number, scale = SCALE) {
  const pc = ((note % 12) + 12) % 12
  const i = scale.indexOf(pc)
  if (i < 0) return note - 3
  const target = scale[(i + 5) % 7]
  let d = pc - target
  if (d <= 0) d += 12
  return note - d
}

/** Nota di una melodia: altezza MIDI (null = pausa) e durata in battiti. */
export type Note = readonly [number | null, number]

/** Suona una melodia a partire da `at`, `beat` secondi per battito. Ritorna la fine. */
export function melody(
  notes: readonly Note[],
  at: number,
  beat: number,
  play: (at: number, note: number, dur: number) => void
) {
  let t = at
  for (const [n, b] of notes) {
    if (n != null) play(t, n, b * beat * 0.92)
    t += b * beat
  }
  return t
}

/** Accordi del valzer: basso (fondamentale, quinta) e voci della mano destra. */
export const CHORDS = {
  G: { root: 43, fifth: 38, voices: [55, 59, 62] },
  C: { root: 48, fifth: 43, voices: [55, 60, 64] },
  D7: { root: 50, fifth: 45, voices: [54, 57, 60] },
  Am: { root: 45, fifth: 40, voices: [57, 60, 64] },
  Gm: { root: 43, fifth: 38, voices: [55, 58, 62] },
  Cm: { root: 48, fifth: 43, voices: [55, 60, 63] },
  Eb: { root: 51, fifth: 46, voices: [55, 58, 63] }
} as const
export type Chord = keyof typeof CHORDS

/** Una battuta di "oom-pah-pah": basso sul primo, accordo corto sul secondo e terzo. */
export function oomPahPah(out: Float32Array, at: number, beat: number, chord: Chord, alt: boolean, amp = 1) {
  const c = CHORDS[chord]
  bass(out, at, alt ? c.fifth : c.root, beat * 0.9, 0.4 * amp)
  for (const b of [1, 2]) for (const n of c.voices) accordion(out, at + b * beat, n, beat * 0.38, 0.045 * amp, 1900)
}
