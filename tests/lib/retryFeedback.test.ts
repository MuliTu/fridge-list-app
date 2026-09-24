/**
 * Exercises retryEligibleFeedbacks/isEligibleForRetry against an in-memory fake
 * adapter and a fake n8n caller — no firebase-admin import at all, and no network.
 * This is the whole point of retryFeedback.ts pulling the orchestration logic out
 * behind FeedbackRetryAdapter/N8nFeedbackCaller (see that file's comments): the
 * Admin SDK's transaction/get/update surface is mocked here at the boundary this
 * project's own code defines, not by trying to fake firebase-admin's real API.
 *
 * Ticket F3 extends this same fake with the idempotency guard (attemptId) and the
 * maintainer-notification hook (MaintainerNotifier) — same mocking style as before,
 * just a wider FeedbackRetryAdapter surface (see FakeAdapter below).
 */
import {
  isEligibleForRetry,
  MAX_RETRY_COUNT,
  retryEligibleFeedbacks,
  type FeedbackRetryAdapter,
  type MaintainerNotifier,
  type NeedsAttentionItem
} from '../../src/lib/retryFeedback'
import type { FeedbackRecord } from '../../src/types'

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
  attemptId: null,
  ...overrides
})

// A minimal in-memory fake standing in for the real Admin SDK adapter built in
// retry-feedback.tsx — claimForProcessing mirrors the real transaction's semantics
// (re-checks eligibility, refuses a record another "caller" already claimed, refuses a
// record still marked in-flight from a previous attempt) closely enough to cover this
// module's actual logic, without any real Firebase involved.
class FakeAdapter implements FeedbackRetryAdapter {
  records: Record<string, FeedbackRecord>
  claimedKeys = new Set<string>()
  private attemptCounter = 0

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
    if (record.attemptId != null) return null
    this.claimedKeys.add(key)
    const claimed: FeedbackRecord = { ...record, status: 'processing', attemptId: `fake-attempt-${++this.attemptCounter}` }
    this.records[key] = claimed
    return claimed
  }

  async markTicketCreated(key: string, ticket: FeedbackRecord['ticket']) {
    this.records[key] = { ...this.records[key], status: 'ticket_created', error: null, ticket, attemptId: null }
  }

  async markError(key: string, error: { message: string; detail?: string }, retryCount: number) {
    this.records[key] = { ...this.records[key], status: 'error', error, retryCount, attemptId: null }
  }

  async markNeedsAttention(key: string, reason: string, retryCount?: number) {
    this.records[key] = {
      ...this.records[key],
      status: 'needs_attention',
      error: { message: reason },
      attemptId: null,
      ...(retryCount !== undefined ? { retryCount } : {})
    }
  }
}

// Most tests don't care about notification at all — a resolved no-op stand-in keeps
// those call sites unchanged in spirit, matching this project's existing convention of
// a plain jest.fn() for the parts of a signature a given test isn't exercising.
const makeNoopNotify = (): MaintainerNotifier => jest.fn().mockResolvedValue({ ok: true })

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

  it('is not eligible once flagged for manual attention', () => {
    expect(isEligibleForRetry({ status: 'needs_attention', retryCount: 0 })).toBe(false)
  })
})

