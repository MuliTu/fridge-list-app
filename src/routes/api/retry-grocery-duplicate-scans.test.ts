/** @jest-environment node */

jest.mock('@tanstack/react-router', () => ({ createFileRoute: () => () => ({}) }))
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('../../lib/logger', () => ({ logger: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import { createDuplicateScanGetHandler } from './retry-grocery-duplicate-scans'
import type { DuplicateScanRepository } from '../../modules/groceries'

const repository = (): DuplicateScanRepository => ({
  findReadyJobs: jest.fn().mockResolvedValue([]),
  claim: jest.fn(),
  loadCandidates: jest.fn(),
  complete: jest.fn(),
  fail: jest.fn()
})
describe('duplicate scan cron route', () => {
  const previous = process.env.CRON_SECRET
  afterEach(() => { process.env.CRON_SECRET = previous })

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
    const response = await createDuplicateScanGetHandler({
      repository: repository(), now: () => new Date('2026-11-07T10:00:00.000Z'), createWorkerId: () => 'worker'
    })({ request: new Request('https://example.test/api/retry-grocery-duplicate-scans', {
      headers: { authorization: 'Bearer secret' }
    }) })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, claimed: 0, completed: 0, failed: 0 })
  })
})
