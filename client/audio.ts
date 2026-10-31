/**
 * Game audio: every sound is synthesized here (no files), encoded as WAV
 * and played with Howler. Positional in 3D when they have a point in the world.
 */
import { Howl, Howler } from "howler"
import type { GameAudio, P3, SoundName } from "./contracts.ts"
import { wav } from "./audio/dsp.ts"
import { renderDisco } from "./audio/disco.ts"
import { renderVillotta } from "./audio/music.ts"
import { SFX, renderSound } from "./audio/sfx.ts"

type Range = "far" | "mid" | "near"

/** Attenuation for a ~150 m map: shots are heard everywhere, footsteps up close. */
const RANGES: Record<Range, { distanceModel: "inverse" | "linear"; refDistance: number; rolloffFactor: number; maxDistance: number }> = {
  far: { distanceModel: "inverse", refDistance: 10, rolloffFactor: 0.55, maxDistance: 10000 },
  mid: { distanceModel: "inverse", refDistance: 4, rolloffFactor: 1.1, maxDistance: 10000 },
  near: { distanceModel: "linear", refDistance: 2, rolloffFactor: 1, maxDistance: 26 }
}

interface Spec {
  readonly range: Range
  /** Maximum simultaneous voices. */
  readonly voices: number
  readonly gain: number
  /** Random pitch variation (±). */
  readonly jitter: number
}

const spec = (range: Range, voices: number, gain = 1, jitter = 0): Spec => ({ range, voices, gain, jitter })

const SPECS: Record<SoundName, Spec> = {
  shot_mandi: spec("far", 6, 0.9, 0.04),
  shot_cramar: spec("far", 8, 0.75, 0.04),
  shot_doplete: spec("far", 4, 1, 0.03),
  shot_cjampanili: spec("far", 3, 1, 0.02),
  shot_mulin: spec("far", 10, 0.55, 0.05),
  spin_mulin: spec("mid", 2, 0.6, 0.02),
  beam_miedi: spec("mid", 4, 0.45, 0.06),
  launch_gjaline: spec("far", 3, 0.85, 0.06),
  boom_gjaline: spec("far", 4, 0.9, 0.08),
  shot_mitraie: spec("far", 10, 0.7, 0.04),
  turret_on: spec("mid", 2, 0.7),
  turret_hot: spec("mid", 2, 0.75),
  door_hit: spec("mid", 3, 0.9, 0.06),
  door_break: spec("far", 2, 1),
  mine_plant: spec("mid", 2, 0.7, 0.03),
  heal: spec("near", 2, 0.45, 0.04),
  launch_frico: spec("far", 3, 0.9, 0.03),
  throw: spec("mid", 3, 0.6, 0.05),
  boom: spec("far", 4, 1, 0.06),
  bounce: spec("mid", 4, 0.6, 0.08),
  reload: spec("near", 3, 0.6),
  switch: spec("near", 2, 0.5),
  dry: spec("near", 2, 0.6),
  melee_swing: spec("mid", 3, 0.6, 0.08),
  melee_hit: spec("mid", 3, 0.9, 0.06),
  hitmarker: spec("near", 3, 0.6),
  headshot: spec("near", 2, 0.7),
  kill: spec("near", 2, 0.7),
  death: spec("mid", 4, 0.75, 0.04),
  step: spec("near", 8, 0.35, 0.08),
  jump: spec("near", 3, 0.4, 0.05),
  land: spec("near", 3, 0.5, 0.05),
  pad: spec("mid", 3, 0.8, 0.03),
  pickup_frico: spec("mid", 2, 0.7),
  pickup_gubane: spec("mid", 2, 0.7),
  pickup_sgnape: spec("mid", 2, 0.7),
  pickup_munizions: spec("mid", 2, 0.7),
  pickup_lanciafrico: spec("mid", 2, 0.8),
  flag_taken: spec("far", 2, 0.8),
  flag_captured: spec("far", 2, 0.8),
  flag_returned: spec("far", 2, 0.8),
  bells: spec("far", 1, 0.9),
  streak: spec("near", 1, 0.7),
  ui_click: spec("near", 3, 0.5),
  ui_hover: spec("near", 2, 0.35),
  chat: spec("near", 2, 0.5),
  respawn: spec("near", 1, 0.6),
  victory: spec("near", 1, 0.8),
  defeat: spec("near", 1, 0.8)
}

const NAMES = Object.keys(SFX) as SoundName[]
/** Long and not urgent: synthesized in the background after startup. */
const LATE: readonly SoundName[] = ["death", "respawn", "flag_taken", "flag_returned", "flag_captured", "streak", "bells", "victory", "defeat"]
const MUSIC_FADE = 1200

const toUrl = (pcm: Float32Array) => URL.createObjectURL(new Blob([wav(pcm)], { type: "audio/wav" }))
const tick = () => new Promise(r => setTimeout(r, 0))

