/**
 * Audio del gioco: tutti i suoni sono sintetizzati qui (nessun file), codificati in WAV
 * e suonati con Howler. Posizionali in 3D quando hanno un punto nel mondo.
 */
import { Howl, Howler } from "howler"
import type { GameAudio, P3, SoundName } from "./contracts.ts"
import { wav } from "./audio/dsp.ts"
import { renderVillotta } from "./audio/music.ts"
import { SFX, renderSound } from "./audio/sfx.ts"

type Range = "far" | "mid" | "near"

/** Attenuazione per una mappa di ~150 m: gli spari si sentono ovunque, i passi da vicino. */
const RANGES: Record<Range, { distanceModel: "inverse" | "linear"; refDistance: number; rolloffFactor: number; maxDistance: number }> = {
  far: { distanceModel: "inverse", refDistance: 10, rolloffFactor: 0.55, maxDistance: 10000 },
  mid: { distanceModel: "inverse", refDistance: 4, rolloffFactor: 1.1, maxDistance: 10000 },
  near: { distanceModel: "linear", refDistance: 2, rolloffFactor: 1, maxDistance: 26 }
}

interface Spec {
  readonly range: Range
  /** Voci contemporanee al massimo. */
  readonly voices: number
  readonly gain: number
  /** Variazione casuale di intonazione (±). */
  readonly jitter: number
}

const spec = (range: Range, voices: number, gain = 1, jitter = 0): Spec => ({ range, voices, gain, jitter })

const SPECS: Record<SoundName, Spec> = {
  shot_mandi: spec("far", 6, 0.9, 0.04),
  shot_cramar: spec("far", 8, 0.75, 0.04),
  shot_doplete: spec("far", 4, 1, 0.03),
  shot_cjampanili: spec("far", 3, 1, 0.02),
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
/** Lunghi e non urgenti: si sintetizzano in sottofondo dopo l'avvio. */
const LATE: readonly SoundName[] = ["death", "respawn", "flag_taken", "flag_returned", "flag_captured", "streak", "bells", "victory", "defeat"]
const MUSIC_FADE = 1200

const toUrl = (pcm: Float32Array) => URL.createObjectURL(new Blob([wav(pcm)], { type: "audio/wav" }))
const tick = () => new Promise(r => setTimeout(r, 0))

export function createAudio(): GameAudio {
  const urls = new Map<SoundName, string[]>()
  const t0 = performance.now()
  for (const name of NAMES) if (!LATE.includes(name)) urls.set(name, renderSound(name).map(toUrl))
  console.info(`[audio] effetti sintetizzati in ${(performance.now() - t0).toFixed(0)} ms`)

  // gli Howl si creano al primo uso: così l'AudioContext nasce dopo un gesto
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
  /** Sintetizza un suono tardivo se non è ancora pronto (anche subito, se serve adesso). */
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
  // in sottofondo, a pezzetti: prima i suoni lunghi, poi la villotta
  const musicUrl = (async () => {
    const t1 = performance.now()
    for (const name of LATE) {
      await tick()
      renderLate(name)
    }
    const t2 = performance.now()
    const src = toUrl(await renderVillotta())
    console.info(
      `[audio] suoni lunghi in ${(t2 - t1).toFixed(0)} ms, villotta in ${(performance.now() - t2).toFixed(0)} ms (in sottofondo)`
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
      // limite di voci: si zittisce la più vecchia
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
    }
  }
}
