/**
 * Ricette degli effetti: ogni suono del gioco sintetizzato da zero.
 * Alcuni hanno più varianti (passi, spari) per non suonare da mitragliatrice di campioni.
 */
import type { SoundName } from "../contracts.ts"
import { buffer, click, drive, echo, mode, normalize, reverb, rng, trim, voice, type Rnd } from "./dsp.ts"
import { accordion, brass, clarinet, melody, oomPahPah, type Chord, type Note } from "./instruments.ts"

type Recipe = (r: Rnd) => Float32Array

const exp = (from: number, to: number, tau: number) => (t: number) => to + (from - to) * Math.exp(-t / tau)
const done = (b: Float32Array, peak = 0.9) => trim(normalize(b, peak))

// --- armi -------------------------------------------------------------------------------

/** Sparo generico: schiocco, corpo che scende di tono, coda di rumore. */
function gunshot(r: Rnd, o: { crack: number; body: number; bodyD: number; tail: number; tailLp: number; drv: number; len: number }) {
  const b = buffer(o.len)
  voice(b, { dur: 0.01, wave: "noise", hp: 1500, amp: 1, a: 0.0002, d: 0.003, rnd: r })
  voice(b, { dur: 0.15, wave: "noise", bp: o.crack * (0.9 + r() * 0.2), q: 0.9, amp: 1.4, a: 0.0005, d: 0.02, rnd: r })
  voice(b, { dur: o.bodyD * 6, wave: "sin", f: exp(o.body * 2.5, o.body * 0.5, 0.03), amp: 1.1, a: 0.001, d: o.bodyD })
  voice(b, { dur: o.tail * 5, wave: "noise", lp: exp(o.tailLp * 3, o.tailLp * 0.5, o.tail), amp: 0.5, a: 0.002, d: o.tail, rnd: r })
  drive(b, o.drv)
  return b
}

const shotMandi: Recipe = r => {
  const b = gunshot(r, { crack: 2600, body: 150, bodyD: 0.05, tail: 0.09, tailLp: 1400, drv: 2.5, len: 0.6 })
  reverb(b, 0.18, 0.7)
  return done(b)
}

const shotCramar: Recipe = r => {
  const b = gunshot(r, { crack: 1500, body: 110, bodyD: 0.035, tail: 0.05, tailLp: 1100, drv: 3.5, len: 0.35 })
  // il "latrato": un po' di quadra ruvida in basso
  voice(b, { dur: 0.06, wave: "sqr", f: exp(260, 90, 0.02), amp: 0.25, d: 0.02, lp: 1200 })
  reverb(b, 0.12, 0.6)
  return done(b, 0.85)
}

const shotDoplete: Recipe = r => {
  const b = gunshot(r, { crack: 900, body: 70, bodyD: 0.14, tail: 0.28, tailLp: 1000, drv: 4, len: 1.6 })
  voice(b, { dur: 0.8, wave: "sin", f: exp(80, 32, 0.15), amp: 0.9, a: 0.003, d: 0.18 })
  voice(b, { at: 0.012, dur: 0.3, wave: "noise", lp: 3000, amp: 0.6, d: 0.05, rnd: r })
  drive(b, 1.5)
  reverb(b, 0.3, 1.1)
  return done(b, 0.95)
}

const shotCjampanili: Recipe = r => {
  const b = buffer(2.8)
  const shot = gunshot(r, { crack: 3500, body: 180, bodyD: 0.06, tail: 0.15, tailLp: 1800, drv: 3, len: 0.8 })
  voice(shot, { dur: 0.008, wave: "noise", hp: 4000, amp: 1.2, d: 0.002, rnd: r })
  b.set(shot)
  // eco dalle montagne: Glemina, il Cuarnan, il Chiampon
  echo(b, [[0.42, 0.32], [0.81, 0.2], [1.35, 0.13], [1.9, 0.07]], 900)
  reverb(b, 0.22, 1.2, 0.5)
  return done(b)
}

const shotMulin: Recipe = r => {
  // corto e secco: a 20 colpi al secondo diventa il ronzio del mulino
  const b = gunshot(r, { crack: 2000, body: 140, bodyD: 0.022, tail: 0.03, tailLp: 1300, drv: 3, len: 0.18 })
  voice(b, { dur: 0.03, wave: "sqr", f: exp(420, 160, 0.01), amp: 0.2, d: 0.01, lp: 1600 })
  return done(b, 0.8)
}

