/**
 * SSRF guard unit tests for the receipt-URL scan route.
 * dns.lookup is mocked so nothing here touches the real network/DNS.
 */
const lookupMock = jest.fn()
jest.mock('node:dns/promises', () => ({ __esModule: true, default: { lookup: (...args: unknown[]) => lookupMock(...args) } }))

import { __ssrfInternals } from './scan-receipt-url'

const { isPrivateIp, isBlockedHost, validateFetchTarget } = __ssrfInternals

// Make dns.lookup echo the hostname back as the resolved address for literal IPs,
// so isBlockedHost's resolved-IP check exercises the range logic. Overridden per-test
// for real hostnames.
beforeEach(() => {
  lookupMock.mockReset()
  lookupMock.mockImplementation(async (host: string) => [{ address: host, family: host.includes(':') ? 6 : 4 }])
})

describe('isPrivateIp', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '169.254.169.254', // cloud metadata
    '0.0.0.0',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1' // IPv4-mapped loopback
  ])('flags %s as private', (ip) => {
    expect(isPrivateIp(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111'])(
    'allows public %s',
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false)
    }
  )
})

describe('isBlockedHost', () => {
  it('blocks localhost and metadata hostnames without needing DNS', async () => {
    expect(await isBlockedHost('localhost')).toBe(true)
    expect(await isBlockedHost('metadata.google.internal')).toBe(true)
  })

  it('blocks a hostname that resolves to a private IP (DNS-rebinding defense)', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }])
    expect(await isBlockedHost('evil.example.com')).toBe(true)
  })

  it('allows a hostname that resolves to a public IP', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
    expect(await isBlockedHost('example.com')).toBe(false)
  })

  it('blocks an unresolvable hostname', async () => {
    lookupMock.mockRejectedValueOnce(new Error('ENOTFOUND'))
    expect(await isBlockedHost('nope.invalid')).toBe(true)
  })
})

describe('validateFetchTarget', () => {
  it('rejects non-https schemes', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    expect(await validateFetchTarget('http://example.com/x')).toBeNull()
    expect(await validateFetchTarget('file:///etc/passwd')).toBeNull()
    expect(await validateFetchTarget('ftp://example.com')).toBeNull()
  })

  it('rejects a malformed url', async () => {
    expect(await validateFetchTarget('not a url')).toBeNull()
  })

  it('rejects an https url pointing at a private/metadata IP', async () => {
    expect(await validateFetchTarget('https://169.254.169.254/latest/meta-data/')).toBeNull()
    expect(await validateFetchTarget('https://localhost:8080/admin')).toBeNull()
  })

  it('accepts a normal public https url', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const parsed = await validateFetchTarget('https://www.shufersal.co.il/receipt/123')
    expect(parsed).not.toBeNull()
    expect(parsed?.protocol).toBe('https:')
  })
})
