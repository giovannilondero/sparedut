/**
 * The first import of `main.ts`, before anyone builds a schema: the CSP (`public/_headers`)
 * doesn't allow eval, and zod would otherwise try it to compile its checks.
 */
import { config } from "zod"

config({ jitless: true })
