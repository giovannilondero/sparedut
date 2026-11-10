/**
 * Rebuilds the weapons modelled in Blender: every `assets/blender/<id>.py` (but the shared
 * `kit.py`) becomes `client/public/models/<id>.glb`. `bun scripts/models.ts cramar mandi`
 * rebuilds only those. `BLENDER` overrides the binary.
 */
import { readdirSync } from "node:fs"

const blender = process.env.BLENDER ?? "/Applications/Blender.app/Contents/MacOS/Blender"
const all = readdirSync("assets/blender").filter((f) => f.endsWith(".py") && f !== "kit.py").map((f) => f.slice(0, -3))
const ids = process.argv.length > 2 ? process.argv.slice(2) : all
for (const id of ids) {
  const run = Bun.spawnSync([blender, "-b", "--python", `assets/blender/${id}.py`, "--", `client/public/models/${id}.glb`], { stdout: "pipe", stderr: "pipe" })
  const out = run.stdout.toString()
  const line = out.split("\n").find((l) => l.startsWith("exported"))
  if (!line) {
    console.error(out.split("\n").slice(-15).join("\n"), run.stderr.toString())
    throw new Error(`${id}: Blender did not export it`)
  }
  console.log(line)
}
