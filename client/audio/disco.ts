/**
 * "Fenicotars a Maran": la discoteca originale del casot di osservazione. 124 bpm,
 * cassa dritta, controtempo aperto, basso a ottave, accordi d'archi e un arpeggio
 * di synth. 8 battute in la minore, loop senza cuciture; più una copia attutita
 * (passa-basso) per quando la porta è chiusa.
 */
import { buffer, len, midi, normalize, reverb, rng, Svf, voice } from "./dsp.ts"

const BPM = 124
const BEAT = 60 / BPM
const BAR = BEAT * 4
const BARS = 8

/** Am, F, C, G, due volte: fondamentale del basso e voci degli archi (MIDI). */
const CHORDS: readonly (readonly [number, readonly number[]])[] = [
  [45, [57, 60, 64]],
  [41, [57, 60, 65]],
  [48, [55, 60, 64]],
  [43, [55, 59, 62]]
]
/** L'arpeggio: un giro per accordo, a sedicesimi. */
const ARP = [0, 1, 2, 1, 2, 0, 1, 2] as const

type Job = (out: Float32Array) => void

export interface DiscoLoop {
  readonly open: Float32Array
  readonly muffled: Float32Array
}

export async function renderDisco(): Promise<DiscoLoop> {
  const loop = len(BAR * BARS)
  const out = buffer(BAR * BARS + 2)
  const r = rng(124)
  const jobs: Job[] = []
  for (let bar = 0; bar < BARS; bar++) {
    const at = bar * BAR
    const [root, chord] = CHORDS[bar % CHORDS.length]
    jobs.push((o) => {
      for (let b = 0; b < 4; b++) {
        const t = at + b * BEAT
        // cassa: seno che precipita, con un clic in testa
        voice(o, { at: t, dur: 0.32, wave: "sin", f: (x) => 48 + 110 * Math.exp(-x / 0.03), amp: 0.95, a: 0.001, d: 0.12 })
        voice(o, { at: t, dur: 0.01, wave: "noise", hp: 3000, amp: 0.25, d: 0.003, rnd: r })
        // charleston aperto in controtempo, chiuso sui sedicesimi
        voice(o, { at: t + BEAT / 2, dur: 0.16, wave: "noise", hp: 7500, amp: 0.22, a: 0.002, d: 0.05, rnd: r })
        for (const k of [0.25, 0.75]) voice(o, { at: t + BEAT * k, dur: 0.03, wave: "noise", hp: 9000, amp: 0.08, d: 0.008, rnd: r })
        // battimani sul due e sul quattro: tre scoppi ravvicinati
        if (b % 2 === 1) for (const k of [0, 0.011, 0.022]) voice(o, { at: t + k, dur: 0.18, wave: "noise", bp: 1400, q: 1.2, amp: k === 0.022 ? 0.45 : 0.25, a: 0.001, d: k === 0.022 ? 0.06 : 0.008, rnd: r })
      }
    })
    jobs.push((o) => {
      // basso a ottave sugli ottavi
      for (let k = 0; k < 8; k++) {
        const n = root - 12 + (k % 2 === 1 ? 12 : 0)
        voice(o, { at: at + k * (BEAT / 2), dur: BEAT * 0.42, wave: "saw", f: midi(n), amp: 0.32, a: 0.004, d: 0.12, lp: (x) => 300 + 1200 * Math.exp(-x / 0.05), q: 1.4 })
        voice(o, { at: at + k * (BEAT / 2), dur: BEAT * 0.42, wave: "sin", f: midi(n), amp: 0.35, a: 0.004, d: 0.15 })
      }
    })
    jobs.push((o) => {
      // archi: accordo lungo che respira, e stacchi sul levare
      for (const n of chord) voice(o, { at, dur: BAR, wave: "saw", f: midi(n), detune: [0, 8, -6], amp: 0.05, env: (x) => Math.min(1, x / 0.3) * (x > BAR - 0.1 ? Math.max(0, (BAR - x) / 0.1) : 1), lp: 2200 })
      for (let b = 0; b < 4; b++) {
        for (const n of chord) voice(o, { at: at + b * BEAT + BEAT * 0.5, dur: 0.14, wave: "saw", f: midi(n + 12), detune: [0, 10], amp: 0.06, a: 0.003, d: 0.05, lp: 3500 })
      }
    })
    jobs.push((o) => {
      // arpeggio di synth, solo nella seconda metà
      if (bar < 4) return
      for (let k = 0; k < 16; k++) {
        const n = chord[ARP[k % ARP.length]] + 12
        voice(o, { at: at + k * (BEAT / 4), dur: BEAT / 4, wave: "sqr", pw: 0.3, f: midi(n), amp: 0.06, a: 0.002, d: 0.06, lp: 2600 })
      }
    })
  }
  let last = performance.now()
  for (const job of jobs) {
    job(out)
    if (performance.now() - last > 8) {
      await new Promise((res) => setTimeout(res, 0))
      last = performance.now()
    }
  }
  reverb(out, 0.12, 0.8, 0.4)
  await new Promise((res) => setTimeout(res, 0))
  // ripiega la coda sull'inizio
  for (let i = loop; i < out.length; i++) out[i - loop] += out[i]
  const open = normalize(out.slice(0, loop), 0.8)
  // dietro la porta: restano la cassa e il basso, il resto è un ronzio
  const muffled = new Float32Array(open.length)
  const lp = new Svf(260, 0.8)
  // due giri per partire a regime: il filtro non deve "attaccare" all'inizio del loop
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < open.length; i++) {
      lp.run(open[i])
      if (pass === 1) muffled[i] = lp.low
    }
  }
  return { open, muffled: normalize(muffled, 0.7) }
}
