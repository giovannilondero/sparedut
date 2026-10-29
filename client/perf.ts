/**
 * Pannello prestazioni (F3) e risoluzione dinamica.
 *
 * Il pannello mostra FPS, tempi di frame (medio e 1% peggiore), tempo CPU,
 * draw call, triangoli, risoluzione, ping e ritmo delle istantanee.
 * La risoluzione dinamica abbassa il pixel ratio quando i frame non stanno nel
 * budget, e lo rialza piano quando c'è margine.
 */
import type * as THREE from "three"

export interface NetStats {
  readonly ping: number
  readonly tick: number
  /** Millisecondi fra due istantanee: media e scarto. */
  readonly snapEvery: number
  readonly snapJitter: number
  readonly players: number
  /** Correzioni della predizione oltre 1 cm nelle ultime 60 istantanee, e la peggiore (m). */
  readonly corrections: number
  readonly worstCorrection: number
}

const WINDOW = 120

export class PerfMonitor {
  private frames: number[] = []
  private cpu: number[] = []
  private lastPanel = 0
  private lastAdjust = 0
  private calls = 0
  private triangles = 0
  private el: HTMLElement
  /** Pixel ratio scelto dalla risoluzione dinamica, entro [min, max]. */
  scale = 1
  visible = false

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.el = document.createElement("div")
    this.el.id = "perf"
    this.el.className = "hidden"
    document.body.append(this.el)
  }

  show(on: boolean) {
    this.visible = on
    this.el.classList.toggle("hidden", !on)
  }

  /** Da chiamare dopo aver disegnato: `renderer.info` con autoReset spento conta tutte le passate. */
  sample(frameMs: number, cpuMs: number) {
    this.frames.push(frameMs)
    this.cpu.push(cpuMs)
    if (this.frames.length > WINDOW) this.frames.shift()
    if (this.cpu.length > WINDOW) this.cpu.shift()
    this.calls = this.renderer.info.render.calls
    this.triangles = this.renderer.info.render.triangles
  }

  private stats() {
    const f = this.frames
    if (!f.length) return { avg: 0, low: 0, cpu: 0 }
    const avg = f.reduce((a, b) => a + b, 0) / f.length
    const sorted = [...f].sort((a, b) => b - a)
    const low = sorted[Math.max(0, Math.floor(f.length * 0.01))]
    const cpu = this.cpu.reduce((a, b) => a + b, 0) / this.cpu.length
    return { avg, low, cpu }
  }

  /**
   * Risoluzione dinamica: sotto ~55 fps scende di un gradino; sopra ~70 fps
   * stabili per qualche secondo risale. Restituisce true se ha cambiato scala.
   */
  adapt(now: number, min: number, max: number): boolean {
    if (now - this.lastAdjust < 1500 || this.frames.length < WINDOW) return false
    const { avg } = this.stats()
    let next = this.scale
    if (avg > 1000 / 55) next = Math.max(min, this.scale - 0.15)
    else if (avg < 1000 / 72 && now - this.lastAdjust > 5000) next = Math.min(max, this.scale + 0.1)
    if (Math.abs(next - this.scale) < 0.01) return false
    this.scale = next
    this.lastAdjust = now
    this.frames = []
    return true
  }

  panel(now: number, extra: { quality: string; net: NetStats | null }) {
    if (!this.visible || now - this.lastPanel < 250) return
    this.lastPanel = now
    const { avg, low, cpu } = this.stats()
    const fps = avg > 0 ? 1000 / avg : 0
    const canvas = this.renderer.domElement
    const n = extra.net
    const color = fps >= 58 ? "#9fe08a" : fps >= 40 ? "#f0c45d" : "#ff6b5a"
    this.el.innerHTML = `
      <b style="color:${color}">${fps.toFixed(0)} FPS</b>
      <span>frame ${avg.toFixed(1)} ms · 1% ${low.toFixed(1)} ms</span>
      <span>CPU ${cpu.toFixed(1)} ms</span>
      <span>${this.calls} draw call · ${(this.triangles / 1000).toFixed(0)}k tri</span>
      <span>${canvas.width}×${canvas.height} @ ${this.renderer.getPixelRatio().toFixed(2)}x · ${extra.quality}</span>
      ${n ? `<span>ping ${Math.round(n.ping)} ms · tick ${n.tick}</span><span>istantanee ${n.snapEvery.toFixed(0)}±${n.snapJitter.toFixed(0)} ms · ${n.players} giocatori</span><span>correzioni ${n.corrections}/60 · max ${(n.worstCorrection * 100).toFixed(0)} cm</span>` : `<span>menu</span>`}
      <small>F3 per nascondere</small>`
  }
}
