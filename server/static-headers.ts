/**
 * The headers of a static file, read from `_headers` (`client/public/_headers`) the way
 * Cloudflare reads it: every block whose path matches adds its headers. The Bun server uses
 * this so it serves the same headers as the deploy.
 */

interface Block {
  readonly path: RegExp
  readonly headers: [string, string][]
}

const pattern = (path: string) => new RegExp(`^${path.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`)

export function parseHeaders(file: string): Block[] {
  const blocks: Block[] = []
  for (const line of file.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue
    const header = /^\s+([\w-]+):\s*(.+)$/.exec(line)
    if (header) blocks.at(-1)?.headers.push([header[1], header[2].trim()])
    else blocks.push({ path: pattern(line.trim()), headers: [] })
  }
  return blocks
}

/** The headers for a request to `path`, given the text of a `_headers` file. */
export function headersFor(file: string | Block[], path: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const block of typeof file === "string" ? parseHeaders(file) : file)
    if (block.path.test(path)) for (const [name, value] of block.headers) out[name] = value
  return out
}
