/**
 * @jest-environment node
 *
 * Node environment so the real Fetch API's Request/Response globals are available —
 * this route handler uses both directly, same as the other server-route tests
 * (submit-feedback.test.ts, n8n-write-groceries.test.ts).
 *
 * This file only covers the route's own wiring — CRON_SECRET auth gating, the
 * "credential not provisioned" fail-soft paths, and that a successful run reaches
 * n8n and returns its summary. The interesting retry/claim/status-transition logic
 * itself is covered in src/lib/retryFeedback.test.ts against a plain in-memory fake,
 * so firebaseAdmin.server.ts is mocked wholesale here rather than faking firebase-admin's
 * real transaction API.
 */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

const isFirebaseAdminConfiguredMock = jest.fn()
const getAdminDatabaseMock = jest.fn()

jest.mock('../../lib/firebaseAdmin.server', () => {
  const actual = jest.requireActual('../../lib/firebaseAdmin.server')
  return {
    ...actual,
    isFirebaseAdminConfigured: (...args: unknown[]) => isFirebaseAdminConfiguredMock(...args),
    getAdminDatabase: (...args: unknown[]) => getAdminDatabaseMock(...args)
  }
})

import { Route } from './retry-feedback'

const getHandler = (Route.options.server as any).handlers.GET

const callGet = (headers: Record<string, string> = {}) =>
  getHandler({ request: new Request('http://localhost/api/retry-feedback', { method: 'GET', headers }) })

const CRON_SECRET = 'test-cron-secret'

// A minimal fake mimicking the slice of the Admin SDK's namespaced Database API this
// route's buildAdapter() calls: db.ref('feedbacks').get() / .child(key).transaction() /
// .child(key).update().
function makeFakeDb(records: Record<string, any>) {
  const store = { ...records }
  return {
    ref: () => ({
      get: async () => ({ val: () => ({ ...store }) }),
      child: (key: string) => ({
        transaction: async (updater: (current: any) => any) => {
          const next = updater(store[key] ?? null)
          if (next === undefined) return { committed: false, snapshot: { exists: () => false, val: () => null } }
          store[key] = next
          return { committed: true, snapshot: { exists: () => true, val: () => store[key] } }
        },
        update: async (fields: Record<string, unknown>) => {
          store[key] = { ...store[key], ...fields }
        }
      })
    }),
    _store: store
  }
}

describe('GET /api/retry-feedback', () => {
  const originalCronSecret = process.env.CRON_SECRET

  const previousEndpoint = process.env.FEEDBACK_WEBHOOK_URL
  afterAll(() => {
    if (previousEndpoint === undefined) delete process.env.FEEDBACK_WEBHOOK_URL
    else process.env.FEEDBACK_WEBHOOK_URL = previousEndpoint
  })

  it('disables an unconfigured workflow before network or database work', async () => {
    delete process.env.FEEDBACK_WEBHOOK_URL
    const response = await callGet({ authorization: `Bearer ${CRON_SECRET}` })
    expect(response.status).toBe(503)
    expect(getAdminDatabaseMock).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  beforeEach(() => {
    process.env.FEEDBACK_WEBHOOK_URL = 'https://workflow.example.test/hook'
    process.env.CRON_SECRET = CRON_SECRET
    isFirebaseAdminConfiguredMock.mockReset()
    getAdminDatabaseMock.mockReset()
    ;(globalThis as any).fetch = jest.fn()
  })

  afterAll(() => {
    process.env.CRON_SECRET = originalCronSecret
  })

  it('returns 500 and never checks Firebase config when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET
    const response = await callGet({ authorization: `Bearer ${CRON_SECRET}` })
    expect(response.status).toBe(500)
    expect(isFirebaseAdminConfiguredMock).not.toHaveBeenCalled()
  })

  it('returns 401 when the bearer token is missing or wrong', async () => {
    const response = await callGet({ authorization: 'Bearer wrong-secret' })
    expect(response.status).toBe(401)
    expect(isFirebaseAdminConfiguredMock).not.toHaveBeenCalled()
  })

  it('returns 401 when there is no authorization header at all', async () => {
    const response = await callGet()
    expect(response.status).toBe(401)
  })

  it('returns 503 when Firebase Admin credentials are not provisioned', async () => {
    isFirebaseAdminConfiguredMock.mockReturnValue(false)
    const response = await callGet({ authorization: `Bearer ${CRON_SECRET}` })
    expect(response.status).toBe(503)
    const data = await response.json()
    expect(data).toEqual({ error: true, message: 'not_configured' })
    expect(getAdminDatabaseMock).not.toHaveBeenCalled()
  })

  it('runs the retry job and returns a summary when everything is configured', async () => {
    isFirebaseAdminConfiguredMock.mockReturnValue(true)
    getAdminDatabaseMock.mockReturnValue(
      makeFakeDb({
        rec1: {
          createdAt: '2026-07-20T08:00:00.000Z',
          updatedAt: '2026-07-20T08:00:00.000Z',
          userId: 'someone@example.com',
          username: 'Someone',
          message: 'add a dark mode toggle',
          status: 'error',
          error: { message: 'previous failure' },
          retryCount: 1,
          lastAttemptAt: '2026-07-20T08:00:00.000Z',
          ticket: null
        }
      })
    )
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ cardUrl: 'https://trello.com/c/abc123', cardId: 'abc123', cardName: 'Add dark mode' })
    })

    const response = await callGet({ authorization: `Bearer ${CRON_SECRET}` })

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({
      processed: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      needsAttention: 0,
      notified: false
    })
  })

  // Ticket F3: a record left over from a previous run with a non-null attemptId must
  // not be retried through n8n — it should flow straight to needs_attention, and the
  // route should fire a second webhook call (the maintainer notification, reusing the
  // same FEEDBACK_WEBHOOK_URL — see notifyMaintainers in retry-feedback.tsx) rather
  // than the normal callN8n retry call.
  it('routes a stale-attemptId record to needs_attention and sends exactly one maintainer notification, without retrying it through n8n', async () => {
    isFirebaseAdminConfiguredMock.mockReturnValue(true)
    getAdminDatabaseMock.mockReturnValue(
      makeFakeDb({
        stuck: {
          createdAt: '2026-07-20T08:00:00.000Z',
          updatedAt: '2026-07-20T08:00:00.000Z',
          userId: 'someone@example.com',
          username: 'Someone',
          message: 'add a dark mode toggle',
          status: 'processing',
          error: null,
          retryCount: 1,
          lastAttemptAt: '2026-07-20T08:00:00.000Z',
          ticket: null,
          attemptId: 'leftover-from-a-crashed-run'
        }
      })
    )
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    })

    const response = await callGet({ authorization: `Bearer ${CRON_SECRET}` })

    // Exactly one fetch: the maintainer notification. callN8n (the would-be retry) is
    // never reached at all for this record.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [, requestInit] = (globalThis.fetch as jest.Mock).mock.calls[0]
    const sentBody = JSON.parse(requestInit.body)
    expect(sentBody.request).toMatch(/stuck/)
    expect(sentBody.source).toBe('fridge-list-app-retry-job-notification')

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      needsAttention: 1,
      notified: true
    })
  })
})
