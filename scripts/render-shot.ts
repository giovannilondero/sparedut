/**
 * A screenshot of a page after it has really run for a while (animations included): the
 * way to look at a graphics change without opening a browser. Needs the Vite server and a
 * Chromium browser (`BROWSER` overrides the binary).
 *
 *   bun scripts/render-shot.ts "http://localhost:5173/preview/models.html?look=ver&w=cramar&still" out.png [seconds] [js to run first]
 */
export {}

const [url, out, wait = "6", script] = process.argv.slice(2)
if (!url || !out) throw new Error("usage: bun scripts/render-shot.ts <url> <out.png> [seconds] [js]")
const browser = process.env.BROWSER ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
const port = 9300 + Math.floor(Math.random() * 500)
const child = Bun.spawn([browser, "--headless=new", "--use-angle=metal", "--enable-gpu", "--hide-scrollbars", "--window-size=1280,720", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/render-shot-${port}`, url], { stdout: "ignore", stderr: "ignore" })
try {
  let socket: WebSocket | null = null
  for (let i = 0; i < 50 && !socket; i++) {
    await Bun.sleep(200)
    const tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json() as Promise<{ type: string; url: string; webSocketDebuggerUrl: string }[]>, () => [])
    const tab = tabs.find((t) => t.type === "page" && t.url.startsWith("http"))
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
  await Bun.sleep(Number(wait) * 1000)
  if (script) {
    await call("Runtime.evaluate", { expression: script })
    await Bun.sleep(1500)
  }
  const shot = await call("Page.captureScreenshot", { format: "png" })
  await Bun.write(out, Buffer.from(shot.data, "base64"))
  console.log(out)
} finally {
  child.kill()
}
