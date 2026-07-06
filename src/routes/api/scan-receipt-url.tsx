import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'

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

export const Route = createFileRoute('/api/scan-receipt-url')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { url } = (await request.json()) || {}
        if (!url || typeof url !== 'string') {
          logger.warn('[scan-receipt-url] request rejected: missing url')
          return Response.json({ error: true, message: 'missing url' }, { status: 400 })
        }

        logger.success(`[scan-receipt-url] fetching page: ${url}`)
        try {
          const pageResponse = await fetch(url)
          logger.success(`[scan-receipt-url] page fetched: status=${pageResponse.status}`)
          const pageHtml = await pageResponse.text()

          let combined = pageHtml
          const presignedUrl = findPresignedUrl(pageHtml)
          if (presignedUrl) {
            logger.success(`[scan-receipt-url] found PresignedURL, fetching detail: ${presignedUrl}`)
            try {
              const detailResponse = await fetch(presignedUrl)
              combined += '\n' + (await detailResponse.text())
              logger.success(`[scan-receipt-url] detail fetched: status=${detailResponse.status}`)
            } catch (err) {
              logger.warn(`[scan-receipt-url] presigned detail fetch failed, using page content only: ${err.message}`)
            }
          } else {
            logger.success('[scan-receipt-url] no PresignedURL found, using page content as-is')
          }

          const text = stripHtml(combined).slice(0, 20000)
          logger.success(`[scan-receipt-url] stripped text length: ${text.length}`)

          logger.success('[scan-receipt-url] forwarding to n8n webhook...')
          const upstream = await fetch(RECEIPT_URL_SCAN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
          })
          const data = await upstream.json()
          if (data.error) {
            logger.warn(`[scan-receipt-url] upstream responded with error: status=${upstream.status}`)
          } else {
            logger.success(`[scan-receipt-url] upstream responded: status=${upstream.status}`)
          }
          return Response.json(data, { status: upstream.status })
        } catch (err) {
          logger.error(`[scan-receipt-url] failed: ${err.message}`)
          return Response.json({ error: true, message: 'receipt url scan failed' }, { status: 502 })
        }
      }
    }
  }
})
