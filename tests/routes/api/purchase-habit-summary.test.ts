/**
 * @jest-environment node
 *
 * Node environment (not the default jsdom) so the real Fetch API's Request/Response
 * globals are available — this route handler uses both directly.
 *
 * verifyAuthToken is mocked (never hits the real Google JWKS) — its own real
 * verification logic is covered separately in tests/lib/verifyAuthToken.test.ts. These
 * tests only cover this route's wiring: does it 401 when unauthorized, does it skip
 * calling n8n for an empty changes list (no point burning the shared Gemini quota for
 * nothing to summarize), and does it still forward to n8n once authorized with real
 * changes.
 */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

const verifyAuthTokenMock = jest.fn()
jest.mock('../../../src/lib/verifyAuthToken', () => ({ verifyAuthToken: (...args: unknown[]) => verifyAuthTokenMock(...args) }))

import { Route } from '../../../src/routes/api/purchase-habit-summary'

const postHandler = (Route.options.server as any).handlers.POST

const callPost = (body: unknown) =>
  postHandler({
    request: new Request('http://localhost/api/purchase-habit-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  })

const callPostWithBody = (body: string) =>
  postHandler({
    request: new Request('http://localhost/api/purchase-habit-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    })
  })

const sampleChange = {
  itemName: 'קפה',
  direction: 'increase',
  window: 'weekly',
  recentCount: 6,
  priorCount: 1
}

describe('POST /api/purchase-habit-summary auth gating', () => {
  const originalWebhookUrl = process.env.PURCHASE_HABIT_SUMMARY_WEBHOOK_URL

  beforeEach(() => {
    process.env.PURCHASE_HABIT_SUMMARY_WEBHOOK_URL = 'https://n8n.example.test/webhook/purchase-habit-summary'
    verifyAuthTokenMock.mockReset()
    ;(globalThis as any).fetch = jest.fn()
  })

  afterAll(() => {
    if (originalWebhookUrl === undefined) {
      delete process.env.PURCHASE_HABIT_SUMMARY_WEBHOOK_URL
    } else {
      process.env.PURCHASE_HABIT_SUMMARY_WEBHOOK_URL = originalWebhookUrl
    }
  })

  it('returns 401 and never calls n8n when unauthenticated', async () => {
    verifyAuthTokenMock.mockResolvedValue({ ok: false, reason: 'missing bearer token' })
    const response = await callPost({ changes: [sampleChange] })
    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data).toEqual({ error: true, message: 'unauthorized' })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('skips calling n8n and returns an empty summary when there are no changes to summarize', async () => {
    verifyAuthTokenMock.mockResolvedValue({ ok: true, uid: 'user-1' })
    const response = await callPost({ changes: [] })
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ summary: [] })
  })

  it('treats a missing/malformed changes field the same as empty (never throws, never calls n8n)', async () => {
    verifyAuthTokenMock.mockResolvedValue({ ok: true, uid: 'user-1' })
    const response = await callPost({})
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ summary: [] })
  })

  it('maps malformed JSON to 400 without calling n8n', async () => {
    verifyAuthTokenMock.mockResolvedValue({ ok: true, uid: 'user-1' })

    const response = await callPostWithBody('{invalid')

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: true, message: 'Invalid request' })
  })

  it('maps unexpected auth failures to a safe 500 response', async () => {
    verifyAuthTokenMock.mockRejectedValue(new Error('private verifier detail'))

    const response = await callPost({ changes: [sampleChange] })

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: true,
      message: 'Internal server error'
    })
  })

  it('returns 500 when real changes exist but the webhook is not configured', async () => {
    delete process.env.PURCHASE_HABIT_SUMMARY_WEBHOOK_URL
    verifyAuthTokenMock.mockResolvedValue({ ok: true, uid: 'user-1' })

    const response = await callPost({ changes: [sampleChange] })

    expect(response.status).toBe(500)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ error: true, message: 'not_configured' })
  })

  it('forwards to n8n once authenticated with real changes', async () => {
    verifyAuthTokenMock.mockResolvedValue({ ok: true, uid: 'user-1' })
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({ summary: ['You’ve been buying a lot more coffee lately.'] })
    })
    const response = await callPost({ changes: [sampleChange] })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [, requestInit] = (globalThis.fetch as jest.Mock).mock.calls[0]
    expect(JSON.parse(requestInit.body)).toEqual({ changes: [sampleChange] })
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.summary).toHaveLength(1)
  })

  it('returns a 502 with a clean error payload when the upstream call throws', async () => {
    verifyAuthTokenMock.mockResolvedValue({ ok: true, uid: 'user-1' })
    ;(globalThis.fetch as jest.Mock).mockRejectedValue(new Error('network error'))
    const response = await callPost({ changes: [sampleChange] })
    expect(response.status).toBe(502)
    const data = await response.json()
    expect(data).toEqual({ error: true, message: 'purchase habit summary upstream failed' })
  })
})
