/**
 * Draws the installed game's icons from `client/public/favicon.svg` into `client/public/icons/`,
 * with a headless Chromium (Brave by default, `BROWSER` overrides it). Run it after a change to
 * the favicon: `pnpm icons`.
 *
 * - `any-*`: the favicon as it is, rounded corners and all.
 * - `maskable-512` and `apple-touch-180`: square and opaque, the favicon's colour to the edges
 *   and the mark inside the safe circle, since Android masks the first and iOS rounds the
 *   second itself (and would fill transparent corners with black).
 */
import { mkdirSync, readFileSync, rmSync } from "node:fs"

const browser = process.env.BROWSER ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
const svg = readFileSync("client/public/favicon.svg", "utf8")
const background = svg.match(/<rect [^>]*fill="(#[0-9a-f]+)"/)?.[1]
if (!background) throw new Error("favicon.svg: no background rect")
const OUT = "client/public/icons"

/** `scale`: the favicon's share of the side; `null` draws it edge to edge on a transparent ground. */
const ICONS: readonly { name: string; size: number; scale: number | null }[] = [
  { name: "any-192", size: 192, scale: null },
  { name: "any-512", size: 512, scale: null },
  { name: "maskable-512", size: 512, scale: 0.8 },
  { name: "apple-touch-180", size: 180, scale: 0.9 }
]

mkdirSync(OUT, { recursive: true })
const port = 9300 + Math.floor(Math.random() * 500)
const profile = `/tmp/sparedut-icons-${port}`
const child = Bun.spawn([browser, "--headless=new", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], {
  stdout: "ignore",
  stderr: "ignore"
})
try {
  let socket: WebSocket | null = null
  for (let i = 0; i < 50 && !socket; i++) {
    await Bun.sleep(200)
    const tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json() as Promise<{ type: string; webSocketDebuggerUrl: string }[]>, () => [])
    const tab = tabs.find((t) => t.type === "page")
    if (tab) socket = new WebSocket(tab.webSocketDebuggerUrl)
  }
  if (!socket) throw new Error("the browser did not start")
  const ws = socket
  await new Promise((resolve) => (ws.onopen = resolve))
  let next = 1
  const call = (method: string, params: object = {}) =>
    new Promise<Record<string, any>>((resolve) => {
      const id = next++
      const on = (e: MessageEvent) => {
        const m = JSON.parse(String(e.data))
        if (m.id !== id) return
        ws.removeEventListener("message", on)
        resolve(m.result ?? {})
      }
      ws.addEventListener("message", on)
      ws.send(JSON.stringify({ id, method, params }))
    })
  await call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } })
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  for (const { name, size, scale } of ICONS) {
    const side = Math.round(size * (scale ?? 1))
    const ground = scale === null ? "transparent" : background
    const html = `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${ground}"><img src="${src}" width="${side}" height="${side}"></body></html>`
    await call("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false })
    await call("Page.navigate", { url: `data:text/html;base64,${Buffer.from(html).toString("base64")}` })
    await Bun.sleep(500)
    const shot = await call("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 } })
    await Bun.write(`${OUT}/${name}.png`, Buffer.from(shot.data, "base64"))
    console.log(`${OUT}/${name}.png ${size}x${size}`)
  }
} finally {
  child.kill()
  await child.exited
  rmSync(profile, { recursive: true, force: true })
}
