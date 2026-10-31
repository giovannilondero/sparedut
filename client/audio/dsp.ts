/**
 * Synthesis building blocks: oscillators, noise, filters, envelopes, modal resonators,
 * reverb and echo. All on mono Float32Array at `SR`, then 16-bit WAV.
 */

export const SR = 32000

export type Rnd = () => number
/** Constant parameter or function of time (seconds since the voice started). */
export type Param = number | ((t: number) => number)
export type Wave = "sin" | "tri" | "saw" | "sqr" | "noise"

/** Deterministic pseudo-random generator (mulberry32). */
export function rng(seed: number): Rnd {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const len = (sec: number) => Math.ceil(sec * SR)
export const buffer = (sec: number) => new Float32Array(len(sec))
export const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)
const pv = (p: Param, t: number) => (typeof p === "number" ? p : p(t))
const TAU = Math.PI * 2

/** State-variable filter (TPT): low-pass, band-pass, high-pass at once. */
export class Svf {
  private ic1 = 0
  private ic2 = 0
  private k = 1
  private a1 = 0
  private a2 = 0
  private a3 = 0
  low = 0
  band = 0
  high = 0
  constructor(fc = 1000, q = 0.707) {
    this.set(fc, q)
  }
  set(fc: number, q = 0.707) {
    const g = Math.tan((Math.PI * Math.min(Math.max(fc, 10), SR * 0.45)) / SR)
    this.k = 1 / q
    this.a1 = 1 / (1 + g * (g + this.k))
    this.a2 = g * this.a1
    this.a3 = g * this.a2
  }
  run(v0: number) {
    const v3 = v0 - this.ic2
    const v1 = this.a1 * this.ic1 + this.a2 * v3
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3
    this.ic1 = 2 * v1 - this.ic1
    this.ic2 = 2 * v2 - this.ic2
    this.low = v2
    this.band = v1
    this.high = v0 - this.k * v1 - v2
  }
}

// polyBLEP: removes aliasing at the saw and square discontinuities
function blep(t: number, dt: number) {
  if (t < dt) {
    t /= dt
    return t + t - t * t - 1
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt
    return t * t + t + t + 1
  }
  return 0
}

export interface Voice {
  /** Start, seconds. */
  at?: number
  dur: number
  f?: Param
  wave?: Wave
  amp?: Param
  /** Linear attack (s). */
  a?: number
  /** Time constant of the exponential decay (s). */
  d?: number
  /** Custom envelope instead of a/d. */
  env?: (t: number) => number
  lp?: Param
  hp?: Param
  bp?: Param
  q?: number
  /** Pulse width for "sqr". */
  pw?: number
  /** Summed detuned oscillators (cents), through a single filter. */
  detune?: readonly number[]
  rnd?: Rnd
}

/** One voice: oscillator → filters → envelope, summed into `out`. */
export function voice(out: Float32Array, v: Voice) {
  const start = Math.floor((v.at ?? 0) * SR)
  const n = Math.min(len(v.dur), out.length - start)
  if (n <= 0) return
  const wave = v.wave ?? "sin"
  const amp = v.amp ?? 1
  const a = v.a ?? 0.002
  const d = v.d ?? Infinity
  const f = v.f ?? 440
  const q = v.q ?? 0.707
  const pw = v.pw ?? 0.5
  const rnd = v.rnd ?? Math.random
  const lp = v.lp != null ? new Svf(pv(v.lp, 0), q) : null
  const hp = v.hp != null ? new Svf(pv(v.hp, 0), q) : null
  const bp = v.bp != null ? new Svf(pv(v.bp, 0), q) : null
  const dynamic = typeof v.lp === "function" || typeof v.hp === "function" || typeof v.bp === "function"
  const fFn = typeof f === "function" ? f : null
  const ampFn = typeof amp === "function" ? amp : null
  const rel = Math.min(len(0.004), n)
  const ratios = (v.detune ?? [0]).map(c => 2 ** (c / 1200))
  const nOsc = ratios.length
  const phs = ratios.map((_, i) => (i * 0.37) % 1)
  const oscGain = 1 / Math.sqrt(nOsc)
  // default envelope: linear ramp then recursive exponential decay
  const na = Math.max(1, Math.floor(a * SR))
  const k = Number.isFinite(d) ? Math.exp(-1 / (d * SR)) : 1
  let e = 1
  let fr = typeof f === "number" ? f : f(0)
  let am = typeof amp === "number" ? amp : amp(0)
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t = i / SR
      if (fFn) fr = fFn(t)
      if (ampFn) am = ampFn(t)
      if (dynamic) {
        if (lp && typeof v.lp === "function") lp.set(v.lp(t), q)
        if (hp && typeof v.hp === "function") hp.set(v.hp(t), q)
        if (bp && typeof v.bp === "function") bp.set(v.bp(t), q)
      }
    }
    let s = 0
    if (wave === "noise") s = rnd() * 2 - 1
    else {
      for (let o = 0; o < nOsc; o++) {
        const dt = (fr * ratios[o]) / SR
        let ph = phs[o]
        if (wave === "sin") s += Math.sin(TAU * ph)
        else if (wave === "saw") s += 2 * ph - 1 - blep(ph, dt)
        else if (wave === "sqr") s += (ph < pw ? 1 : -1) + blep(ph, dt) - blep((ph + 1 - pw) % 1, dt)
        else s += 4 * Math.abs(ph - 0.5) - 1
        ph += dt
        phs[o] = ph - Math.floor(ph)
      }
      if (nOsc > 1) s *= oscGain
    }
    if (lp) {
      lp.run(s)
      s = lp.low
    }
    if (hp) {
      hp.run(s)
      s = hp.high
    }
    if (bp) {
      bp.run(s)
      s = bp.band
    }
    let g: number
    if (v.env) g = v.env(i / SR)
    else if (i < na) g = i / na
    else g = e *= k
    if (i > n - rel) g *= (n - i) / rel
    out[start + i] += s * g * am
  }
}

