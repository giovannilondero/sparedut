/**
 * Indirizzi raggiungibili solo da questo computer o dalla rete di casa:
 * un link d'invito con uno di questi non funziona per chi sta fuori.
 */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1" || h === "0.0.0.0") return true
  if (/^f[cd][0-9a-f]{2}:/.test(h) || h.startsWith("fe80:")) return true
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)
}
