const RECEIPT_URL_SCAN_ENDPOINT = 'https://whiny-idealist-unseen.ngrok-free.dev/webhook/receipt-url-scan'

const stripHtml = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/\s+/g, ' ')
    .trim()

// Some digital-invoice viewer pages (e.g. Shufersal) embed a JSON blob with a
// PresignedURL pointing at the actual receipt content, one hop away from the page
// the user actually pasted. Follow it if present; otherwise just use the page itself.
const findPresignedUrl = (html) => {
  const match = html.match(/"PresignedURL"\s*:\s*"([^"]+)"/)
  if (!match) return null
  return match[1].replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: true, message: 'method not allowed' })
    return
  }

  const { url } = req.body || {}
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: true, message: 'missing url' })
    return
  }

  try {
    const pageResponse = await fetch(url)
    const pageHtml = await pageResponse.text()

    let combined = pageHtml
    const presignedUrl = findPresignedUrl(pageHtml)
    if (presignedUrl) {
      try {
        const detailResponse = await fetch(presignedUrl)
        combined += '\n' + (await detailResponse.text())
      } catch {
        // fall back to whatever the outer page already gave us
      }
    }

    const text = stripHtml(combined).slice(0, 20000)

    const upstream = await fetch(RECEIPT_URL_SCAN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    console.error('[scan-receipt-url] failed:', err.message)
    res.status(502).json({ error: true, message: 'receipt url scan failed' })
  }
}
