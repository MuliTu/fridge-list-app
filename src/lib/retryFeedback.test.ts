/**
 * Exercises retryEligibleFeedbacks/isEligibleForRetry against an in-memory fake
 * adapter and a fake n8n caller — no firebase-admin import at all, and no network.
 * This is the whole point of retryFeedback.ts pulling the orchestration logic out
 * behind FeedbackRetryAdapter/N8nFeedbackCaller (see that file's comments): the
 * Admin SDK's transaction/get/update surface is mocked here at the boundary this
 * project's own code defines, not by trying to fake firebase-admin's real API.
 */
import { isEligibleForRetry, MAX_RETRY_COUNT, retryEligibleFeedbacks, type FeedbackRetryAdapter } from './retryFeedback'
import type { FeedbackRecord } from '../types'

const makeRecord = (overrides: Partial<FeedbackRecord> = {}): FeedbackRecord => ({
  createdAt: '2026-07-20T08:00:00.000Z',
  updatedAt: '2026-07-20T08:00:00.000Z',
  userId: 'someone@example.com',
  username: 'Someone',
  message: 'add a dark mode toggle',
  status: 'new',
  error: null,
  retryCount: 0,
  lastAttemptAt: null,
  ticket: null,
  ...overrides
})

// A minimal in-memory fake standing in for the real Admin SDK adapter built in
// retry-feedback.tsx — claimForProcessing mirrors the real transaction's semantics
// (re-checks eligibility, refuses a record another "caller" already claimed) closely
// enough to cover this module's actual logic, without any real Firebase involved.
class FakeAdapter implements FeedbackRetryAdapter {
  records: Record<string, FeedbackRecord>
  claimedKeys = new Set<string>()

  constructor(records: Record<string, FeedbackRecord>) {
    this.records = records
  }

  async getAllFeedbacks() {
    return { ...this.records }
  }

  async claimForProcessing(key: string) {
    const record = this.records[key]
    if (!record) return null
    if (this.claimedKeys.has(key)) return null // already claimed by someone else
    if ((record.status !== 'new' && record.status !== 'error') || record.retryCount >= MAX_RETRY_COUNT) return null
    this.claimedKeys.add(key)
    const claimed: FeedbackRecord = { ...record, status: 'processing' }
    this.records[key] = claimed
    return claimed
  }

  async markTicketCreated(key: string, ticket: FeedbackRecord['ticket']) {
    this.records[key] = { ...this.records[key], status: 'ticket_created', error: null, ticket }
  }

  async markError(key: string, error: { message: string; detail?: string }, retryCount: number) {
    this.records[key] = { ...this.records[key], status: 'error', error, retryCount }
  }
}

describe('isEligibleForRetry', () => {
  it('is eligible when status is new and retryCount is below the max', () => {
    expect(isEligibleForRetry({ status: 'new', retryCount: 0 })).toBe(true)
  })

  it('is eligible when status is error and retryCount is below the max', () => {
    expect(isEligibleForRetry({ status: 'error', retryCount: MAX_RETRY_COUNT - 1 })).toBe(true)
  })

  it('is not eligible once retryCount reaches the max', () => {
    expect(isEligibleForRetry({ status: 'error', retryCount: MAX_RETRY_COUNT })).toBe(false)
  })

  it('is not eligible once retryCount exceeds the max', () => {
    expect(isEligibleForRetry({ status: 'error', retryCount: MAX_RETRY_COUNT + 1 })).toBe(false)
  })

  it('is not eligible while processing', () => {
    expect(isEligibleForRetry({ status: 'processing', retryCount: 0 })).toBe(false)
  })

  it('is not eligible once a ticket was already created', () => {
    expect(isEligibleForRetry({ status: 'ticket_created', retryCount: 0 })).toBe(false)
  })
})