const spinMulin: Recipe = r => {
  // le canne che prendono giri: un fischio meccanico che sale, col cric degli ingranaggi
  const b = buffer(0.85)
  voice(b, { dur: 0.8, wave: "saw", f: t => 90 + 520 * (t / 0.8) ** 1.4, amp: t => 0.35 * Math.min(1, t / 0.15), lp: 2400 })
  for (let i = 0; i < 14; i++) click(b, (i / 14) ** 0.7 * 0.75, 0.25, 2600, r)
  return done(b, 0.6)
}

const beamMiedi: Recipe = r => {
  // lo sbrufadôr: uno spruzzo soffice con un filo di bolle
  const b = buffer(0.22)
  voice(b, { dur: 0.2, wave: "noise", bp: exp(2600, 1800, 0.08), q: 1.2, amp: 0.7, a: 0.01, d: 0.06, rnd: r })
  voice(b, { at: 0.02, dur: 0.06, wave: "sin", f: t => 700 + t * 4000, amp: 0.15, d: 0.02 })
  return done(b, 0.5)
}

const minePlant: Recipe = r => {
  // la mine che si pianta nel terreno e il bip di quando si arma
  const b = buffer(1.2)
  voice(b, { dur: 0.15, wave: "sin", f: exp(140, 60, 0.03), amp: 1, d: 0.04 })
  voice(b, { dur: 0.1, wave: "noise", lp: 900, amp: 0.6, d: 0.03, rnd: r })
  click(b, 0.05, 0.5, 1800, r)
  for (const at of [0.9, 1.05]) voice(b, { at, dur: 0.07, wave: "sqr", f: 1760, amp: 0.25, a: 0.002, d: 0.03, lp: 3000 })
  return done(b, 0.7)
}

const heal: Recipe = r => {
  const b = buffer(0.5)
  for (const [n, at] of [[880, 0], [1320, 0.07]] as const) mode(b, at, n, 0.35, 0.15)
  voice(b, { dur: 0.3, wave: "noise", hp: 5000, amp: 0.08, d: 0.08, rnd: r })
  return done(b, 0.45)
}

const launchFrico: Recipe = r => {
  const b = buffer(1)
  // "thoonk": tubo che risuona e colpo sordo
  voice(b, { dur: 0.3, wave: "sin", f: exp(160, 55, 0.05), amp: 1, a: 0.002, d: 0.07 })
  voice(b, { dur: 0.2, wave: "noise", bp: 320, q: 3, amp: 1.6, a: 0.002, d: 0.04, rnd: r })
  mode(b, 0, 240, 0.4, 0.05)
  click(b, 0, 0.6, 1200, r)
  // sfrigolio del formaggio
  const crackle = () => (r() < 0.06 ? 1 : 0.25)
  voice(b, { at: 0.08, dur: 0.85, wave: "noise", hp: 4500, amp: crackle, env: t => Math.min(1, t / 0.05) * Math.exp(-t / 0.3), rnd: r })
  drive(b, 1.8)
  return done(b)
}

/** Fruscio d'aria che sale e scende. */
function whoosh(b: Float32Array, at: number, dur: number, f0: number, f1: number, amp: number, r: Rnd) {
  const bell = (t: number) => Math.sin(Math.PI * Math.min(1, t / dur)) ** 2
  voice(b, { at, dur, wave: "noise", bp: t => f0 + (f1 - f0) * Math.sin((Math.PI * t) / dur), q: 1.6, amp, env: bell, rnd: r })
}

const throwSnd: Recipe = r => {
  const b = buffer(0.45)
  whoosh(b, 0, 0.35, 350, 1600, 1, r)
  click(b, 0, 0.15, 2500, r)
  return done(b, 0.7)
}

const meleeSwing: Recipe = r => {
  const b = buffer(0.3)
  whoosh(b, 0, 0.22, 500, 2200, 1, r)
  voice(b, { dur: 0.2, wave: "sin", f: exp(300, 180, 0.08), amp: 0.15, env: t => Math.sin(Math.PI * Math.min(1, t / 0.2)) })
  return done(b, 0.75)
}

const meleeHit: Recipe = r => {
  const b = buffer(0.5)
  // bastone di legno su zucca: modi del legno + "bonk" che scende
  for (const [f, a, d] of [[520, 0.6, 0.06], [1370, 0.35, 0.03], [2210, 0.2, 0.02], [180, 0.7, 0.05]] as const) mode(b, 0, f * (0.95 + r() * 0.1), a, d)
  voice(b, { dur: 0.25, wave: "sin", f: exp(720, 330, 0.05), amp: 0.7, d: 0.06 })
  click(b, 0, 0.8, 1500, r)
  drive(b, 1.5)
  reverb(b, 0.1, 0.5)
  return done(b)
}

