import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'

import { ApplicationError } from '../../shared'
import type { ReceiptUrlFetcher } from '../application/scanReceiptUrl.service'

export const MAX_RECEIPT_URL_BYTES = 1024 * 1024
export const MAX_RECEIPT_TEXT_LENGTH = 20_000
export const MAX_RECEIPT_REDIRECTS = 5
export const RECEIPT_FETCH_TIMEOUT_MS = 10_000
export const RECEIPT_URL_CONTENT_TYPES = new Set([
  'application/json',
  'text/html',
  'text/plain'
])

type Address = { address: string; family: number }
type SafeResponse = { status: number; headers: Record<string, string | string[] | undefined>; body: AsyncIterable<Uint8Array> }
export type SafeUrlTransport = (url: URL, address: Address, timeoutMs: number) => Promise<SafeResponse>
export type HostResolver = (hostname: string) => Promise<Address[]>

const ipv4Number = (address: string): number | null => {
  const parts = address.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null
  return parts.reduce((value, part) => value * 256 + Number(part), 0) >>> 0
}
const cidr4 = (value: number, base: string, prefix: number) => {
  const target = ipv4Number(base)!
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (value & mask) === (target & mask)
}

const blockedV4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
] as const

const ipv6BigInt = (raw: string): bigint | null => {
  let address = raw.toLowerCase().split('%')[0]
  const embedded = address.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (embedded) {
    const value = ipv4Number(embedded)
    if (value == null) return null
    address = address.slice(0, -embedded.length) + `${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`
  }
  const halves = address.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null
  const pieces = [...left, ...Array(missing).fill('0'), ...right]
  if (pieces.length !== 8 || pieces.some((piece) => !/^[0-9a-f]{1,4}$/.test(piece))) return null
  return pieces.reduce((value, piece) => (value << 16n) + BigInt(`0x${piece}`), 0n)
}

const cidr6 = (value: bigint, base: bigint, prefix: number) =>
  prefix === 0 || (value >> BigInt(128 - prefix)) === (base >> BigInt(128 - prefix))

export const isPublicIpAddress = (address: string): boolean => {
  const family = isIP(address.split('%')[0])
  if (family === 4) {
    const value = ipv4Number(address)
    return value != null && !blockedV4.some(([base, prefix]) => cidr4(value, base, prefix))
  }
  if (family !== 6) return false
  const value = ipv6BigInt(address)
  if (value == null) return false
  const mappedPrefix = 0xffffn
  if ((value >> 32n) === mappedPrefix) {
    const mapped = Number(value & 0xffffffffn)
    return !blockedV4.some(([base, prefix]) => cidr4(mapped, base, prefix))
  }
  const blocks: Array<[bigint, number]> = [
    [0n, 96], [0x0064ff9b0001n << 80n, 48], [0x0100n << 112n, 64],
    [0xfc00n << 112n, 7], [0xfe80n << 112n, 10], [0xfec0n << 112n, 10],
    [0xff00n << 112n, 8], [0x20010db8n << 96n, 32], [0x2002n << 112n, 16]
  ]
  return !blocks.some(([base, prefix]) => cidr6(value, base, prefix))
}

const defaultResolver: HostResolver = (hostname) =>
  dnsLookup(hostname.replace(/^\[|\]$/g, ''), { all: true, verbatim: true })

const defaultTransport: SafeUrlTransport = (url, selected, timeoutMs) =>
  new Promise((resolve, reject) => {
    let absoluteTimeout: ReturnType<typeof setTimeout>
    const request = httpsRequest(url, {
      method: 'GET',
      headers: { Accept: 'text/html,text/plain,application/json' },
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family)
    }, (response) => {
      const clearAbsoluteTimeout = () => clearTimeout(absoluteTimeout)
      response.once('end', clearAbsoluteTimeout)
      response.once('close', clearAbsoluteTimeout)
      resolve({ status: response.statusCode ?? 502, headers: response.headers, body: response })
    })
    absoluteTimeout = setTimeout(() => request.destroy(new Error('timeout')), timeoutMs)
    request.on('error', (error) => {
      clearTimeout(absoluteTimeout)
      reject(error)
    })
    request.end()
  })

const header = (headers: SafeResponse['headers'], name: string): string | undefined => {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}

const stripHtml = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10))).replace(/\s+/g, ' ').trim()

const presignedUrl = (html: string): string | null => {
  const match = html.match(/"PresignedURL"\s*:\s*"([^"]+)"/)
  return match ? match[1].replace(/\\u002F/gi, '/').replace(/\\\//g, '/') : null
}

export class SafeReceiptUrlFetcher implements ReceiptUrlFetcher {
  constructor(
    private readonly resolver: HostResolver = defaultResolver,
    private readonly transport: SafeUrlTransport = defaultTransport,
    private readonly maxBytes = MAX_RECEIPT_URL_BYTES,
    private readonly timeoutMs = RECEIPT_FETCH_TIMEOUT_MS
  ) {}

  private parse(raw: string, base?: URL): URL {
    let url: URL
    try { url = base ? new URL(raw, base) : new URL(raw) } catch (error) {
      throw new ApplicationError('invalid_input', 'Receipt URL is invalid', error)
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new ApplicationError('invalid_input', 'Receipt URL is blocked')
    }
    return url
  }

  private async fetchOne(raw: string, redirects = 0, base?: URL): Promise<string> {
    if (redirects > MAX_RECEIPT_REDIRECTS) throw new ApplicationError('invalid_input', 'Too many receipt URL redirects')
    const url = this.parse(raw, base)
    let addresses: Address[]
    try { addresses = await this.resolver(url.hostname) } catch (error) {
      throw new ApplicationError('invalid_input', 'Receipt URL host could not be resolved', error)
    }
    if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
      throw new ApplicationError('invalid_input', 'Receipt URL is blocked')
    }
    let response: SafeResponse
    try { response = await this.transport(url, addresses[0], this.timeoutMs) } catch (error) {
      throw new ApplicationError('upstream_failed', 'Receipt URL fetch failed', error)
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = header(response.headers, 'location')
      if (!location) throw new ApplicationError('upstream_failed', 'Receipt URL redirect is invalid')
      return this.fetchOne(location, redirects + 1, url)
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ApplicationError('upstream_failed', `Receipt URL returned HTTP ${response.status}`)
    }
    const contentType = header(response.headers, 'content-type')
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase()
    if (!contentType || !RECEIPT_URL_CONTENT_TYPES.has(contentType)) {
      throw new ApplicationError('invalid_input', 'Receipt URL content type is not supported')
    }
    const declared = Number(header(response.headers, 'content-length'))
    if (Number.isFinite(declared) && declared > this.maxBytes) throw new ApplicationError('invalid_input', 'Receipt URL response is too large')
    const chunks: Uint8Array[] = []
    let received = 0
    for await (const chunk of response.body) {
      received += chunk.byteLength
      if (received > this.maxBytes) throw new ApplicationError('invalid_input', 'Receipt URL response is too large')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  async fetchText(url: string): Promise<string> {
    const page = await this.fetchOne(url)
    const detail = presignedUrl(page)
    const combined = detail ? `${page}\n${await this.fetchOne(detail)}` : page
    return stripHtml(combined).slice(0, MAX_RECEIPT_TEXT_LENGTH)
  }
}
