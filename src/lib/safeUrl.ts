// Guards against `javascript:`/`data:`/`file:` (and other non-web) schemes ever being
// rendered as a clickable link or persisted as a receipt's `source_url`. A receipt's
// source_url is a user-pasted link (editor-only), and rendering it as
// `<a href={source_url}>` would turn a `javascript:` URL into a script-executing link
// (stored-XSS-style). Only http(s) links are ever legitimate here (the Shufersal
// digital-invoice flow), so everything else is rejected.
export const isSafeHttpUrl = (url?: string | null): url is string => {
  if (!url) return false
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