const bounce: Recipe = r => {
  const b = buffer(0.35)
  voice(b, { dur: 0.25, wave: "sin", f: exp(170, 105, 0.04), amp: 0.9, d: 0.05 })
  mode(b, 0, 430 + r() * 40, 0.4, 0.04)
  mode(b, 0, 990 + r() * 80, 0.2, 0.025)
  click(b, 0, 0.5, 800, r)
  return done(b, 0.8)
}

const boom: Recipe = r => {
  const b = buffer(2.8)
  voice(b, { dur: 2.2, wave: "noise", lp: exp(7000, 180, 0.35), amp: 1.2, a: 0.002, d: 0.45, rnd: r })
  voice(b, { dur: 1.6, wave: "sin", f: exp(70, 24, 0.3), amp: 1.3, a: 0.004, d: 0.35 })
  voice(b, { dur: 0.05, wave: "noise", amp: 1, d: 0.01, rnd: r })
  // scoppiettio di detriti
  const crackle = () => (r() < 0.015 ? 2 : 0.1)
  voice(b, { at: 0.1, dur: 1.4, wave: "noise", hp: 2500, amp: crackle, env: t => Math.exp(-t / 0.4), rnd: r })
  drive(b, 3)
  reverb(b, 0.35, 1.3, 0.4)
  return done(b, 0.97)
}

const reload: Recipe = r => {
  const b = buffer(1.05)
  const clack = (at: number, f: number, a: number) => {
    click(b, at, a, 2000, r)
    mode(b, at, f, a * 0.4, 0.015)
    mode(b, at, f * 2.3, a * 0.2, 0.01)
  }
  clack(0, 1800, 0.6) // caricatore fuori
  voice(b, { at: 0.12, dur: 0.18, wave: "noise", bp: exp(1200, 3000, 0.1), q: 2, amp: 0.25, env: t => Math.sin((Math.PI * t) / 0.18), rnd: r })
  clack(0.42, 1500, 0.9) // dentro
  voice(b, { at: 0.42, dur: 0.1, wave: "sin", f: 160, amp: 0.4, d: 0.025 })
  clack(0.7, 2400, 0.7) // carrello indietro
  voice(b, { at: 0.7, dur: 0.1, wave: "noise", bp: 2500, q: 2, amp: 0.3, d: 0.03, rnd: r })
  clack(0.83, 2000, 1) // e avanti
  return done(b, 0.75)
}

const switchSnd: Recipe = r => {
  const b = buffer(0.4)
  voice(b, { dur: 0.18, wave: "noise", bp: 1800, q: 0.8, amp: 0.35, env: t => Math.sin((Math.PI * t) / 0.18), rnd: r })
  click(b, 0.16, 0.6, 2500, r)
  mode(b, 0.16, 2100, 0.25, 0.012)
  click(b, 0.24, 0.8, 1800, r)
  mode(b, 0.24, 1500, 0.3, 0.015)
  return done(b, 0.65)
}

const dry: Recipe = r => {
  const b = buffer(0.12)
  click(b, 0, 0.8, 3000, r)
  mode(b, 0, 3200, 0.3, 0.008)
  mode(b, 0, 1700, 0.2, 0.01)
  return done(b, 0.6)
}

// --- feedback di combattimento ----------------------------------------------------------

const hitmarker: Recipe = r => {
  const b = buffer(0.08)
  voice(b, { dur: 0.05, wave: "tri", f: 2400, amp: 0.6, d: 0.012 })
  click(b, 0, 0.5, 5000, r)
  return done(b, 0.6)
}

const headshot: Recipe = r => {
  const b = buffer(1)
  // un "ding" di campanello: parziali leggermente inarmoniche
  for (const [m, a, d] of [[1, 1, 0.35], [2.01, 0.4, 0.2], [3.03, 0.25, 0.12], [4.2, 0.12, 0.06]] as const) mode(b, 0, 1568 * m, a, d)
  click(b, 0, 0.5, 5000, r)
  voice(b, { dur: 0.04, wave: "tri", f: 2400, amp: 0.4, d: 0.01 })
  reverb(b, 0.12, 0.5)
  return done(b, 0.7)
}

const kill: Recipe = r => {
  const b = buffer(0.5)
  voice(b, { dur: 0.09, wave: "tri", f: 880, amp: 0.6, d: 0.05 })
  voice(b, { at: 0.08, dur: 0.3, wave: "tri", f: 1319, amp: 0.6, d: 0.1 })
  voice(b, { at: 0.08, dur: 0.3, wave: "sin", f: 2638, amp: 0.15, d: 0.06 })
  click(b, 0, 0.3, 4000, r)
  return done(b, 0.65)
}

