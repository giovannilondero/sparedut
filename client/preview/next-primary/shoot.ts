/**
 * The prototypes' screenshots (issue #93), into `shots/` beside them: every variant's screens on a
 * desktop, a phone on its side and a phone upright, as JPEG. Needs the Vite server.
 *
 *   pnpm exec vite --port 5199
 *   bun client/preview/next-primary/shoot.ts [http://localhost:5199] [filter]
 *
 * `filter` keeps only the shots whose name contains it (`a-`, `pending`, `phone-portrait`…).
 * Throwaway, with the rest of the folder.
 */
import { $ } from "bun"
import { join } from "node:path"
import { shoot } from "../../../scripts/render-shot.ts"

const OUT = join(import.meta.dir, "shots")
const [base = "http://localhost:5199", filter = ""] = process.argv.slice(2)

const DEVICES = {
  desktop: { size: [1280, 720], scale: 1, touch: false },
  "phone-landscape": { size: [844, 390], scale: 2, touch: true },
  "phone-portrait": { size: [390, 844], scale: 2, touch: true }
} as const

/** Each variant's screens: the five states, the single-weapon room where its choice would be, and its own extras. */
const SCREENS: Record<string, readonly (readonly [name: string, hash: string])[]> = {
  a: [["menu", "screen=menu"], ["pending", "screen=pending"], ["hud", "screen=hud"], ["death", "screen=death"], ["single", "screen=menu&single=1"]],
  b: [["menu", "screen=menu"], ["pending", "screen=pending"], ["hud", "screen=hud"], ["death", "screen=death"], ["single", "screen=menu&single=1"], ["single-death", "screen=death&single=1"]],
  c: [["menu", "screen=menu"], ["armoury", "screen=armoury"], ["pending", "screen=pending"], ["hud", "screen=hud"], ["death", "screen=death"], ["single", "screen=menu&single=1"]]
}

const jobs = Object.entries(SCREENS).flatMap(([v, screens]) =>
  screens.flatMap(([name, hash]) =>
    Object.entries(DEVICES).flatMap(([device, d]) => [
      { file: `${v}-${name}-${device}`, url: `${base}/preview/next-primary/${v}.html#${hash}&shot=1`, ...d },
      // Italian too, for the screens that carry the new texts, on the desktop.
      ...(device === "desktop" && (name === "pending" || name === "death") ? [{ file: `${v}-${name}-${device}-it`, url: `${base}/preview/next-primary/${v}.html#${hash}&shot=1&lang=it`, ...d }] : [])
    ])
  )
).filter((j) => j.file.includes(filter))

/** Run after the wait: resolves once the page has drawn its state (`run` in kit.ts), at most 20 s later. */
const DRAWN = `new Promise((done) => { const t0 = Date.now(); const f = () => (document.documentElement.dataset.drawn !== undefined || Date.now() - t0 > 20000 ? done(1) : setTimeout(f, 200)); f() })`

await $`mkdir -p ${OUT}`
// Three browsers at a time: each its own profile, removed when it closes (`shoot`).
for (let i = 0; i < jobs.length; i += 3) {
  await Promise.all(
    jobs.slice(i, i + 3).map(async (j) => {
      const png = join(OUT, `${j.file}.png`)
      await shoot({ url: j.url, out: png, wait: 2, size: j.size, scale: j.scale, touch: j.touch, script: DRAWN })
      await $`sips -s format jpeg -s formatOptions 80 ${png} --out ${join(OUT, `${j.file}.jpg`)}`.quiet()
      await $`rm ${png}`
      console.log(j.file)
    })
  )
}
