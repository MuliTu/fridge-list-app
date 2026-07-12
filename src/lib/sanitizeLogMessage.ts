// Sanitizes a caller-supplied log message before it reaches the server logger
// (see src/routes/api/client-log.tsx). /api/client-log is unauthenticated and
// fire-and-forget, so its `message` is fully attacker-controllable — without this,
// an injected CR/LF lets a single call forge extra log lines (log injection /
// forging), and an unbounded string lets one call flood the log. This collapses
// every run of CR/LF into a visible ⏎ marker so a message can never span multiple
// log lines, and caps length. Returns null for anything that isn't a usable string,
// so the caller can drop it silently.
export const MAX_LOG_MESSAGE_LENGTH = 2000

export function sanitizeLogMessage(message: unknown): string | null {
  if (typeof message !== 'string') return null
  // \r and \n are what a terminal / log file splits lines on — collapsing them is
  // what actually closes the log-injection hole.
  const singleLine = message.replace(/[\r\n]+/g, ' ⏎ ')
  const capped =
    singleLine.length > MAX_LOG_MESSAGE_LENGTH
      ? singleLine.slice(0, MAX_LOG_MESSAGE_LENGTH) + '…'
      : singleLine
  return capped
}
