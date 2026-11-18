/**
 * Writes the service worker, `dist/sw.js`, at the end of `vite build`: the precache list made
 * from the files the build has just written (`client/offline-cache/precache.ts`), in front of
 * the worker's bundle (`client/offline-cache/sw.ts`). The deploy runs the same `pnpm build`, so
 * it ships the same list. The dev server has no worker at all.
 *
 * The first line of `sw.js` is `const PRECACHE = {…};`: `readPrecache` reads it back for the
 * test over the build output (`pnpm test:build`).
 */
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { build, type Plugin } from "vite"
import { precacheOf, WORKER_FILE, type BuiltFile, type Precache } from "../client/offline-cache/precache.ts"

const SOURCE = fileURLToPath(new URL("../client/offline-cache/sw.ts", import.meta.url))

/** Every file under `dir`, with its size and the hash of its content. */
export function builtFiles(dir: string): BuiltFile[] {
  const out: BuiltFile[] = []
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) {
        const content = readFileSync(path)
        out.push({ path: relative(dir, path).split(sep).join("/"), bytes: statSync(path).size, hash: createHash("sha256").update(content).digest("hex") })
      }
    }
  }
  walk(dir)
  return out
}

/** The list a built `sw.js` carries. */
export function readPrecache(workerFile: string): Precache {
  const first = readFileSync(workerFile, "utf8").split("\n", 1)[0]
  const json = /^const PRECACHE = (.*);$/.exec(first)?.[1]
  if (!json) throw new Error(`${workerFile} does not start with its precache list`)
  return JSON.parse(json) as Precache
}

async function bundleWorker(): Promise<string> {
  const result = await build({
    configFile: false,
    publicDir: false,
    logLevel: "warn",
    build: { write: false, minify: true, sourcemap: false, rolldownOptions: { input: SOURCE, output: { format: "iife" } } }
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ("output" in r ? r.output : []))
  const chunk = outputs.find((o) => o.type === "chunk")
  if (!chunk || chunk.type !== "chunk" || outputs.length !== 1) throw new Error("the service worker must bundle to a single file")
  return chunk.code
}

export function serviceWorker(): Plugin {
  let outDir = ""
  return {
    name: "sparedut-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const precache = precacheOf(builtFiles(outDir))
      const code = await bundleWorker()
      writeFileSync(join(outDir, WORKER_FILE), `const PRECACHE = ${JSON.stringify(precache)};\n${code}`)
      this.info?.(`service worker ${precache.version}: ${precache.urls.length} files, ${(precache.bytes / 1e6).toFixed(2)} MB precached`)
    }
  }
}
