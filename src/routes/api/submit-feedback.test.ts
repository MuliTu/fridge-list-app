/**
 * @jest-environment node
 *
 * Node environment (not the default jsdom) so the real Fetch API's Request/Response
 * globals are available — this route handler uses both directly.
 *
 * verifyAuthToken is mocked (never hits the real Google JWKS) — its own real
 * verification logic is covered separately in src/lib/verifyAuthToken.test.ts. These
 * tests only cover this route's wiring: does it 401 when unauthorized, and does it
 * still forward to n8n once authorized.
 */
const verifyAuthTokenMock = jest.fn()
jest.mock('../../lib/verifyAuthToken', () => ({ verifyAuthToken: (...args: unknown[]) => verifyAuthTokenMock(...args) }))

import { Route } from './submit-feedback'

const postHandler = (Route.options.server as any).handlers.POST

const callPost = (body: unknown) =>
  postHandler({
    request: new Request('http://localhost/api/submit-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  })

describe('POST /api/submit-feedback auth gating', () => {
  beforeEach(() => {
    verifyAuthTokenMock.mockReset()
    ;(globalThis as any).fetch = jest.fn()
  })

  it('returns 401 and never calls n8n/Trello when unauthenticated', async () => {
    verifyAuthTokenMock.mockResolvedValue({ ok: false, reason: 'missing bearer token' })
    const response = await callPost({ request: 'add a dark mode toggle' })
    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data).toEqual({ error: true, message: 'unauthorized' })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('forwards to n8n once authenticated', async () => {
    verifyAuthTokenMock.mockResolvedValue({ ok: true, uid: 'user-1' })
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ cardUrl: 'https://trello.com/c/abc123' })
    })
    const response = await callPost({ request: 'add a dark mode toggle' })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.cardUrl).toBe('https://trello.com/c/abc123')
  })
})
