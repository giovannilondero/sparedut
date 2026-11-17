/**
 * Real frame time of a preview page, uncapped, at retina resolution: the number to watch
 * when a graphics change might cost frames. Needs the Vite server and a Chromium browser.
 *
 *   bun scripts/render-fps.ts "http://localhost:5173/preview/world.html?map=glemone&pr=2&look=ver"
 *
 * `BROWSER` overrides the browser binary. Compare runs taken one after the other: the
 * absolute number moves with whatever else the machine is doing.
 */
export {}

const url = process.argv[2]
if (!url) throw new Error("usage: bun scripts/render-fps.ts <preview url> [seconds]")
const warmup = Number(process.argv[3] ?? 5)
const browser = process.env.BROWSER ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
const port = 9300 + Math.floor(Math.random() * 500)
const child = Bun.spawn(
  [browser, "--headless=new", "--use-angle=metal", "--enable-gpu", "--disable-frame-rate-limit", "--disable-gpu-vsync", "--force-device-scale-factor=2", "--window-size=1512,945", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/render-fps-${port}`, url],
  { stdout: "ignore", stderr: "ignore" }
)
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
  const evaluate = (expression: string) =>
    new Promise<string>((resolve) => {
      const id = next++
      const on = (e: MessageEvent) => {
        const m = JSON.parse(String(e.data))
        if (m.id !== id) return
        ws.removeEventListener("message", on)
        resolve(String(m.result?.result?.value))
      }
      ws.addEventListener("message", on)
      ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }))
    })
  await Bun.sleep(warmup * 1000)
  const fps: number[] = []
  for (let i = 0; i < 6; i++) {
    const m = /fps (\d+)/.exec(await evaluate(`document.getElementById("info").textContent`))
    if (m) fps.push(Number(m[1]))
    await Bun.sleep(600)
  }
  if (!fps.length) throw new Error("the page reports no fps: is it a preview page?")
  const mean = fps.reduce((a, b) => a + b, 0) / fps.length
  console.log(`${await evaluate(`const c = document.querySelector("canvas"); c.width + "x" + c.height`)}  fps ${fps.join(" ")}  =>  ${(1000 / mean).toFixed(1)} ms/frame`)
} finally {
  child.kill()
}
