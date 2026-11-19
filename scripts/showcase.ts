/**
 * The pictures that show the game off, taken from the running game with headless rendering
 * (`scripts/render-shot.ts`) and written into `client/public/showcase/`: the link preview of
 * the page's Open Graph metadata, and the screenshots of the install prompt. They are
 * committed, not made in CI (which has no browser), and never cached at install.
 *
 *   pnpm dev                                  # or `pnpm exec vite`: the Vite server
 *   bun scripts/showcase.ts [http://localhost:5173] [picture …]
 *
 * With names after the address, only those pictures are taken (`link-preview`, `phone-match`,
 * `phone-menu`, `desktop-match`, `desktop-menu`). A match starts at a random spawn: look at the
 * picture, and take it again if the view is dull. When to take them again: see AGENTS.md.
 *
 * A picture is a page of the game shot at a viewport (a phone is one under 1000 px wide, with
 * `touch` for its controls), optionally prepared by a script run in the page, and optionally
 * composed: the shot becomes the background of an HTML page, shot in turn.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { SETTINGS_KEY } from "../client/settings.ts"
import { shoot } from "./render-shot.ts"

const ROOT = join(import.meta.dir, "..")
const OUT = join(ROOT, "client/public/showcase")

type Size = readonly [number, number]

interface Picture {
  /** The file under `client/public/showcase/`. */
  readonly file: string
  /** The page shot, under the server's address; Vêr is `?look=ver`. */
  readonly page: string
  /** The viewport the page is shot at, and its device pixel ratio: the shot is their product. */
  readonly viewport: Size
  readonly scale: number
  /** A phone's touch screen. */
  readonly touch?: boolean
  /** Seconds the page runs before the shot. */
  readonly wait: number
  /** Run in the page before its own scripts: the settings a returning player has… */
  readonly setup?: string
  /** Run in the page before the shot: hides what should not show, starts a match… */
  readonly prepare?: string
  /** An HTML page over the shot (given as `scene.png`, next to the page), shot at its `size` pixel for pixel: the picture written. */
  readonly compose?: { readonly size: Size; readonly page: (size: Size) => string }
}

/** The size of the picture written, in pixels: the composed page's, or the shot's. */
const sizeOf = (picture: Picture): Size => picture.compose?.size ?? [picture.viewport[0] * picture.scale, picture.viewport[1] * picture.scale]

