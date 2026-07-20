import type { FeedbackRecord } from '../types'

// Ticket F2's chosen max retry attempts, from the brainstorm this ticket came out of.
export const MAX_RETRY_COUNT = 5

// Statuses eligible for a retry attempt — anything still 'new' (the record was created
// but never got a first attempt, e.g. the tab closed before submitFeedback's own
// updateFeedbackRecord(processing) call landed) or 'error' (a previous attempt, live or
// retried, failed outright). 'processing'/'ticket_created' records are never touched by
// this job — 'processing' specifically is deliberately left alone rather than treated as
// "stuck": distinguishing "still genuinely in flight" from "actually abandoned mid-flight"
// would need its own staleness heuristic, which is exactly the "attempt in flight" marker
// scoped out to F3 (see the ticket's Non-Goals) — this pass only retries records that are
// unambiguously not currently being handled by anyone.
const ELIGIBLE_STATUSES: FeedbackRecord['status'][] = ['new', 'error']

export const isEligibleForRetry = (record: Pick<FeedbackRecord, 'status' | 'retryCount'>): boolean =>
  ELIGIBLE_STATUSES.includes(record.status) && record.retryCount < MAX_RETRY_COUNT

// Abstraction over the actual Firebase Admin SDK calls this job needs — lets the
// orchestration logic below (retryEligibleFeedbacks) be unit-tested with a simple
// in-memory fake instead of mocking firebase-admin's whole API surface. Matches this
// project's existing precedent of pulling the interesting logic out into something
// directly testable (e.g. verifyAuthToken.ts exporting verifyIdTokenClaims separately,
// normalizeName.ts extracted out of firebase.ts/receipts.tsx).
export interface FeedbackRetryAdapter {
  // Reads every record currently under /feedbacks. Deliberately one flat read, with
  // filtering done in-process below — this app's feedback volume is household-scale,
  // not enterprise-scale, matching this project's general "don't over-engineer for
  // scale it doesn't have" ethos (see e.g. receipts' client-side price-history map).
  getAllFeedbacks(): Promise<Record<string, FeedbackRecord>>
  // Atomically flips one record from an eligible status to 'processing' using a real
  // Admin SDK transaction — this is the actual point of using Admin SDK here instead of
  // a best-effort conditional client-SDK write: two overlapping cron runs, or a cron run
  // overlapping a live user submission, can't both win the same record. Returns the
  // claimed record (post-transaction) if this call won the race, or null if another
  // caller already claimed it first or it's no longer eligible by the time the
  // transaction actually runs (e.g. its retryCount changed underneath it).
  claimForProcessing(key: string): Promise<FeedbackRecord | null>
  markTicketCreated(key: string, ticket: FeedbackRecord['ticket']): Promise<void>
  // retryCount is passed in already-incremented (the caller below owns that
  // arithmetic) rather than the adapter re-reading/incrementing it itself, since the
  // adapter has no other reason to re-fetch the record between claim and this call.
  markError(key: string, error: { message: string; detail?: string }, retryCount: number): Promise<void>
}

// The actual n8n call is injected too (rather than retryEligibleFeedbacks importing
// `fetch` + the webhook URL directly) for the same reason as the adapter above — tests
// exercise the retry/claim/status-transition logic without needing a real or mocked
// network layer.
export type N8nFeedbackCaller = (
  record: FeedbackRecord
) => Promise<{ ok: true; ticket: FeedbackRecord['ticket'] } | { ok: false; message: string; detail?: string }>

export interface RetryFeedbacksResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number
}

// Orchestrates one full run of the daily safety net: find everything eligible, claim
// each one exclusively, replay it through n8n, and record the outcome. Note this reads
// records once at the top (getAllFeedbacks) and then re-checks eligibility per-record
// via the transaction inside claimForProcessing — a record can legitimately fail the
// claim (return null) even though it looked eligible in the initial read, if something
// else claimed it in between; that's not a bug, it's exactly what the transaction is
// for, and shows up as `skipped` in the result rather than `failed`.
//
// TODO(F3): a separate, later ticket adds an idempotency "attempt in flight" marker and
// a permanently-failed-record human-notification path once retryCount hits
// MAX_RETRY_COUNT. Deliberately not built here (see F2's ticket Non-Goals) — this pass's
// only guard against double-processing is claimForProcessing's transaction, and a record
// that exhausts its retries just sits in 'error' with retryCount === MAX_RETRY_COUNT,
// silently excluded from future runs by isEligibleForRetry, with no notification.
export async function retryEligibleFeedbacks(
  adapter: FeedbackRetryAdapter,
  callN8n: N8nFeedbackCaller
): Promise<RetryFeedbacksResult> {
  const all = await adapter.getAllFeedbacks()
  const candidateKeys = Object.entries(all)
    .filter(([, record]) => isEligibleForRetry(record))
    .map(([key]) => key)

  const result: RetryFeedbacksResult = { processed: 0, succeeded: 0, failed: 0, skipped: 0 }

  for (const key of candidateKeys) {
    const claimed = await adapter.claimForProcessing(key)
    if (!claimed) {
      result.skipped++
      continue
    }

    result.processed++
    try {
      const outcome = await callN8n(claimed)
      if (outcome.ok) {
        await adapter.markTicketCreated(key, outcome.ticket)
        result.succeeded++
      } else {
        await adapter.markError(key, { message: outcome.message, detail: outcome.detail }, claimed.retryCount + 1)
        result.failed++
      }
    } catch (err: any) {
      await adapter.markError(key, { message: err?.message || 'retry failed' }, claimed.retryCount + 1)
      result.failed++
    }
  }

  return result
}
