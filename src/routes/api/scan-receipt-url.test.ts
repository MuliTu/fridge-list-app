/** @jest-environment node */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('../../modules/composition.server', () => ({ getAuthenticatedUserHandler: jest.fn(), getScanReceiptUrlService: jest.fn() }))
import { createScanReceiptUrlHandler } from './scan-receipt-url'

it('keeps the URL route transport-only and preserves scanner response status/body', async () => {
  const service = { execute: jest.fn().mockResolvedValue({ body: { total: 42 }, status: 200 }) }
  const authenticatedUserHandler = { handle: jest.fn(async (request, parse, execute) => execute({ principal: { kind: 'user' }, requestId: 'r', now: new Date() }, await parse(request))) }
  const handler = createScanReceiptUrlHandler({ authenticatedUserHandler, service } as any)
  const response = await handler({ request: new Request('http://x', { method: 'POST', body: JSON.stringify({ url: 'https://example.com' }) }) })
  expect(service.execute).toHaveBeenCalledWith(expect.anything(), { url: 'https://example.com' })
  await expect(response.json()).resolves.toEqual({ total: 42 })
})
