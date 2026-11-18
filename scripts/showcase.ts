/**
 * The pictures that show the game off, taken from the running game with headless rendering
 * (`scripts/render-shot.ts`) and written into `client/public/showcase/`: the link preview of
 * the page's Open Graph metadata, and the screenshots of the install prompt. They are
 * committed, not made in CI (which has no browser), and never cached at install.
 *
 *   pnpm dev                                  # or `pnpm exec vite`: the Vite server
 *   bun scripts/showcase.ts [http://localhost:5173] [picture …]
 *
 * With names after the address, only those pictures are taken (`link-preview`). When to take
 * them again: see AGENTS.md.
 *
 * A picture is a page of the game shot at a viewport (a phone is `size` under 1000 px wide,
 * with `touch` for its controls), optionally prepared by a script run in the page, and
 * optionally composed: the shot becomes the background of an HTML page, shot in turn.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { shoot } from "./render-shot.ts"

const ROOT = join(import.meta.dir, "..")
const OUT = join(ROOT, "client/public/showcase")

interface Picture {
  /** The file under `client/public/showcase/`. */
  readonly file: string
  /** The size of the picture written, in pixels. */
  readonly size: readonly [number, number]
  /** The page shot, under the server's address; Vêr is `?look=ver`. */
  readonly page: string
  /** The viewport the page is shot at, `size` when not given, and its device pixel ratio. */
  readonly viewport?: readonly [number, number]
  readonly scale?: number
  /** A phone's touch screen. */
  readonly touch?: boolean
  /** Seconds the page runs before the shot. */
  readonly wait?: number
  /** Run in the page before the shot: hides what should not show, starts a match… */
  readonly prepare?: string
  /** An HTML page over the shot (given as `scene.png`, next to the page), shot at `size`. */
  readonly compose?: () => string
}

/** The loading screen's title (`client/index.html`): its typeface and its gold, read from the page so the two never part. */
function loaderTitleStyle(): string {
  const html = readFileSync(join(ROOT, "client/index.html"), "utf8")
  const font = html.match(/#loader \{[^}]*?(font-family:[^;]+;)/)?.[1]
  const title = html.match(/#loader \.l-title \{([^}]+)\}/)?.[1]
  if (!font || !title) throw new Error("the loading screen's title style was not found in client/index.html")
  return `${font} ${title}`
}

/** The link preview: the Duomo of Glemone in Vêr, with the title as the loading screen draws it. */
const linkPreview = (): string => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; inline-size: 1200px; block-size: 630px; overflow: hidden; background: #14110f; }
  .scene { position: absolute; inset: 0; background: url(scene.png) center / cover; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,17,15,0) 45%, rgba(20,17,15,0.82) 88%, #14110f 100%); }
  .title { position: absolute; inset-inline: 0; inset-block-end: 46px; text-align: center; ${loaderTitleStyle()}
    font-size: 150px; animation: none; filter: drop-shadow(0 4px 14px rgba(0,0,0,0.75)); }
</style></head><body><div class="scene"></div><div class="shade"></div><div class="title">Sparedût</div></body></html>`

const PICTURES: Record<string, Picture> = {
  "link-preview": {
    file: "link-preview.png",
    size: [1200, 630],
    page: "/preview/world.html?map=glemone&look=ver&q=alta&cam=-2,13.6,-20,6,13.2,-60",
    scale: 2,
    wait: 10,
    prepare: "document.getElementById('info').style.display = 'none'",
    compose: linkPreview
  }
}

/** The width and height in a PNG's header. */
const pngSize = (file: string) => {
  const bytes = readFileSync(file)
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

async function take(base: string, picture: Picture, work: string): Promise<string> {
  const out = join(OUT, picture.file)
  const viewport = picture.viewport ?? picture.size
  const scene = picture.compose ? join(work, "scene.png") : out
  await shoot({ url: new URL(picture.page, base).href, out: scene, wait: picture.wait, script: picture.prepare, size: viewport, scale: picture.scale, touch: picture.touch })
  if (picture.compose) {
    const page = join(work, "compose.html")
    writeFileSync(page, picture.compose())
    await shoot({ url: pathToFileURL(page).href, out, wait: 1, size: picture.size, scale: 1 })
  }
  const [w, h] = pngSize(out)
  const [width, height] = picture.compose ? picture.size : [viewport[0] * (picture.scale ?? 1), viewport[1] * (picture.scale ?? 1)]
  if (w !== width || h !== height) throw new Error(`${picture.file} is ${w}×${h}, not ${width}×${height}`)
  return out
}

if (import.meta.main) {
  const [base = "http://localhost:5173", ...names] = process.argv.slice(2)
  const unknown = names.filter((name) => !(name in PICTURES))
  if (unknown.length) throw new Error(`no picture named ${unknown.join(", ")}: ${Object.keys(PICTURES).join(", ")}`)
  if (!(await fetch(base).then((r) => r.ok, () => false))) throw new Error(`the game does not answer at ${base}: start \`pnpm dev\` first`)
  mkdirSync(OUT, { recursive: true })
  const work = mkdtempSync(join(tmpdir(), "showcase-"))
  try {
    for (const name of names.length ? names : Object.keys(PICTURES)) console.log(await take(base, PICTURES[name]!, work))
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
