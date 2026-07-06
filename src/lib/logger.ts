import { createConsola } from 'consola'

// consola's own `formatOptions.date` only renders when it detects a wide-enough
// TTY column width, which isn't reliable under every process wrapper (e.g. this
// dev server's stdout capture) — so the timestamp is prefixed onto the message
// itself instead, guaranteeing it always shows up alongside the Success/Warning/
// Error type. Deliberately only these three levels (no "info") — every log line
// in this app's server routes is one of: succeeded, a handled/recoverable
// condition, or a failure.
const consola = createConsola()

const withTimestamp = (msg: string) => `[${new Date().toISOString()}] ${msg}`

export const logger = {
  success: (msg: string) => consola.success(withTimestamp(msg)),
  warn: (msg: string) => consola.warn(withTimestamp(msg)),
  error: (msg: string) => consola.error(withTimestamp(msg))
}