/** Vocale "ooh/aah" da cartone: dente di sega attraverso due formanti. */
function vowel(b: Float32Array, at: number, dur: number, f: (t: number) => number, formants: readonly [number, number], amp: number, r: Rnd) {
  const env = (t: number) => Math.min(1, t / 0.04) * Math.max(0, 1 - t / dur) ** 0.7
  voice(b, { at, dur, wave: "saw", f, amp, env, bp: formants[0], q: 4, rnd: r })
  voice(b, { at, dur, wave: "saw", f, amp: amp * 0.6, env, bp: formants[1], q: 5, rnd: r })
  voice(b, { at, dur, wave: "noise", amp: amp * 0.03, env, bp: formants[1], q: 2, rnd: r })
}

const death: Recipe = r => {
  const b = buffer(1.1)
  const p = 0.9 + r() * 0.25
  vowel(b, 0, 0.95, t => p * (230 - 120 * Math.min(1, t / 0.8)) * (1 + 0.04 * Math.sin(2 * Math.PI * 7 * t)), [650, 1050], 1, r)
  reverb(b, 0.12, 0.6)
  return done(b, 0.8)
}

// --- movimento --------------------------------------------------------------------------

const step: Recipe = r => {
  const b = buffer(0.16)
  // tacco sul porfido: colpo sordo, sasso che risuona un attimo, granelli
  voice(b, { dur: 0.06, wave: "noise", lp: 900 + r() * 700, amp: 0.8, a: 0.001, d: 0.012, rnd: r })
  mode(b, 0.002, 280 + r() * 260, 0.35, 0.012)
  mode(b, 0.004, 1300 + r() * 1200, 0.12, 0.006)
  const grit = () => (r() < 0.08 ? 1 : 0.15)
  voice(b, { at: 0.01, dur: 0.07, wave: "noise", hp: 3500, amp: grit, d: 0.02, rnd: r })
  return done(b, 0.5 + r() * 0.15)
}

const jump: Recipe = r => {
  const b = buffer(0.3)
  whoosh(b, 0, 0.22, 400, 1300, 0.5, r)
  voice(b, { dur: 0.08, wave: "sin", f: exp(140, 80, 0.03), amp: 0.6, d: 0.025 })
  voice(b, { dur: 0.05, wave: "noise", lp: 1200, amp: 0.5, d: 0.012, rnd: r })
  return done(b, 0.55)
}

const land: Recipe = r => {
  const b = buffer(0.35)
  voice(b, { dur: 0.25, wave: "sin", f: exp(100, 48, 0.05), amp: 1, a: 0.001, d: 0.06 })
  voice(b, { dur: 0.15, wave: "noise", lp: 700, amp: 0.7, d: 0.03, rnd: r })
  const grit = () => (r() < 0.12 ? 1 : 0.15)
  voice(b, { at: 0.01, dur: 0.2, wave: "noise", hp: 3000, amp: grit, d: 0.05, rnd: r })
  return done(b, 0.7)
}

const pad: Recipe = r => {
  const b = buffer(1)
  // molla del carro di fieno: "boiiing" che oscilla
  const f = (t: number) => 170 + 330 * (1 - Math.exp(-t * 9)) + 60 * Math.sin(2 * Math.PI * 13 * t) * Math.exp(-t * 3)
  voice(b, { dur: 0.85, wave: "tri", f, amp: 0.7, a: 0.003, d: 0.3 })
  voice(b, { dur: 0.85, wave: "sin", f: t => f(t) * 2, amp: 0.25, d: 0.2 })
  // fieno che fruscia
  const straw = () => (r() < 0.1 ? 1 : 0.2)
  voice(b, { dur: 0.45, wave: "noise", bp: 3200, q: 0.8, amp: straw, env: t => Math.min(1, t / 0.01) * Math.exp(-t / 0.12), rnd: r })
  voice(b, { dur: 0.1, wave: "sin", f: exp(120, 60, 0.03), amp: 0.7, d: 0.03 })
  return done(b, 0.8)
}

// --- raccolte ---------------------------------------------------------------------------

const pickupFrico: Recipe = r => {
  const b = buffer(0.75)
  // crosta che scrocchia: tanti granelli, poi sfrigolio
  for (let i = 0; i < 26; i++) {
    const at = (i / 26) * 0.3 + r() * 0.02
    voice(b, { at, dur: 0.02, wave: "noise", bp: 1500 + r() * 3000, q: 1.5, amp: 0.4 + r() * 0.6, d: 0.004, rnd: r })
  }
  const crackle = () => (r() < 0.05 ? 1 : 0.2)
  voice(b, { at: 0.1, dur: 0.6, wave: "noise", hp: 5000, amp: crackle, env: t => Math.min(1, t / 0.1) * Math.exp(-t / 0.2), rnd: r })
  voice(b, { dur: 0.25, wave: "tri", f: exp(523, 784, 0.05), amp: 0.2, d: 0.1 })
  return done(b, 0.75)
}

