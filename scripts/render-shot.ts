/**
 * A screenshot of a page after it has really run for a while (animations included): the
 * way to look at a graphics change without opening a browser. Needs the Vite server and a
 * Chromium browser (`BROWSER` overrides the binary).
 *
 *   bun scripts/render-shot.ts "http://localhost:5173/preview/models.html?look=ver&w=cramar&still" out.png [seconds] [js to run first]
 *
 * `SIZE=390x844` emulates a viewport of that size (a headless window cannot be narrower than
 * 500 px, so a phone needs it); below 1000 px wide it is a mobile one. `SCALE=2` sets the
 * device pixel ratio.
 *
 * `shoot` is the same from another script (`scripts/showcase.ts`).
 */

export interface Shot {
  /** The page: `http(s)://` or `file://`. */
  readonly url: string
  /** The PNG written. */
  readonly out: string
  /** Seconds the page runs before the shot. */
  readonly wait?: number
  /** Run in the page after the wait; the shot follows 1.5 s later. */
  readonly script?: string
  /** The emulated viewport, `[width, height]`; below 1000 px wide it is a mobile one. */
  readonly size?: readonly [number, number]
  /** The device pixel ratio, with `size`. */
  readonly scale?: number
  /** Emulate a touch screen (a phone's touch controls), with `size`. */
  readonly touch?: boolean
}

export async function shoot({ url, out, wait = 6, script, size, scale = 1, touch = false }: Shot): Promise<string> {
  const browser = process.env.BROWSER ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
  const port = 9300 + Math.floor(Math.random() * 500)
  const child = Bun.spawn([browser, "--headless=new", "--mute-audio", "--use-angle=metal", "--enable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--window-size=1280,720", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/render-shot-${port}`, url], { stdout: "ignore", stderr: "ignore" })
  try {
    let socket: WebSocket | null = null
    for (let i = 0; i < 50 && !socket; i++) {
      await Bun.sleep(200)
      const tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json() as Promise<{ type: string; url: string; webSocketDebuggerUrl: string }[]>, () => [])
      const tab = tabs.find((t) => t.type === "page" && /^(https?|file):/.test(t.url))
      if (tab) socket = new WebSocket(tab.webSocketDebuggerUrl)
    }
    if (!socket) throw new Error(`the browser did not open ${url}`)
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
    if (size) {
      const [width, height] = size
      await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: width < 1000 })
      if (touch) await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
    }
    await Bun.sleep(wait * 1000)
    if (script) {
      await call("Runtime.evaluate", { expression: script, awaitPromise: true })
      await Bun.sleep(1500)
    }
    const shot = await call("Page.captureScreenshot", { format: "png" })
    await Bun.write(out, Buffer.from(shot.data, "base64"))
    return out
  } finally {
    child.kill()
    await child.exited
    // The profile is never reused: left behind, every run keeps about 100 MB of /tmp.
    await Bun.$`rm -rf /tmp/render-shot-${port}`.quiet()
  }
}

if (import.meta.main) {
  const [url, out, wait = "6", script] = process.argv.slice(2)
  if (!url || !out) throw new Error("usage: bun scripts/render-shot.ts <url> <out.png> [seconds] [js]")
  const size = process.env.SIZE?.match(/^(\d+)x(\d+)$/)
  console.log(await shoot({ url, out, wait: Number(wait), script, size: size ? [Number(size[1]), Number(size[2])] : undefined, scale: Number(process.env.SCALE ?? 1) }))
}
