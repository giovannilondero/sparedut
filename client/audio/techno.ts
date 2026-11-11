/**
 * "Villotta Techno": the menu waltz ("Villotta dal Sparedût") remixed for the casot in Maran.
 * 128 bpm, four-on-the-floor. The waltz melody is moved from 3/4 to 4/4 by stretching the
 * first two beats of each bar to a dotted quarter each (a 3-3-2 groove), so every waltz bar
 * becomes one techno bar. 32 bars, seamless loop: filtered intro, the tune, the bridge with
 * an arpeggio, the full reprise and a snare roll that drops back into the start.
 * Plus a muffled copy (low-pass) for when the door is closed.
 */
import { A, A_END, B, CH_A, CH_B } from "./music.ts"
import { buffer, len, midi, normalize, reverb, rng, SR, Svf, voice } from "./dsp.ts"
import { CHORDS, type Chord, type Note } from "./instruments.ts"
import type { DiscoLoop } from "./disco.ts"

const BPM = 128
const BEAT = 60 / BPM
const BAR = BEAT * 4
const BARS = 32
const S16 = BEAT / 4

/** Waltz position in the bar (0..3 beats) → techno position (0..4 beats): 3-3-2. */
const straighten = (p: number) => (p <= 2 ? p * 1.5 : 3 + (p - 2))

/** The waltz melody as [start, pitch, length] in techno beats from the section start. */
function remap(notes: readonly Note[]): [number, number, number][] {
  const at = (p: number) => {
    const bar = Math.floor(p / 3 + 1e-9)
    return bar * 4 + straighten(p - bar * 3)
  }
  const out: [number, number, number][] = []
  let t = 0
  for (const [n, b] of notes) {
    const s = at(t)
    const e = at(t + b)
    if (n != null) out.push([s, n, e - s])
    t += b
  }
  return out
}

type Section = { notes: readonly Note[]; chords: readonly Chord[] }
/** Bars 0-7 intro (the tune behind a closed filter), 8-15 the tune, 16-23 bridge, 24-31 reprise. */
const SECTIONS: readonly Section[] = [
  { notes: A, chords: CH_A },
  { notes: A, chords: CH_A },
  { notes: B, chords: CH_B },
  { notes: A_END, chords: CH_A }
]

type Job = (music: Float32Array, drums: Float32Array) => void

/** Detuned saw pluck with a closing filter: the lead. */
function pluck(o: Float32Array, at: number, note: number, dur: number, amp: number, bright: number) {
  const f = midi(note)
  const lp = (t: number) => 300 + bright * Math.exp(-t / 0.14)
  voice(o, { at, dur: dur + 0.05, wave: "saw", f, detune: [0, 11, -11], amp, a: 0.003, d: 0.45, lp, q: 2.2 })
  voice(o, { at, dur: dur + 0.05, wave: "sqr", pw: 0.25, f: f * 2, amp: amp * 0.25, a: 0.003, d: 0.2, lp: bright * 0.8 })
}