const pickupGubane: Recipe = r => {
  const b = buffer(0.8)
  // tre morsi morbidi alla gubana
  for (let i = 0; i < 3; i++) {
    const at = i * 0.16
    voice(b, { at, dur: 0.12, wave: "noise", bp: 600 + r() * 300, q: 1.2, amp: 0.9, env: t => Math.sin((Math.PI * t) / 0.12) ** 2, rnd: r })
    voice(b, { at, dur: 0.1, wave: "sin", f: 120 + r() * 30, amp: 0.3, d: 0.03 })
  }
  // e una piccola nota "corazza"
  voice(b, { at: 0.45, dur: 0.3, wave: "tri", f: 659, amp: 0.25, d: 0.1 })
  voice(b, { at: 0.52, dur: 0.3, wave: "tri", f: 988, amp: 0.25, d: 0.12 })
  return done(b, 0.75)
}

const pickupSgnape: Recipe = r => {
  const b = buffer(1.1)
  // glu-glu dalla bottiglia
  for (let i = 0; i < 4; i++) {
    const at = i * 0.13 + r() * 0.02
    const f0 = 180 + r() * 60
    voice(b, { at, dur: 0.1, wave: "sin", f: t => f0 * (1 + t * 12), amp: 0.8, a: 0.004, d: 0.03 })
    voice(b, { at, dur: 0.06, wave: "noise", lp: 600, amp: 0.3, d: 0.015, rnd: r })
  }
  // ...e il singhiozzo
  voice(b, { at: 0.78, dur: 0.06, wave: "noise", bp: 1600, q: 2, amp: 0.6, d: 0.02, rnd: r })
  vowel(b, 0.78, 0.09, t => 380 + t * 6000, [500, 1700], 0.8, r)
  return done(b, 0.8)
}

const pickupMunizions: Recipe = r => {
  const b = buffer(0.6)
  voice(b, { dur: 0.12, wave: "sin", f: exp(150, 90, 0.03), amp: 0.6, d: 0.03 })
  voice(b, { dur: 0.06, wave: "noise", lp: 1500, amp: 0.4, d: 0.015, rnd: r })
  // cartucce che sbatacchiano
  for (let i = 0; i < 14; i++) {
    const at = 0.02 + r() * 0.38
    click(b, at, 0.2 + r() * 0.4, 3000, r)
    mode(b, at, 2500 + r() * 2500, 0.08 + r() * 0.1, 0.01)
  }
  return done(b, 0.75)
}

const pickupLanciafrico: Recipe = r => {
  const b = buffer(0.7)
  // "cha"
  voice(b, { dur: 0.1, wave: "noise", bp: exp(1500, 3500, 0.05), q: 1.5, amp: 0.6, d: 0.03, rnd: r })
  click(b, 0, 0.8, 2000, r)
  mode(b, 0, 1900, 0.3, 0.02)
  // "chunk"
  const at = 0.2
  voice(b, { at, dur: 0.2, wave: "sin", f: exp(130, 60, 0.04), amp: 1, d: 0.05 })
  click(b, at, 1, 1200, r)
  for (const [f, a] of [[780, 0.4], [1650, 0.25], [2900, 0.12]] as const) mode(b, at, f, a, 0.03)
  drive(b, 2)
  return done(b, 0.85)
}

// --- obiettivi e jingle -----------------------------------------------------------------

function stinger(notes: readonly Note[], beat: number, extra: number, inst: "acc" | "brass") {
  return (_r: Rnd) => {
    const total = notes.reduce((s, n) => s + n[1], 0) * beat + extra
    const b = buffer(total + 0.8)
    melody(notes, 0, beat, (at, n, dur) =>
      inst === "acc" ? accordion(b, at, n, dur, 0.18, 3200) : brass(b, at, n, dur, 0.18)
    )
    reverb(b, 0.2, 0.9)
    return done(b, 0.8)
  }
}

const flagTaken = stinger([[62, 0.5], [66, 0.5], [69, 0.5], [74, 1.5]], 0.14, 0, "brass")
const flagReturned = stinger([[79, 0.5], [74, 0.5], [71, 1.5]], 0.17, 0, "acc")

const flagCaptured: Recipe = r => {
  const b = buffer(2.4)
  const beat = 0.18
  melody([[67, 1], [71, 1], [74, 1], [79, 3]], 0, beat, (at, n, dur) => brass(b, at, n, dur, 0.18))
  melody([[null, 3], [74, 3]], 0, beat, (at, n, dur) => brass(b, at, n, dur, 0.12))
  oomPahPah(b, 3 * beat, beat, "G", false, 0.8)
  void r
  reverb(b, 0.22, 1)
  return done(b, 0.85)
}

