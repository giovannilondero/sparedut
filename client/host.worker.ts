/**
 * The host of an Offline room, off the main thread: the server's `Hub` with one peer, the page.
 * Strings in both directions, exactly what a WebSocket to the server would carry.
 */
import "./zod-config.ts"
import { initPhysics } from "../shared/physics.ts"
import { createBrowserHost } from "./host.ts"

/** Like the Bun server's `setInterval(update, 2)`; a worker's timers don't go below a few ms anyway. */
const LOOP_MS = 4

const hub = createBrowserHost()
const peer = { network: { key: "browser", lan: true }, send: (data: string) => postMessage(data), id: null, name: "", room: null }
// Rapier's WASM loads once; messages wait for it in the order they came.
const ready = initPhysics().then(() => {
  hub.open(peer)
  setInterval(() => hub.update(), LOOP_MS)
})

onmessage = (e: MessageEvent<string>) => {
  void ready.then(() => hub.message(peer, e.data))
}
