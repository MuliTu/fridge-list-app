/** @jest-environment node */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('../../modules/composition.server', () => ({ getAuthenticatedUserHandler: jest.fn(), getScanReceiptFileService: jest.fn() }))
import { createScanReceiptFileHandler } from './scan-receipt'

it('delegates authentication before parsing and preserves scanner response status/body', async () => {
  const events: string[] = []
  const service = { execute: jest.fn().mockResolvedValue({ body: { store_name: 'Store' }, status: 202 }) }
  const authenticatedUserHandler = { handle: jest.fn(async (request, parse, execute) => {
    events.push('auth'); const input = await parse(request); events.push('parse'); return execute({ principal: { kind: 'user' }, requestId: 'r', now: new Date() }, input)
  }) }
  const handler = createScanReceiptFileHandler({ authenticatedUserHandler, service } as any)
  const response = await handler({ request: new Request('http://x', { method: 'POST', body: JSON.stringify({ image_base64: 'aW1hZ2U=', mime_type: 'image/jpeg' }) }) })
  expect(events).toEqual(['auth', 'parse'])
  expect(response.status).toBe(202)
  await expect(response.json()).resolves.toEqual({ store_name: 'Store' })
})

it('does not parse an invalid body or call the service when authentication rejects first', async () => {
  const service = { execute: jest.fn() }
  const authenticatedUserHandler = { handle: jest.fn(async () => Response.json({ error: true }, { status: 401 })) }
  const handler = createScanReceiptFileHandler({ authenticatedUserHandler, service } as any)
  const response = await handler({ request: new Request('http://x', { method: 'POST', body: '{invalid' }) })
  expect(response.status).toBe(401)
  expect(service.execute).not.toHaveBeenCalled()
})
