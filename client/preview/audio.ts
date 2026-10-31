// Preview: one button per sound, a toggle for the music, a 3D test.
import { createAudio } from "../audio.ts"
import { SFX } from "../audio/sfx.ts"
import type { P3, SoundName } from "../contracts.ts"

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
