import { createFileRoute } from '@tanstack/react-router'
import dns from 'node:dns/promises'
import { logger } from '../../lib/logger'
import { verifyAuthToken } from '../../lib/verifyAuthToken'

const RECEIPT_URL_SCAN_ENDPOINT = 'https://whiny-idealist-unseen.ngrok-free.dev/webhook/receipt-url-scan'

// Cap how much of a fetched page we ever pull into memory. Well above the 20000-char
// slice we actually hand to n8n, so a malicious/huge response can't OOM the server.
const MAX_BODY_BYTES = 1024 * 1024 // 1MB

// SSRF guard: this route fetches caller-supplied URLs server-side (and follows a
// PresignedURL out of the page body), so without validation it's an open proxy into
// cloud-metadata / internal hosts. Only https, and never a target that resolves to a
// private/loopback/link-local address (incl. DNS-rebinding — we check the *resolved* IP).
const isPrivateIPv4 = (ip) => {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 10) return true // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local (incl. 169.254.169.254)
  return false
}

const isPrivateIPv6 = (ip) => {
  const addr = ip.toLowerCase().split('%')[0] // drop any zone id
  if (addr === '::1' || addr === '::') return true // loopback / unspecified
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/) // IPv4-mapped IPv6
  if (mapped) return isPrivateIPv4(mapped[1])
  const firstHextet = parseInt(addr.split(':')[0] || '0', 16)
  if (Number.isNaN(firstHextet)) return false
  if ((firstHextet & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((firstHextet & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  return false
}

const isPrivateIp = (ip) => (ip.includes(':') ? isPrivateIPv6(ip) : isPrivateIPv4(ip))

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal'])

// Resolve the hostname and reject if it (or any address it resolves to) is private.
// dns.lookup returns literal IPs unchanged, so this also covers literal-IP hosts.
const isBlockedHost = async (hostname) => {
  const host = (hostname || '').toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
  if (!host) return true
  if (BLOCKED_HOSTNAMES.has(host)) return true
  try {
    const results = await dns.lookup(host, { all: true })
    if (!results.length) return true
    return results.some(({ address }) => isPrivateIp(address))
  } catch {
    return true // unresolvable → treat as blocked
  }
}

// Returns the parsed URL if it's a safe https target, otherwise null.
const validateFetchTarget = async (raw) => {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (await isBlockedHost(parsed.hostname)) return null
  return parsed
}

// Read a fetch response body as text, stopping once we've pulled MAX_BODY_BYTES so an
// oversized page can't exhaust memory. Falls back to text() if the body isn't streamable.
const readBodyCapped = async (response) => {
  const reader = response.body && typeof response.body.getReader === 'function' ? response.body.getReader() : null
  if (!reader) {
    const text = await response.text()
    return text.slice(0, MAX_BODY_BYTES)
  }
  const decoder = new TextDecoder()
  let received = 0
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.length
    out += decoder.decode(value, { stream: true })
    if (received >= MAX_BODY_BYTES) {
      out += decoder.decode()
      try {
        await reader.cancel()
      } catch {
        /* ignore cancel errors */
      }
      break
    }
  }
  return out
}

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
        // Same reasoning as scan-receipt.tsx/categorize-item.tsx: forwards to the
        // shared Gemini free-tier quota. Checked before the SSRF/body validation
        // below, not instead of it — this closes a different hole (who may call this
        // route at all), the SSRF guards below still protect against a signed-in
        // caller supplying a malicious target URL.
        const authResult = await verifyAuthToken(request)
        if (!authResult.ok) {
          logger.warn(`[scan-receipt-url] request rejected: unauthorized (${authResult.reason})`)
          return Response.json({ error: true, message: 'unauthorized' }, { status: 401 })
        }

        const { url } = (await request.json()) || {}
        if (!url || typeof url !== 'string') {
          logger.warn('[scan-receipt-url] request rejected: missing url')
          return Response.json({ error: true, message: 'missing url' }, { status: 400 })
        }

        const target = await validateFetchTarget(url)
        if (!target) {
          logger.warn(`[scan-receipt-url] request rejected: blocked url: ${url}`)
          return Response.json({ error: true, message: 'blocked url' }, { status: 400 })
        }

        logger.success(`[scan-receipt-url] fetching page: ${target.href}`)
        try {
          const pageResponse = await fetch(target.href)
          logger.success(`[scan-receipt-url] page fetched: status=${pageResponse.status}`)
          const pageHtml = await readBodyCapped(pageResponse)

          let combined = pageHtml
          const presignedUrl = findPresignedUrl(pageHtml)
          if (presignedUrl) {
            const presignedTarget = await validateFetchTarget(presignedUrl)
            if (!presignedTarget) {
              logger.warn(`[scan-receipt-url] blocked PresignedURL, using page content only: ${presignedUrl}`)
            } else {
              logger.success(`[scan-receipt-url] found PresignedURL, fetching detail: ${presignedTarget.href}`)
              try {
                const detailResponse = await fetch(presignedTarget.href)
                combined += '\n' + (await readBodyCapped(detailResponse))
                logger.success(`[scan-receipt-url] detail fetched: status=${detailResponse.status}`)
              } catch (err) {
                logger.warn(`[scan-receipt-url] presigned detail fetch failed, using page content only: ${err.message}`)
              }
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

export const __ssrfInternals = { isBlockedHost, isPrivateIp, validateFetchTarget }