/** Damped resonator: one vibration mode (bells, wood, metal). `d` is the time constant. */
export function mode(out: Float32Array, at: number, freq: number, amp: number, d: number) {
  const start = Math.floor(at * SR)
  if (freq >= SR / 2) return
  const w = (TAU * freq) / SR
  const r = Math.exp(-1 / (d * SR))
  const c = 2 * r * Math.cos(w)
  const r2 = r * r
  const n = Math.min(Math.ceil(d * SR * 7), out.length - start)
  let y1 = amp * r * Math.sin(w)
  let y2 = 0
  for (let i = 1; i < n; i++) {
    out[start + i] += y1
    const y = c * y1 - r2 * y2
    y2 = y1
    y1 = y
  }
}

/** Short noise burst: the "snap" of a mechanism. */
export function click(out: Float32Array, at: number, amp: number, bright = 3000, rnd: Rnd = Math.random) {
  voice(out, { at, dur: 0.012, wave: "noise", hp: bright, amp, a: 0.0003, d: 0.0025, rnd })
}

/** Soft saturation. */
export function drive(b: Float32Array, k: number) {
  const norm = 1 / Math.tanh(k)
  for (let i = 0; i < b.length; i++) b[i] = Math.tanh(k * b[i]) * norm
}

/** Multiple echoes, each return darker (low-pass at `lpHz`). */
export function echo(b: Float32Array, taps: readonly (readonly [number, number])[], lpHz: number) {
  const dry = b.slice()
  const f = new Svf(lpHz)
  const dark = new Float32Array(dry.length)
  for (let i = 0; i < dry.length; i++) {
    f.run(dry[i])
    dark[i] = f.low
  }
  for (const [delay, gain] of taps) {
    const o = len(delay)
    for (let i = 0; i + o < b.length; i++) b[i + o] += dark[i] * gain
  }
}

/** Reduced Schroeder/Freeverb reverb: 4 damped combs + 2 allpasses. */
export function reverb(b: Float32Array, mix: number, size = 1, damp = 0.3, fb = 0.8) {
  const s = (SR / 44100) * size
  const combs = [1116, 1188, 1277, 1356].map(c => Math.floor(c * s))
  const aps = [556, 441].map(c => Math.floor(c * (SR / 44100)))
  const wet = new Float32Array(b.length)
  for (const dl of combs) {
    const line = new Float32Array(dl)
    let p = 0
    let store = 0
    for (let i = 0; i < b.length; i++) {
      const y = line[p]
      store = y * (1 - damp) + store * damp
      line[p] = b[i] * 0.25 + store * fb
      wet[i] += y
      if (++p >= dl) p = 0
    }
  }
  for (const dl of aps) {
    const line = new Float32Array(dl)
    let p = 0
    for (let i = 0; i < b.length; i++) {
      const bufout = line[p]
      const x = wet[i]
      line[p] = x + bufout * 0.5
      wet[i] = bufout - x
      if (++p >= dl) p = 0
    }
  }
  for (let i = 0; i < b.length; i++) b[i] += wet[i] * mix
}

export function normalize(b: Float32Array, peak = 0.9) {
  let m = 0
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]))
  if (m > 0) {
    const g = peak / m
    for (let i = 0; i < b.length; i++) b[i] *= g
  }
  return b
}

/** Trims trailing silence and fades out the last milliseconds. */
export function trim(b: Float32Array, threshold = 0.0005) {
  let end = b.length
  while (end > 1 && Math.abs(b[end - 1]) < threshold) end--
  const out = b.subarray(0, Math.min(b.length, end + len(0.01)))
  const f = Math.min(len(0.01), out.length)
  for (let i = 0; i < f; i++) out[out.length - 1 - i] *= i / f
  return out
}

/** 16-bit mono PCM WAV. */
export function wav(samples: Float32Array): ArrayBuffer {
  const ab = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(ab)
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  str(0, "RIFF")
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, "WAVE")
  str(12, "fmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, SR, true)
  v.setUint32(28, SR * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, "data")
  v.setUint32(40, samples.length * 2, true)
  const pcm = new Int16Array(ab, 44, samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return ab
}