describe('retryEligibleFeedbacks', () => {
  it('picks up eligible new/error records and skips processing/ticket_created ones', async () => {
    const adapter = new FakeAdapter({
      eligibleNew: makeRecord({ status: 'new' }),
      eligibleError: makeRecord({ status: 'error', retryCount: 2 }),
      alreadyProcessing: makeRecord({ status: 'processing', attemptId: null }),
      alreadyDone: makeRecord({ status: 'ticket_created', ticket: { id: '1', url: 'https://trello.com/c/1', title: 'x' } })
    })
    const callN8n = jest.fn().mockResolvedValue({ ok: true, ticket: { id: 'c1', url: 'https://trello.com/c/c1', title: 't' } })

    const result = await retryEligibleFeedbacks(adapter, callN8n, makeNoopNotify())

    expect(callN8n).toHaveBeenCalledTimes(2)
    expect(result.processed).toBe(2)
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.needsAttention).toBe(0)
    expect(result.notified).toBe(false)
    expect(adapter.records.alreadyProcessing.status).toBe('processing')
    expect(adapter.records.alreadyDone.status).toBe('ticket_created')
  })

  it('skips records at or over the max retry count entirely — never calls n8n for them', async () => {
    const adapter = new FakeAdapter({
      atMax: makeRecord({ status: 'error', retryCount: MAX_RETRY_COUNT }),
      overMax: makeRecord({ status: 'error', retryCount: MAX_RETRY_COUNT + 3 })
    })
    const callN8n = jest.fn()

    const result = await retryEligibleFeedbacks(adapter, callN8n, makeNoopNotify())

    expect(callN8n).not.toHaveBeenCalled()
    expect(result.processed).toBe(0)
    expect(result.succeeded).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(0) // never even attempted a claim — filtered out up front
    expect(result.needsAttention).toBe(0) // already 'error' from a prior run, not newly exhausted this run
  })

  it('updates a successfully-retried record to ticket_created with the derived ticket, clearing error and attemptId', async () => {
    const adapter = new FakeAdapter({
      key1: makeRecord({ status: 'error', retryCount: 1, error: { message: 'previous failure' } })
    })
    const ticket = { id: 'card-1', url: 'https://trello.com/c/card-1', title: 'Add dark mode' }
    const callN8n = jest.fn().mockResolvedValue({ ok: true, ticket })

    const result = await retryEligibleFeedbacks(adapter, callN8n, makeNoopNotify())

    expect(result.succeeded).toBe(1)
    expect(adapter.records.key1.status).toBe('ticket_created')
    expect(adapter.records.key1.error).toBeNull()
    expect(adapter.records.key1.ticket).toEqual(ticket)
    // The idempotency guard's marker must be cleared once the outcome is durably
    // recorded — a lingering attemptId here would make a future run wrongly treat this
    // finished record as ambiguous.
    expect(adapter.records.key1.attemptId).toBeNull()
  })

  it('increments retryCount, records the error, and clears attemptId when n8n reports a non-exhausting failure', async () => {
    const adapter = new FakeAdapter({
      key1: makeRecord({ status: 'error', retryCount: 2, error: { message: 'previous failure' } })
    })
    const callN8n = jest.fn().mockResolvedValue({ ok: false, message: 'quota_exceeded', detail: '429' })

    const result = await retryEligibleFeedbacks(adapter, callN8n, makeNoopNotify())

    expect(result.failed).toBe(1)
    expect(result.needsAttention).toBe(0)
    expect(adapter.records.key1.status).toBe('error')
    expect(adapter.records.key1.retryCount).toBe(3)
    expect(adapter.records.key1.error).toEqual({ message: 'quota_exceeded', detail: '429' })
    // A plain failure (not yet exhausted) IS durably recorded via markError — the guard
    // has nothing left to protect, so it's cleared same as the success path.
    expect(adapter.records.key1.attemptId).toBeNull()
  })

  it('increments retryCount and records the error when the n8n call throws', async () => {
    const adapter = new FakeAdapter({
      key1: makeRecord({ status: 'new', retryCount: 0 })
    })
    const callN8n = jest.fn().mockRejectedValue(new Error('network down'))

    const result = await retryEligibleFeedbacks(adapter, callN8n, makeNoopNotify())

    expect(result.failed).toBe(1)
    expect(adapter.records.key1.status).toBe('error')
    expect(adapter.records.key1.retryCount).toBe(1)
    expect(adapter.records.key1.error).toEqual({ message: 'network down' })
    expect(adapter.records.key1.attemptId).toBeNull()
  })

  it('counts a lost claim race as skipped, not failed, and never calls n8n for it', async () => {
    const adapter = new FakeAdapter({ key1: makeRecord({ status: 'new' }) })
    adapter.claimedKeys.add('key1') // simulate another run having already claimed it
    const callN8n = jest.fn()

    const result = await retryEligibleFeedbacks(adapter, callN8n, makeNoopNotify())

    expect(callN8n).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
    expect(result.processed).toBe(0)
  })

  // --- Ticket F3: idempotency guard (Part 1) ---

  it('does not retry a record with a stale (already non-null) attemptId — routes it to needs_attention instead', async () => {
    const adapter = new FakeAdapter({
      stuck: makeRecord({ status: 'processing', attemptId: 'leftover-from-a-crashed-run', retryCount: 1 })
    })
    const callN8n = jest.fn()
    const notify: MaintainerNotifier = jest.fn().mockResolvedValue({ ok: true })

    const result = await retryEligibleFeedbacks(adapter, callN8n, notify)

    // The whole point: never call n8n for it — a previous attempt may have already
    // succeeded (a real Trello card may already exist), so auto-retrying risks a
    // duplicate.
    expect(callN8n).not.toHaveBeenCalled()
    expect(result.processed).toBe(0)
    expect(result.needsAttention).toBe(1)
    expect(adapter.records.stuck.status).toBe('needs_attention')
    expect(adapter.records.stuck.attemptId).toBeNull()
    expect(notify).toHaveBeenCalledTimes(1)
    const items = (notify as jest.Mock).mock.calls[0][0] as NeedsAttentionItem[]
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('stuck')
    expect(items[0].reason).toMatch(/never durably recorded/i)
  })

  it('clears attemptId once a record exhausts its retries, and reports it via needsAttention', async () => {
    const adapter = new FakeAdapter({
      key1: makeRecord({ status: 'error', retryCount: MAX_RETRY_COUNT - 1 })
    })
    const callN8n = jest.fn().mockResolvedValue({ ok: false, message: 'gemini_failed' })
    const notify: MaintainerNotifier = jest.fn().mockResolvedValue({ ok: true })

    const result = await retryEligibleFeedbacks(adapter, callN8n, notify)

    expect(result.failed).toBe(1)
    expect(result.needsAttention).toBe(1)
    expect(adapter.records.key1.status).toBe('needs_attention')
    expect(adapter.records.key1.retryCount).toBe(MAX_RETRY_COUNT)
    expect(adapter.records.key1.attemptId).toBeNull()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  // --- Ticket F3: maintainer notification (Part 2) ---

  it('calls notifyMaintainers exactly once when something needs attention', async () => {
    const adapter = new FakeAdapter({
      stuck: makeRecord({ status: 'processing', attemptId: 'leftover', retryCount: 0 }),
      alsoExhausting: makeRecord({ status: 'error', retryCount: MAX_RETRY_COUNT - 1 })
    })
    const callN8n = jest.fn().mockResolvedValue({ ok: false, message: 'boom' })
    const notify: MaintainerNotifier = jest.fn().mockResolvedValue({ ok: true })

    const result = await retryEligibleFeedbacks(adapter, callN8n, notify)

    expect(notify).toHaveBeenCalledTimes(1)
    const items = (notify as jest.Mock).mock.calls[0][0] as NeedsAttentionItem[]
    expect(items.map((i) => i.key).sort()).toEqual(['alsoExhausting', 'stuck'])
    expect(result.needsAttention).toBe(2)
    expect(result.notified).toBe(true)
  })

  it('does not call notifyMaintainers when nothing needs attention', async () => {
    const adapter = new FakeAdapter({
      key1: makeRecord({ status: 'new' })
    })
    const callN8n = jest.fn().mockResolvedValue({ ok: true, ticket: { id: '1', url: 'https://trello.com/c/1', title: 't' } })
    const notify: MaintainerNotifier = jest.fn().mockResolvedValue({ ok: true })

    const result = await retryEligibleFeedbacks(adapter, callN8n, notify)

    expect(notify).not.toHaveBeenCalled()
    expect(result.needsAttention).toBe(0)
    expect(result.notified).toBe(false)
  })

  it('reflects a failed notification attempt in the result rather than throwing', async () => {
    const adapter = new FakeAdapter({
      stuck: makeRecord({ status: 'processing', attemptId: 'leftover', retryCount: 0 })
    })
    const callN8n = jest.fn()
    const notify: MaintainerNotifier = jest.fn().mockResolvedValue({ ok: false, message: 'trello down' })

    const result = await retryEligibleFeedbacks(adapter, callN8n, notify)

    expect(result.needsAttention).toBe(1)
    expect(result.notified).toBe(false)
  })
})