const streak: Recipe = r => {
  const b = buffer(1.8)
  const t = 0.09
  melody([[60, 1], [64, 1], [67, 1], [72, 2], [67, 1], [72, 6]], 0, t, (at, n, dur) => brass(b, at, n, dur, 0.2))
  // trillo finale
  for (let i = 0; i < 6; i++) brass(b, 0.54 + i * 0.07, i % 2 ? 76 : 79, 0.06, 0.08)
  void r
  reverb(b, 0.2, 0.9)
  return done(b, 0.85)
}

/** Le campane del Duomo di Glemone: tre campane e il campanon, parziali inarmoniche. */
const bells: Recipe = r => {
  const b = buffer(7.5)
  // parziali di campana: hum, prime, terza minore, quinta, nominale, ...
  const partials = [
    [0.5, 0.5, 3.2],
    [1, 0.6, 2.2],
    [1.183, 0.45, 1.6],
    [1.506, 0.3, 1.2],
    [2, 0.55, 1.0],
    [2.514, 0.18, 0.6],
    [2.662, 0.15, 0.5],
    [3.011, 0.12, 0.4],
    [4.166, 0.08, 0.25]
  ] as const
  const strike = (at: number, f: number, amp: number) => {
    for (const [m, a, d] of partials) {
      mode(b, at, f * m, a * amp, d * (330 / f) ** 0.4)
      // seconda "metà" della campana un filo stonata: battimenti
      mode(b, at, f * m * 1.0021, a * amp * 0.4, d * (330 / f) ** 0.4)
    }
    voice(b, { at, dur: 0.03, wave: "noise", bp: f * 4, q: 1, amp: amp * 0.3, d: 0.006, rnd: r })
  }
  const BELLS = [392, 330, 294, 196] // sol, mi, re, e il campanon in sol basso
  const seq = [0, 1, 2, 3, 0, 1, 2, 3, 1, 0, 3]
  seq.forEach((k, i) => strike(i * 0.42 + (k === 3 ? 0.05 : 0), BELLS[k], k === 3 ? 1.2 : 0.8))
  reverb(b, 0.3, 1.4, 0.35, 0.82)
  return done(b, 0.9)
}

/** Jingle di fine partita: melodia + valzer, nello stile della musica del menu. */
function jingle(notes: readonly Note[], chords: readonly Chord[], beat: number, lead: "acc" | "cla", tail: Chord) {
  return (_r: Rnd) => {
    const bars = chords.length
    const b = buffer(bars * 3 * beat + 3)
    melody(notes, 0, beat, (at, n, dur) => (lead === "acc" ? accordion(b, at, n, dur, 0.13, 3000) : clarinet(b, at, n, dur, 0.22)))
    chords.forEach((c, i) => oomPahPah(b, i * 3 * beat, beat, c, i % 2 === 1, 0.9))
    // accordo finale tenuto, col mantice che respira
    const end = bars * 3 * beat
    for (const n of [...CHORD_NOTES[tail]]) accordion(b, end, n, 1.4, 0.07, 2600)
    reverb(b, 0.2, 1)
    return done(b, 0.85)
  }
}
const CHORD_NOTES: Record<Chord, readonly number[]> = {
  G: [55, 59, 62, 67],
  C: [55, 60, 64, 67],
  D7: [54, 57, 60, 62],
  Am: [57, 60, 64, 69],
  Gm: [55, 58, 62, 67],
  Cm: [55, 60, 63, 67],
  Eb: [55, 58, 63, 67]
}

const victory = jingle(
  [[74, 1], [79, 1], [83, 1], [86, 1.5], [83, 0.5], [79, 1], [81, 1], [78, 1], [74, 1], [79, 3]],
  ["G", "G", "D7", "G"],
  0.3,
  "acc",
  "G"
)

const defeat = jingle(
  [[74, 1], [72, 1], [70, 1], [69, 1.5], [67, 0.5], [66, 1], [67, 3]],
  ["Gm", "D7", "Gm"],
  0.42,
  "cla",
  "Gm"
)

// --- interfaccia ------------------------------------------------------------------------

const uiClick: Recipe = r => {
  const b = buffer(0.06)
  voice(b, { dur: 0.04, wave: "sin", f: exp(1500, 1000, 0.01), amp: 0.6, d: 0.01 })
  click(b, 0, 0.3, 4000, r)
  return done(b, 0.5)
}

const uiHover: Recipe = () => {
  const b = buffer(0.04)
  voice(b, { dur: 0.03, wave: "sin", f: 2200, amp: 0.4, a: 0.002, d: 0.006 })
  return done(b, 0.25)
}