export async function renderTechno(): Promise<DiscoLoop> {
  const loop = len(BAR * BARS)
  const music = buffer(BAR * BARS + 3)
  const drums = buffer(BAR * BARS + 3)
  const r = rng(128)
  const jobs: Job[] = []

  SECTIONS.forEach(({ notes, chords }, s) => {
    const at0 = s * 8 * BAR
    const intro = s === 0
    const bridge = s === 2
    const reprise = s === 3
    // lead: in the intro the filter opens bar by bar
    for (const [b, n, d] of remap(notes)) {
      const t = at0 + b * BEAT
      const bright = intro ? 250 + 2600 * ((t - at0) / (8 * BAR)) ** 1.5 : bridge ? 2600 : 3400
      jobs.push((m) => {
        pluck(m, t, n, d * BEAT * 0.85, intro ? 0.11 : 0.13, bright)
        // reprise: an octave below doubles the lead, wider
        if (reprise) pluck(m, t, n - 12, d * BEAT * 0.85, 0.09, 2200)
      })
    }
    chords.forEach((c, i) => {
      const at = at0 + i * BAR
      const bar = s * 8 + i
      const { root, voices } = CHORDS[c]
      jobs.push((m) => {
        // rolling bass: three sixteenths after every kick, the kick keeps the downbeat
        for (let b = 0; b < 4; b++) {
          for (const k of [1, 2, 3]) {
            const n = root - 12 + (k === 2 ? 12 : 0)
            voice(m, { at: at + b * BEAT + k * S16, dur: S16 * 0.9, wave: "saw", f: midi(n), amp: 0.26, a: 0.002, d: 0.06, lp: (x) => 180 + 900 * Math.exp(-x / 0.03), q: 1.6 })
            voice(m, { at: at + b * BEAT + k * S16, dur: S16 * 0.9, wave: "sin", f: midi(root - 12), amp: 0.3, a: 0.002, d: 0.09 })
          }
        }
        // dark pad from the second section: a held chord under the tune
        if (!intro) for (const n of voices) voice(m, { at, dur: BAR, wave: "saw", f: midi(n - 12), detune: [0, 7, -9], amp: 0.035, env: (x) => Math.min(1, x / 0.4) * (x > BAR - 0.15 ? Math.max(0, (BAR - x) / 0.15) : 1), lp: 900 })
        // bridge arpeggio: chord tones two octaves up, in sixteenths
        if (bridge || reprise) {
          const tones = [...voices.map((v) => v + 12), voices[0] + 24]
          for (let k = 0; k < 16; k++) {
            const n = tones[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]]
            voice(m, { at: at + k * S16, dur: S16, wave: "sqr", pw: 0.3, f: midi(n), amp: reprise ? 0.035 : 0.05, a: 0.002, d: 0.05, lp: 3200 })
          }
        }
      })
      jobs.push((_, d) => {
        const last = bar === BARS - 1
        for (let b = 0; b < 4; b++) {
          const t = at + b * BEAT
          // last bar: the kick stops halfway for the roll
          if (!(last && b >= 2)) {
            voice(d, { at: t, dur: 0.38, wave: "sin", f: (x) => 45 + 140 * Math.exp(-x / 0.025), amp: 1, a: 0.001, d: 0.16 })
            voice(d, { at: t, dur: 0.008, wave: "noise", hp: 2500, amp: 0.3, d: 0.002, rnd: r })
          }
          // closed hats on the sixteenths, accented on the offbeat; open hat from the second section
          for (let k = 0; k < 4; k++) {
            if (k === 2 && !intro) continue
            voice(d, { at: t + k * S16, dur: 0.03, wave: "noise", hp: 8500, amp: k === 2 ? 0.16 : k % 2 ? 0.07 : 0.05, d: 0.009, rnd: r })
          }
          if (!intro) voice(d, { at: t + BEAT / 2, dur: 0.2, wave: "noise", hp: 7000, amp: 0.2, a: 0.002, d: 0.06, rnd: r })
          // clap on two and four from bar 4
          if (b % 2 === 1 && bar >= 4 && !(last && b === 3)) {
            for (const k of [0, 0.01, 0.02]) voice(d, { at: t + k, dur: 0.2, wave: "noise", bp: 1300, q: 1.3, amp: k === 0.02 ? 0.4 : 0.22, a: 0.001, d: k === 0.02 ? 0.07 : 0.007, rnd: r })
          }
          // ride on the beat in the bridge and reprise
          if (bridge || reprise) voice(d, { at: t, dur: 0.4, wave: "noise", bp: 5200, q: 3, amp: 0.05, a: 0.001, d: 0.16, rnd: r })
        }
        if (last) {
          // snare roll: sixteenths over the last two beats, growing
          for (let k = 0; k < 8; k++) voice(d, { at: at + 2 * BEAT + k * S16, dur: 0.12, wave: "noise", bp: 1800 + k * 150, q: 1, amp: 0.12 + k * 0.04, a: 0.001, d: 0.04, rnd: r })
        }
        if (bar >= BARS - 2) {
          // white noise riser across the last two bars
          const from = (bar - (BARS - 2)) * BAR
          voice(d, { at, dur: BAR, wave: "noise", hp: (x) => 400 + 6000 * ((from + x) / (2 * BAR)) ** 2, amp: (x) => 0.12 * ((from + x) / (2 * BAR)) ** 2, a: 0.001, rnd: r })
        }
      })
    })
  })

  let last = performance.now()
  for (const job of jobs) {
    job(music, drums)
    if (performance.now() - last > 8) {
      await new Promise((res) => setTimeout(res, 0))
      last = performance.now()
    }
  }
  reverb(music, 0.2, 1, 0.35)
  await new Promise((res) => setTimeout(res, 0))
  // sidechain: the music ducks under every kick (not in the second half of the last bar)
  for (let i = 0; i < music.length; i++) {
    const t = (i / SR) % (BAR * BARS)
    if (t >= BAR * (BARS - 0.5)) continue
    const x = t % BEAT
    music[i] *= 1 - 0.65 * Math.exp(-x / 0.09)
  }
  const out = new Float32Array(music.length)
  for (let i = 0; i < out.length; i++) out[i] = music[i] * 1.1 + drums[i] * 0.85
  // fold the tail back onto the start
  for (let i = loop; i < out.length; i++) out[i - loop] += out[i]
  const open = normalize(out.slice(0, loop), 0.85)
  // behind the door: the kick and bass remain, the rest is a hum
  const muffled = new Float32Array(open.length)
  const lp = new Svf(260, 0.8)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < open.length; i++) {
      lp.run(open[i])
      if (pass === 1) muffled[i] = lp.low
    }
  }
  return { open, muffled: normalize(muffled, 0.7) }
}
