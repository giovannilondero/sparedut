// Preview: one button per sound, a toggle for the music, a 3D test.
import { createAudio } from "../audio.ts"
import { SFX } from "../audio/sfx.ts"
import type { MotoseeEngine, P3, SoundName } from "../contracts.ts"

const log = document.getElementById("log")!
const t0 = performance.now()
const audio = createAudio()
log.textContent = `createAudio(): ${(performance.now() - t0).toFixed(0)} ms\n`

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const spatial = $<HTMLInputElement>("spatial")
let angle = 0
audio.setListener([0, 1.7, 0], 0)

addEventListener("pointerdown", () => audio.unlock(), { once: true })

for (const name of Object.keys(SFX) as SoundName[]) {
  const b = document.createElement("button")
  b.textContent = name
  b.onclick = () => {
    audio.unlock()
    if (spatial.checked) {
      // each click moves the source 45° around the listener
      angle += Math.PI / 4
      const at: P3 = [Math.sin(angle) * 15, 1.7, -Math.cos(angle) * 15]
      audio.play(name, { at })
      log.textContent = `${name} at (${at.map(v => v.toFixed(1)).join(", ")})\n`
    } else audio.play(name)
  }
  b.onmouseenter = () => audio.play("ui_hover")
  $("grid").append(b)
}

let on = false
$("music").onclick = e => {
  audio.unlock()
  on = !on
  audio.menuMusic(on)
  const b = e.currentTarget as HTMLButtonElement
  b.textContent = `Villotta: ${on ? "on" : "off"}`
  b.classList.toggle("on", on)
}
const vols = () => audio.setVolumes(+$<HTMLInputElement>("master").value, +$<HTMLInputElement>("musicVol").value)
$("master").oninput = vols
$("musicVol").oninput = vols

// The Motosee: engines are fed every frame, as the game does.
let sawOwn = false
let sawAround = false
const toggle = (id: string, label: string, set: (on: boolean) => void) => {
  let on = false
  $(id).onclick = (e) => {
    audio.unlock()
    on = !on
    set(on)
    const b = e.currentTarget as HTMLButtonElement
    b.textContent = `${label}: ${on ? "on" : "off"}`
    b.classList.toggle("on", on)
  }
}
toggle("saw-own", "Motosee in hand", (on) => (sawOwn = on))
toggle("saw-around", "Motosees around", (on) => (sawAround = on))
const sawStart = performance.now()
const sawFrame = () => {
  const t = (performance.now() - sawStart) / 1000
  const engines: MotoseeEngine[] = []
  if (sawOwn) {
    // 3 s idle, then the trigger held for 3 s: 20 ticks of rev, then cutting
    const held = t % 6 >= 3 ? Math.min(1, ((t % 6) - 3) * 3) : 0
    engines.push({ id: "you", at: null, rev: held, cutting: held >= 1 })
  }
  if (sawAround)
    for (let i = 0; i < 5; i++) {
      const r = [8, 15, 25, 40, 60][i]
      const a = t * 0.2 + (i * Math.PI * 2) / 5
      const cutting = i % 2 === 0 && Math.sin(t * 0.7 + i) > 0
      engines.push({ id: `p${i}`, at: [Math.sin(a) * r, 1.7, -Math.cos(a) * r], rev: cutting ? 1 : 0, cutting })
    }
  audio.motosees(engines)
  requestAnimationFrame(sawFrame)
}
requestAnimationFrame(sawFrame)
