/**
 * Rapier "compat" ships its WASM inlined as base64 (4 MB of text in every bundle that imports
 * it) and compiles it at runtime. This writes a copy of the package where the base64 gives way
 * to an import of the package's own `.wasm` file (the same bytes); `RAPIER.init()` stays as it is.
 *
 * - `"module"`: the bundler loads the file as a precompiled `WebAssembly.Module` (the Cloudflare
 *   Worker, which doesn't allow compiling WASM at runtime).
 * - `"url"`: Vite emits the file as a hashed asset and `init()` streams it from its URL (the
 *   browser: one cached download shared by the page and the offline host worker).
 *
 * A file and an alias to it, not a bundler plugin: Alchemy copies its props as plain data, and
 * a plugin's functions don't survive the copy. Strings do.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export function rapierWithWasmFile(load: "module" | "url"): string {
  const source = fileURLToPath(import.meta.resolve("@dimforge/rapier3d-compat"))
  const code = readFileSync(source, "utf8")
  const inline = /[\w$]+\.toByteArray\("[A-Za-z0-9+/=]+"\)(\.buffer)?/g
  const found = code.match(inline)?.length ?? 0
  if (found !== 1) throw new Error(`Rapier: expected a single inline WASM in ${source}, found ${found}`)
  const wasm = join(dirname(source), "rapier_wasm3d_bg.wasm")
  const specifier = JSON.stringify(load === "url" ? `${wasm}?url` : wasm)
  const out = join(import.meta.dirname, "..", "node_modules", ".cache", "sparedut", `rapier-${load}.mjs`)
  mkdirSync(dirname(out), { recursive: true })
  const patched = code.replace(inline, "rapierWasm").replace(/\n\/\/# sourceMappingURL=.*$/, "")
  writeFileSync(out, `import rapierWasm from ${specifier};\n${patched}`)
  return out
}
