/** @jest-environment node */

jest.mock('@tanstack/react-router', () => ({ createFileRoute: () => () => ({}) }))
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('../../lib/logger', () => ({ logger: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import { createDuplicateScanGetHandler } from './retry-grocery-duplicate-scans'
import type { DuplicateScanRepository } from '../../modules/groceries'

const repository = (busy = false) => {
  const leaseRequested = jest.fn()
  return {
    leaseRequested,
    async withWorkerLease<T>(workerId: string, now: Date, run: () => Promise<T>): Promise<T | null> {
      leaseRequested(workerId, now)
      return busy ? null : run()
    },
    backfillBatch: jest.fn().mockResolvedValue({ queued: 3, nextCursor: null }),
    findReadyJobs: jest.fn().mockResolvedValue([]),
    claim: jest.fn(),
    loadCandidates: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn()
  } satisfies DuplicateScanRepository & {
    leaseRequested: unknown
    withWorkerLease: unknown
    backfillBatch: unknown
  }
}
describe('duplicate scan cron route', () => {
  const previous = process.env.CRON_SECRET
  afterEach(() => {
    if (previous === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previous
  })

  it('fails closed without cron configuration or authorization', async () => {
    delete process.env.CRON_SECRET
    await expect(createDuplicateScanGetHandler({ repository: repository(), now: () => new Date(), createWorkerId: () => 'w' })({
      request: new Request('https://example.test/api/retry-grocery-duplicate-scans')
    }).then((response) => response.status)).resolves.toBe(500)
    process.env.CRON_SECRET = 'secret'
    await expect(createDuplicateScanGetHandler({ repository: repository(), now: () => new Date(), createWorkerId: () => 'w' })({
      request: new Request('https://example.test/api/retry-grocery-duplicate-scans')
    }).then((response) => response.status)).resolves.toBe(401)
  })

  it('runs the bounded worker for an authorized request', async () => {
    process.env.CRON_SECRET = 'secret'
    const queue = repository()
    const now = new Date('2026-11-07T10:00:00.000Z')
    const response = await createDuplicateScanGetHandler({
      repository: queue, now: () => now, createWorkerId: () => 'worker'
    })({ request: new Request('https://example.test/api/retry-grocery-duplicate-scans', {
      headers: { authorization: 'Bearer secret' }
    }) })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, claimed: 0, completed: 0, failed: 0 })
    expect(queue.leaseRequested).toHaveBeenCalledWith('worker', now)
    expect(queue.findReadyJobs).toHaveBeenCalledWith(now.toISOString(), 10)
  })

  it('accepts a backfill cursor only after cron authentication and leaves the normal queue alone', async () => {
    process.env.CRON_SECRET = 'secret'
    const queue = repository()
    const handler = createDuplicateScanGetHandler({
      repository: queue, now: () => new Date('2026-11-07T10:00:00.000Z'), createWorkerId: () => 'worker'
    })
    const post = (body: string, token = 'secret') => handler({
      request: new Request('https://example.test/api/retry-grocery-duplicate-scans', {
        method: 'POST', body, headers: { authorization: `Bearer ${token}` }
      })
    })
    expect((await post('null', 'wrong')).status).toBe(401)
    expect((await post('{"itemId":"a"}')).status).toBe(400)
    expect((await post('{"listId":"a/b"}')).status).toBe(400)
    expect((await post('{"listId":"a","itemId":null}')).status).toBe(400)
    expect(queue.backfillBatch).not.toHaveBeenCalled()
    expect(queue.leaseRequested).not.toHaveBeenCalled()
    const result = await post('{"listId":"legacy","itemId":"a"}')
    await expect(result.json()).resolves.toEqual({ ok: true, backfill: { queued: 3, nextCursor: null } })
    expect(queue.backfillBatch).toHaveBeenCalledWith({ listId: 'legacy', itemId: 'a' }, '2026-11-07T10:00:00.000Z')
    expect(queue.findReadyJobs).not.toHaveBeenCalled()
    expect(queue.leaseRequested).toHaveBeenCalledTimes(1)
    expect(result.headers.get('Cache-Control')).toBe('no-store')
  })

  it('returns a conflict to both triggers while the shared worker lease is held', async () => {
    process.env.CRON_SECRET = 'secret'
    const queue = repository(true)
    const handler = createDuplicateScanGetHandler({ repository: queue, now: () => new Date(), createWorkerId: () => 'w' })
    const headers = { authorization: 'Bearer secret' }
    const url = 'https://example.test/api/retry-grocery-duplicate-scans'
    expect((await handler({ request: new Request(url, { headers }) })).status).toBe(409)
    expect((await handler({ request: new Request(url, { headers, method: 'POST', body: 'null' }) })).status).toBe(409)
    expect(queue.findReadyJobs).not.toHaveBeenCalled()
    expect(queue.backfillBatch).not.toHaveBeenCalled()
  })
})