const chat: Recipe = () => {
  const b = buffer(0.15)
  voice(b, { dur: 0.08, wave: "sin", f: exp(500, 1300, 0.025), amp: 0.7, a: 0.003, d: 0.03 })
  return done(b, 0.5)
}

const respawn: Recipe = r => {
  const b = buffer(1.2)
  voice(b, { dur: 0.8, wave: "noise", bp: t => 300 * 10 ** (t / 0.8), q: 2, amp: 1, env: t => (t / 0.8) ** 2, rnd: r })
  for (const [n, at] of [[784, 0.45], [988, 0.55], [1175, 0.65], [1568, 0.75]] as const) {
    for (const [m, a] of [[1, 0.25], [2.76, 0.06]] as const) mode(b, at, n * m, a, 0.18)
  }
  reverb(b, 0.25, 1)
  return done(b, 0.7)
}

// --- galline, mitraie, porte ------------------------------------------------------------

/** Un "co" di gallina: dente di sega nasale che scende, filtrato come una gola. */
function cluck(b: Float32Array, at: number, f0: number, dur: number, amp: number, r: Rnd) {
  voice(b, { at, dur, wave: "saw", f: t => f0 * (1 + 0.25 * Math.exp(-t / 0.02)) * (1 + 0.03 * Math.sin(t * 190)), bp: f0 * 2.6, q: 2.5, amp, a: 0.004, env: t => Math.min(1, t / 0.006) * Math.exp(-t / (dur * 0.55)) })
  voice(b, { at, dur: dur * 0.6, wave: "noise", bp: 3200, q: 1.5, amp: amp * 0.15, d: dur * 0.2, rnd: r })
}

const launchGjaline: Recipe = r => {
  // il "puff" del cjanon d'ottone, poi la gallina indignata: co-co-co-dèèè
  const b = buffer(1.1)
  voice(b, { dur: 0.25, wave: "sin", f: exp(140, 60, 0.04), amp: 0.9, a: 0.002, d: 0.06 })
  voice(b, { dur: 0.15, wave: "noise", bp: 600, q: 1.5, amp: 1, d: 0.03, rnd: r })
  mode(b, 0, 410, 0.35, 0.08)
  const f = 470 + r() * 60
  cluck(b, 0.12, f, 0.07, 0.7, r)
  cluck(b, 0.22, f * 1.04, 0.07, 0.7, r)
  cluck(b, 0.32, f * 0.98, 0.07, 0.7, r)
  voice(b, { at: 0.43, dur: 0.38, wave: "saw", f: t => f * 1.9 - t * 500, bp: f * 4, q: 2, amp: 0.8, a: 0.01, env: t => Math.min(1, t / 0.02) * Math.exp(-t / 0.2) })
  reverb(b, 0.12, 0.6)
  return done(b, 0.85)
}

const boomGjaline: Recipe = r => {
  // un "pof" soffice, l'ultimo strillo e lo sfarfallio delle piume
  const b = buffer(1.3)
  voice(b, { dur: 0.6, wave: "noise", lp: exp(4500, 300, 0.12), amp: 1, a: 0.002, d: 0.14, rnd: r })
  voice(b, { dur: 0.4, wave: "sin", f: exp(110, 45, 0.08), amp: 0.9, d: 0.1 })
  voice(b, { at: 0.02, dur: 0.3, wave: "saw", f: t => 1200 - t * 1800, bp: 2600, q: 3, amp: 0.5, env: t => Math.min(1, t / 0.01) * Math.exp(-t / 0.1) })
  const flutter = () => (r() < 0.05 ? 0.9 : 0.05)
  voice(b, { at: 0.08, dur: 1.1, wave: "noise", bp: 2200, q: 0.8, amp: flutter, env: t => Math.exp(-t / 0.35), rnd: r })
  reverb(b, 0.2, 0.8)
  return done(b, 0.9)
}

const shotMitraie: Recipe = r => {
  // pesante e asciutta: un'arma vera, montata su tre gambe
  const b = gunshot(r, { crack: 1200, body: 90, bodyD: 0.045, tail: 0.08, tailLp: 900, drv: 4, len: 0.4 })
  voice(b, { dur: 0.05, wave: "sqr", f: exp(220, 70, 0.015), amp: 0.3, d: 0.02, lp: 900 })
  mode(b, 0.005, 2900, 0.08, 0.02)
  reverb(b, 0.1, 0.6)
  return done(b, 0.85)
}

