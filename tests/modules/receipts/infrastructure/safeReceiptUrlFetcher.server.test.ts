/** @jest-environment node */
import { SafeReceiptUrlFetcher, isPublicIpAddress, MAX_RECEIPT_URL_BYTES } from '../../../../src/modules/receipts/infrastructure/safeReceiptUrlFetcher.server'

const body = async function* (value: string) { yield Buffer.from(value) }

describe('isPublicIpAddress', () => {
  it.each(['0.0.0.0','10.0.0.1','100.64.0.1','127.0.0.1','169.254.169.254','172.31.0.1','192.168.1.1','224.0.0.1','255.255.255.255','::','::1','::127.0.0.1','fc00::1','fec0::1','fe80::1','ff02::1','2001:db8::1','2002:7f00:1::1','::ffff:127.0.0.1','::ffff:10.0.0.1'])(
    'blocks non-public %s', (ip) => expect(isPublicIpAddress(ip)).toBe(false)
  )
  it.each(['8.8.8.8','93.184.216.34','2606:4700:4700::1111','2001:4860:4860::8888'])(
    'allows public %s', (ip) => expect(isPublicIpAddress(ip)).toBe(true)
  )
})

describe('SafeReceiptUrlFetcher', () => {
  it('pins the connection to the validated DNS answer', async () => {
    const resolver = jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const transport = jest.fn(async (_url: URL, selected: { address: string; family: number }, _timeoutMs: number) => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: body('<b>Receipt</b>') }))
    await expect(new SafeReceiptUrlFetcher(resolver, transport).fetchText('https://example.com/r')).resolves.toBe('Receipt')
    expect(transport.mock.calls[0][1]).toEqual({ address: '93.184.216.34', family: 4 })
    expect(transport.mock.calls[0][2]).toBe(10_000)
  })

  it('re-resolves and blocks a redirect that rebinds to a private address', async () => {
    const resolver = jest.fn()
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }])
    const transport = jest.fn().mockResolvedValue({ status: 302, headers: { location: 'https://public.example/metadata' }, body: body('') })
    await expect(new SafeReceiptUrlFetcher(resolver, transport).fetchText('https://public.example/r')).rejects.toMatchObject({ code: 'invalid_input' })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('validates and follows bounded relative redirects', async () => {
    const resolver = jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const transport = jest.fn()
      .mockResolvedValueOnce({ status: 302, headers: { location: '/final' }, body: body('') })
      .mockResolvedValueOnce({ status: 200, headers: { 'content-type': 'text/html' }, body: body('<p>Final receipt</p>') })
    await expect(new SafeReceiptUrlFetcher(resolver, transport).fetchText('https://example.com/start'))
      .resolves.toBe('Final receipt')
    expect(resolver).toHaveBeenCalledTimes(2)
    expect(transport.mock.calls[1][0].href).toBe('https://example.com/final')
  })

  it('rejects redirect loops after the configured maximum', async () => {
    const resolver = jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const transport = jest.fn().mockResolvedValue({ status: 302, headers: { location: '/again' }, body: body('') })
    await expect(new SafeReceiptUrlFetcher(resolver, transport).fetchText('https://example.com/start'))
      .rejects.toMatchObject({ code: 'invalid_input' })
    expect(transport).toHaveBeenCalledTimes(6)
  })

  it('blocks mixed public/private DNS answers and credentialed or non-HTTPS URLs', async () => {
    const resolver = jest.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }
    ])
    const transport = jest.fn()
    const fetcher = new SafeReceiptUrlFetcher(resolver, transport)
    await expect(fetcher.fetchText('https://mixed.example')).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(fetcher.fetchText('http://example.com')).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(fetcher.fetchText('https://user:pass@example.com')).rejects.toMatchObject({ code: 'invalid_input' })
    expect(transport).not.toHaveBeenCalled()
  })

  it('validates an embedded PresignedURL independently before fetching it', async () => {
    const resolver = jest.fn()
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '::1', family: 6 }])
    const transport = jest.fn().mockResolvedValue({
      status: 200, headers: { 'content-type': 'application/json' }, body: body('{"PresignedURL":"https://private.example/detail"}')
    })
    await expect(new SafeReceiptUrlFetcher(resolver, transport).fetchText('https://public.example')).rejects.toMatchObject({ code: 'invalid_input' })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('enforces declared and streamed byte limits plus transport timeouts', async () => {
    const resolver = jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const declared = jest.fn().mockResolvedValue({ status: 200, headers: { 'content-type': 'text/plain', 'content-length': String(MAX_RECEIPT_URL_BYTES + 1) }, body: body('') })
    await expect(new SafeReceiptUrlFetcher(resolver, declared).fetchText('https://example.com')).rejects.toMatchObject({ code: 'invalid_input' })
    const streamed = jest.fn().mockResolvedValue({ status: 200, headers: { 'content-type': 'text/plain' }, body: body('x'.repeat(11)) })
    await expect(new SafeReceiptUrlFetcher(resolver, streamed, 10).fetchText('https://example.com')).rejects.toMatchObject({ code: 'invalid_input' })
    const timeout = jest.fn().mockRejectedValue(new Error('timeout'))
    await expect(new SafeReceiptUrlFetcher(resolver, timeout).fetchText('https://example.com')).rejects.toMatchObject({ code: 'upstream_failed' })
  })

  it.each([undefined, 'application/octet-stream', 'image/svg+xml'])(
    'rejects unsupported content type %s before reading the response body',
    async (contentType) => {
      const resolver = jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      const responseBody = body('private binary content')
      const transport = jest.fn().mockResolvedValue({
        status: 200,
        headers: contentType ? { 'content-type': contentType } : {},
        body: responseBody
      })

      await expect(new SafeReceiptUrlFetcher(resolver, transport).fetchText('https://example.com'))
        .rejects.toMatchObject({ code: 'invalid_input' })
    }
  )
})