describe('retryEligibleFeedbacks', () => {
  it('picks up eligible new/error records and skips processing/ticket_created ones', async () => {
    const adapter = new FakeAdapter({
      eligibleNew: makeRecord({ status: 'new' }),
      eligibleError: makeRecord({ status: 'error', retryCount: 2 }),
      alreadyProcessing: makeRecord({ status: 'processing' }),
      alreadyDone: makeRecord({ status: 'ticket_created', ticket: { id: '1', url: 'https://trello.com/c/1', title: 'x' } })
    })
    const callN8n = jest.fn().mockResolvedValue({ ok: true, ticket: { id: 'c1', url: 'https://trello.com/c/c1', title: 't' } })

    const result = await retryEligibleFeedbacks(adapter, callN8n)

    expect(callN8n).toHaveBeenCalledTimes(2)
    expect(result.processed).toBe(2)
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(0)
    expect(adapter.records.alreadyProcessing.status).toBe('processing')
    expect(adapter.records.alreadyDone.status).toBe('ticket_created')
  })

  it('skips records at or over the max retry count entirely — never calls n8n for them', async () => {
    const adapter = new FakeAdapter({
      atMax: makeRecord({ status: 'error', retryCount: MAX_RETRY_COUNT }),
      overMax: makeRecord({ status: 'error', retryCount: MAX_RETRY_COUNT + 3 })
    })
    const callN8n = jest.fn()

    const result = await retryEligibleFeedbacks(adapter, callN8n)

    expect(callN8n).not.toHaveBeenCalled()
    expect(result.processed).toBe(0)
    expect(result.succeeded).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(0) // never even attempted a claim — filtered out up front
  })

  it('updates a successfully-retried record to ticket_created with the derived ticket, clearing error', async () => {
    const adapter = new FakeAdapter({
      key1: makeRecord({ status: 'error', retryCount: 1, error: { message: 'previous failure' } })
    })
    const ticket = { id: 'card-1', url: 'https://trello.com/c/card-1', title: 'Add dark mode' }
    const callN8n = jest.fn().mockResolvedValue({ ok: true, ticket })

    const result = await retryEligibleFeedbacks(adapter, callN8n)

    expect(result.succeeded).toBe(1)
    expect(adapter.records.key1.status).toBe('ticket_created')
    expect(adapter.records.key1.error).toBeNull()
    expect(adapter.records.key1.ticket).toEqual(ticket)
  })

  it('increments retryCount and records the error when n8n reports failure', async () => {
    const adapter = new FakeAdapter({
      key1: makeRecord({ status: 'error', retryCount: 2, error: { message: 'previous failure' } })
    })
    const callN8n = jest.fn().mockResolvedValue({ ok: false, message: 'quota_exceeded', detail: '429' })

    const result = await retryEligibleFeedbacks(adapter, callN8n)

    expect(result.failed).toBe(1)
    expect(adapter.records.key1.status).toBe('error')
    expect(adapter.records.key1.retryCount).toBe(3)
    expect(adapter.records.key1.error).toEqual({ message: 'quota_exceeded', detail: '429' })
  })

  it('increments retryCount and records the error when the n8n call throws', async () => {
    const adapter = new FakeAdapter({
      key1: makeRecord({ status: 'new', retryCount: 0 })
    })
    const callN8n = jest.fn().mockRejectedValue(new Error('network down'))

    const result = await retryEligibleFeedbacks(adapter, callN8n)

    expect(result.failed).toBe(1)
    expect(adapter.records.key1.status).toBe('error')
    expect(adapter.records.key1.retryCount).toBe(1)
    expect(adapter.records.key1.error).toEqual({ message: 'network down' })
  })

  it('counts a lost claim race as skipped, not failed, and never calls n8n for it', async () => {
    const adapter = new FakeAdapter({ key1: makeRecord({ status: 'new' }) })
    adapter.claimedKeys.add('key1') // simulate another run having already claimed it
    const callN8n = jest.fn()

    const result = await retryEligibleFeedbacks(adapter, callN8n)

    expect(callN8n).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
    expect(result.processed).toBe(0)
  })
})