const turretOn: Recipe = r => {
  // la manopola che si prende e il carrello armato
  const b = buffer(0.5)
  click(b, 0, 0.7, 1800, r)
  mode(b, 0, 1300, 0.3, 0.03)
  click(b, 0.18, 1, 2200, r)
  mode(b, 0.18, 2100, 0.35, 0.02)
  mode(b, 0.18, 640, 0.25, 0.05)
  return done(b, 0.7)
}

const turretHot: Recipe = r => {
  // la canna che sfrigola e fuma: vapore e un "ting" di metallo che si dilata
  const b = buffer(2)
  voice(b, { dur: 1.9, wave: "noise", bp: exp(5200, 2400, 0.8), q: 0.7, amp: 0.8, a: 0.03, d: 0.7, rnd: r })
  for (const [at, f] of [[0.05, 3100], [0.55, 2600], [1.1, 3500]] as const) mode(b, at, f, 0.25, 0.12)
  return done(b, 0.7)
}

const doorHit: Recipe = r => {
  // una pedata alle assi
  const b = buffer(0.5)
  for (const [f, a, d] of [[140, 0.9, 0.08], [310, 0.5, 0.05], [760, 0.25, 0.03]] as const) mode(b, 0, f * (0.95 + r() * 0.1), a, d)
  voice(b, { dur: 0.12, wave: "noise", lp: 1800, amp: 0.7, d: 0.03, rnd: r })
  drive(b, 1.6)
  reverb(b, 0.15, 0.6)
  return done(b, 0.85)
}

const doorBreak: Recipe = r => {
  // le assi che saltano e le schegge per terra
  const b = buffer(1.6)
  voice(b, { dur: 0.6, wave: "noise", lp: exp(5000, 600, 0.15), amp: 1, a: 0.002, d: 0.16, rnd: r })
  for (const [f, a, d] of [[110, 1, 0.12], [240, 0.7, 0.08], [520, 0.4, 0.05]] as const) mode(b, 0, f, a, d)
  for (let i = 0; i < 9; i++) {
    const at = 0.15 + r() * 0.9
    mode(b, at, 600 + r() * 1400, 0.15 + r() * 0.15, 0.02)
    click(b, at, 0.3, 1500, r)
  }
  drive(b, 2)
  reverb(b, 0.2, 0.9)
  return done(b, 0.95)
}

/** Ricette e numero di varianti per suono. */
export const SFX: Record<SoundName, readonly [Recipe, number]> = {
  shot_mandi: [shotMandi, 3],
  shot_cramar: [shotCramar, 4],
  shot_doplete: [shotDoplete, 2],
  shot_cjampanili: [shotCjampanili, 1],
  shot_mulin: [shotMulin, 3],
  spin_mulin: [spinMulin, 1],
  beam_miedi: [beamMiedi, 2],
  launch_gjaline: [launchGjaline, 2],
  boom_gjaline: [boomGjaline, 2],
  shot_mitraie: [shotMitraie, 3],
  turret_on: [turretOn, 1],
  turret_hot: [turretHot, 1],
  door_hit: [doorHit, 2],
  door_break: [doorBreak, 1],
  mine_plant: [minePlant, 1],
  heal: [heal, 1],
  launch_frico: [launchFrico, 1],
  throw: [throwSnd, 1],
  boom: [boom, 2],
  bounce: [bounce, 2],
  reload: [reload, 1],
  switch: [switchSnd, 1],
  dry: [dry, 1],
  melee_swing: [meleeSwing, 2],
  melee_hit: [meleeHit, 2],
  hitmarker: [hitmarker, 1],
  headshot: [headshot, 1],
  kill: [kill, 1],
  death: [death, 3],
  step: [step, 6],
  jump: [jump, 1],
  land: [land, 2],
  pad: [pad, 1],
  pickup_frico: [pickupFrico, 1],
  pickup_gubane: [pickupGubane, 1],
  pickup_sgnape: [pickupSgnape, 1],
  pickup_munizions: [pickupMunizions, 1],
  pickup_lanciafrico: [pickupLanciafrico, 1],
  flag_taken: [flagTaken, 1],
  flag_captured: [flagCaptured, 1],
  flag_returned: [flagReturned, 1],
  bells: [bells, 1],
  streak: [streak, 1],
  ui_click: [uiClick, 1],
  ui_hover: [uiHover, 1],
  chat: [chat, 1],
  respawn: [respawn, 1],
  victory: [victory, 1],
  defeat: [defeat, 1]
}

/** Sintetizza tutte le varianti di un suono (seme fisso: stessi suoni a ogni avvio). */
export function renderSound(name: SoundName): Float32Array[] {
  const [recipe, n] = SFX[name]
  let seed = 7
  for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) | 0
  return Array.from({ length: n }, (_, i) => recipe(rng(seed + i * 977)))
}