export function createAudio(): GameAudio {
  const urls = new Map<SoundName, string[]>()
  const t0 = performance.now()
  for (const name of NAMES) if (!LATE.includes(name)) urls.set(name, renderSound(name).map(toUrl))
  console.info(`[audio] effects synthesized in ${(performance.now() - t0).toFixed(0)} ms`)

  // Howls are created on first use, so the AudioContext is born after a gesture
  let howls: Map<SoundName, Howl[]> | null = null
  let listener: [P3, number] = [[0, 0, 0], 0]
  const applyListener = () => {
    const [pos, yaw] = listener
    Howler.pos(pos[0], pos[1], pos[2])
    Howler.orientation(-Math.sin(yaw), 0, -Math.cos(yaw), 0, 1, 0)
  }
  const active = new Map<SoundName, [Howl, number][]>()
  const makeHowls = (name: SoundName) => {
    const s = SPECS[name]
    const attrs = { ...RANGES[s.range], panningModel: "HRTF" as const }
    howls!.set(name, urls.get(name)!.map(src => new Howl({ src: [src], format: ["wav"], volume: s.gain, ...attrs })))
  }
  const ensure = () => {
    if (howls) return howls
    howls = new Map()
    for (const name of urls.keys()) makeHowls(name)
    Howler.volume(master)
    applyListener()
    return howls
  }
  /** Synthesizes a late sound if it isn't ready yet (immediately too, if needed now). */
  const renderLate = (name: SoundName) => {
    if (urls.has(name)) return
    urls.set(name, renderSound(name).map(toUrl))
    if (howls) makeHowls(name)
  }
  const howlsOf = (name: SoundName) => {
    const h = ensure()
    renderLate(name)
    return h.get(name)
  }

  let master = 1
  let musicVol = 0.6
  let music: Howl | null = null
  let musicOn = false
  let musicLoading = false
  // in the background, in small chunks: first the long sounds, then the villotta
  const musicUrl = (async () => {
    const t1 = performance.now()
    for (const name of LATE) {
      await tick()
      renderLate(name)
    }
    const t2 = performance.now()
    const src = toUrl(await renderVillotta())
    console.info(
      `[audio] long sounds in ${(t2 - t1).toFixed(0)} ms, villotta in ${(performance.now() - t2).toFixed(0)} ms (in background)`
    )
    return src
  })()

  const startMusic = () => {
    if (!musicOn) return
    if (music) {
      if (!music.playing()) music.play()
      music.fade(music.volume(), musicVol, MUSIC_FADE)
      return
    }
    if (musicLoading) return
    musicLoading = true
    void musicUrl.then(src => {
      ensure()
      music = new Howl({ src: [src], format: ["wav"], loop: true, volume: 0 })
      musicLoading = false
      startMusic()
    })
  }

  // The casot's disco: two loops (open and muffled) at the same point, one heard at a time.
  let disco: { open: Howl; muffled: Howl } | null = null
  let discoLoading = false
  let discoWant: { at: P3; open: boolean } | null = null
  const discoGain = () => musicVol * 1.4
  const applyDisco = () => {
    if (!disco) return
    for (const [h, on] of [[disco.open, discoWant?.open ?? false], [disco.muffled, !(discoWant?.open ?? true)]] as const) {
      if (!discoWant) {
        if (h.playing()) h.pause()
        continue
      }
      h.pos(discoWant.at[0], discoWant.at[1], discoWant.at[2])
      if (!h.playing()) h.play()
      const target = on ? discoGain() : 0
      if (Math.abs(h.volume() - target) > 0.01) h.fade(h.volume(), target, 400)
    }
  }
  const loadDisco = () => {
    if (disco || discoLoading) return
    discoLoading = true
    void renderDisco().then(({ open, muffled }) => {
      ensure()
      const attrs = { distanceModel: "inverse" as const, refDistance: 5, rolloffFactor: 1.3, maxDistance: 10000, panningModel: "HRTF" as const }
      const a = new Howl({ src: [toUrl(open)], format: ["wav"], loop: true, volume: 0, ...attrs })
      const m = new Howl({ src: [toUrl(muffled)], format: ["wav"], loop: true, volume: 0, ...attrs })
      // same instant in both loops: the door opening doesn't skip the beat
      a.once("play", () => m.seek(a.seek()))
      disco = { open: a, muffled: m }
      discoLoading = false
      applyDisco()
    })
  }

  return {
    unlock() {
      ensure()
      if (Howler.ctx && Howler.ctx.state !== "running") void Howler.ctx.resume()
      startMusic()
    },

    play(name, opts) {
      const variants = howlsOf(name)
      if (!variants) return
      const s = SPECS[name]
      // voice limit: the oldest one is silenced
      const list = (active.get(name) ?? []).filter(([h, id]) => h.playing(id))
      while (list.length >= s.voices) {
        const [h, id] = list.shift()!
        h.stop(id)
      }
      const howl = variants[Math.floor(Math.random() * variants.length)]
      const id = howl.play()
      howl.volume(s.gain * (opts?.volume ?? 1), id)
      const rate = (opts?.rate ?? 1) * (1 + (Math.random() * 2 - 1) * s.jitter)
      if (rate !== 1) howl.rate(rate, id)
      if (opts?.at) howl.pos(opts.at[0], opts.at[1], opts.at[2], id)
      list.push([howl, id])
      active.set(name, list)
    },

    setListener(pos, yaw) {
      listener = [pos, yaw]
      if (howls) applyListener()
    },

    menuMusic(on) {
      musicOn = on
      if (on) startMusic()
      else if (music) {
        const m = music
        m.fade(m.volume(), 0, MUSIC_FADE)
        m.once("fade", () => {
          if (!musicOn) m.pause()
        })
      }
    },

    setVolumes(m, mu) {
      master = Math.max(0, Math.min(1, m))
      musicVol = Math.max(0, Math.min(1, mu))
      Howler.volume(master)
      if (music && musicOn) music.volume(musicVol)
      applyDisco()
    },

    disco(at, open) {
      const same = discoWant && at && discoWant.open === open && discoWant.at === at
      if (same || (!discoWant && !at)) return
      discoWant = at ? { at, open } : null
      if (at) loadDisco()
      applyDisco()
    }
  }
}