/** The loading screen's title (`client/index.html`): its typeface and its gold, read from the page so the two never part. */
function loaderTitleStyle(): string {
  const html = readFileSync(join(ROOT, "client/index.html"), "utf8")
  const font = html.match(/#loader \{[^}]*?(font-family:[^;]+;)/)?.[1]
  const title = html.match(/#loader \.l-title \{([^}]+)\}/)?.[1]
  if (!font || !title) throw new Error("the loading screen's title style was not found in client/index.html")
  return `${font} ${title}`
}

/** The link preview: the Duomo of Glemone in Vêr, with the title as the loading screen draws it. */
const linkPreview = ([width, height]: Size): string => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; inline-size: ${width}px; block-size: ${height}px; overflow: hidden; background: #14110f; }
  .scene { position: absolute; inset: 0; background: url(scene.png) center / cover; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,17,15,0) 45%, rgba(20,17,15,0.82) 88%, #14110f 100%); }
  .title { position: absolute; inset-inline: 0; inset-block-end: 46px; text-align: center; ${loaderTitleStyle()}
    font-size: 150px; animation: none; filter: drop-shadow(0 4px 14px rgba(0,0,0,0.75)); }
</style></head><body><div class="scene"></div><div class="shade"></div><div class="title">Sparedût</div></body></html>`

/**
 * A returning player: a name typed, the training's invitation dealt with, Glemone chosen last
 * (the one-tap match plays there, the menu shows it behind); the page fills in the rest from its defaults.
 */
const PLAYER = `localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify({ name: 'Toni', lastMap: 'glemone', trainingInvitation: 'dismissed' }))`

/** The game's own page, in Vêr, as the returning player opens it: what the install prompt's screenshots show. */
const IN_GAME = { page: "/?look=ver", wait: 8, setup: PLAYER } as const

/** Waits in a page script: `pause(ms)`. */
const PAUSE = "const pause = (ms) => new Promise((done) => setTimeout(done, ms));"

/**
 * The home screen's one-tap match against the bots, a while into it, as a player sees it once
 * playing: the one-tap stops on the Muster, whose start (alone with the bots, it goes live at once)
 * is pressed as soon as it shows; then no match menu open, no hint to click (the mouse is locked
 * by then). `then` runs last.
 */
const match = (then = "") => `(async () => { ${PAUSE}
  document.querySelector('[data-go="one-tap"]').click();
  for (let i = 0; i < 200 && !document.getElementById('m-start')?.checkVisibility(); i++) await pause(100);
  document.getElementById('m-start').click(); await pause(12000);
  if (document.getElementById('p-resume')?.checkVisibility()) { document.getElementById('p-resume').click(); await pause(500); }
  document.head.insertAdjacentHTML('beforeend', '<style>#clickplay { display: none !important }</style>');
  ${then} })()`

/**
 * A finger dragged across the right of the screen, where it only looks around: touch becomes the
 * device, its controls show, and the view turns by `turn` pixels of drag (rightwards when positive).
 */
const finger = (turn: number) => `const view = document.getElementById('view'), box = view.getBoundingClientRect();
  const at = (dx) => ({ pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true, clientX: box.left + box.width * 0.62 + dx, clientY: box.top + box.height * 0.3 });
  view.dispatchEvent(new PointerEvent('pointerdown', at(0)));
  for (let i = 1; i <= 20; i++) { await pause(16); view.dispatchEvent(new PointerEvent('pointermove', at(${turn} * i / 20))); }
  view.dispatchEvent(new PointerEvent('pointerup', at(${turn}))); await pause(1500);`

/** A phone held sideways (844×390, a 6.1" phone), at twice its pixels: the shape of every `narrow` screenshot. */
const PHONE: Size = [844, 390]
/** A laptop's window (1280×720), at 1.5 times its pixels: 1920×1080, the shape of every `wide` screenshot. */
const DESKTOP: Size = [1280, 720]

/** The phone's menu held upright, in the shape of the `narrow` screenshots (Chrome wants one shape per form factor): framed beside the title. */
const portraitInLandscape = ([width, height]: Size): string => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; inline-size: ${width}px; block-size: ${height}px; overflow: hidden; background: #14110f; }
  body { display: flex; align-items: center; justify-content: center; gap: 120px; }
  img { block-size: 92%; border-radius: 34px; box-shadow: 0 0 0 10px #2a241f, 0 18px 50px rgba(0,0,0,0.7); }
  .title { ${loaderTitleStyle()} font-size: 150px; animation: none; }
</style></head><body><img src="scene.png" alt=""><div class="title">Sparedût</div></body></html>`

const PICTURES: Record<string, Picture> = {
  "phone-match": { file: "phone-match.png", ...IN_GAME, viewport: PHONE, scale: 2, touch: true, prepare: match(finger(-160)) },
  "phone-menu": {
    file: "phone-menu.png",
    ...IN_GAME,
    viewport: [PHONE[1], PHONE[0]],
    scale: 2,
    touch: true,
    compose: { size: [PHONE[0] * 2, PHONE[1] * 2], page: portraitInLandscape }
  },
  "desktop-match": { file: "desktop-match.png", ...IN_GAME, viewport: DESKTOP, scale: 1.5, prepare: match() },
  "desktop-menu": { file: "desktop-menu.png", ...IN_GAME, viewport: DESKTOP, scale: 1.5 },
  "link-preview": {
    file: "link-preview.png",
    page: "/preview/world.html?map=glemone&look=ver&q=alta&cam=-2,13.6,-20,6,13.2,-60",
    viewport: [1200, 630],
    scale: 2,
    wait: 10,
    prepare: "document.getElementById('info').style.display = 'none'",
    compose: { size: [1200, 630], page: linkPreview }
  }
}

/** The width and height in a PNG's header. */
const pngSize = (file: string) => {
  const bytes = readFileSync(file)
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

async function take(base: string, picture: Picture, work: string): Promise<string> {
  const out = join(OUT, picture.file)
  const scene = picture.compose ? join(work, "scene.png") : out
  await shoot({ url: new URL(picture.page, base).href, out: scene, wait: picture.wait, setup: picture.setup, script: picture.prepare, size: picture.viewport, scale: picture.scale, touch: picture.touch })
  if (picture.compose) {
    const page = join(work, "compose.html")
    writeFileSync(page, picture.compose.page(picture.compose.size))
    await shoot({ url: pathToFileURL(page).href, out, wait: 1, size: picture.compose.size, scale: 1 })
  }
  // The browser rounds a fractional pixel ratio its own way: the file is checked, not trusted.
  const [w, h] = pngSize(out)
  const [width, height] = sizeOf(picture)
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
