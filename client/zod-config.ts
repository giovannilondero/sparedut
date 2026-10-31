/**
 * Il primo import di `main.ts`, prima che qualcuno costruisca uno schema: la CSP (`public/_headers`)
 * non ammette eval, e zod altrimenti lo prova per compilare i suoi controlli.
 */
import { config } from "zod"

config({ jitless: true })
