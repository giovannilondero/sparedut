/**
 * Performance panel (F3) and dynamic resolution.
 *
 * The panel shows FPS, frame times (average and worst 1%), CPU time,
 * draw calls, triangles, resolution, ping and snapshot rate.
 * Dynamic resolution lowers the pixel ratio when frames don't fit the
 * budget, and slowly raises it again when there's headroom.
 */
import type * as THREE from "three"
import { t } from "./i18n.ts"

export interface NetStats {
  readonly ping: number
  readonly tick: number
  /** Milliseconds between two snapshots: mean and deviation. */
  readonly snapEvery: number
  readonly snapJitter: number
  readonly players: number
  /** Prediction corrections over 1 cm in the last 60 snapshots, and the worst one (m). */
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
  /** Pixel ratio chosen by dynamic resolution, within [min, max]. */
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

  /** Call after drawing: `renderer.info` with autoReset off counts all passes. */
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
   * Dynamic resolution: below ~55 fps it steps down; above a steady ~70 fps
   * for a few seconds it steps back up. Returns true if it changed the scale.
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
    const L = t().perf
    const color = fps >= 58 ? "#9fe08a" : fps >= 40 ? "#f0c45d" : "#ff6b5a"
    this.el.innerHTML = `
      <b style="color:${color}">${fps.toFixed(0)} FPS</b>
      <span>frame ${avg.toFixed(1)} ms · 1% ${low.toFixed(1)} ms</span>
      <span>CPU ${cpu.toFixed(1)} ms</span>
      <span>${this.calls} draw call · ${(this.triangles / 1000).toFixed(0)}k tri</span>
      <span>${canvas.width}×${canvas.height} @ ${this.renderer.getPixelRatio().toFixed(2)}x · ${extra.quality}</span>
      ${n ? `<span>ping ${Math.round(n.ping)} ms · tick ${n.tick}</span><span>${L.snaps} ${n.snapEvery.toFixed(0)}±${n.snapJitter.toFixed(0)} ms · ${n.players} ${L.players}</span><span>${L.corrections} ${n.corrections}/60 · max ${(n.worstCorrection * 100).toFixed(0)} cm</span>` : `<span>${L.menu}</span>`}
      <small>${L.hide}</small>`
  }
}
