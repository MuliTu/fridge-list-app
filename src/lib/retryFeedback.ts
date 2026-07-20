import type { FeedbackRecord } from '../types'

// Ticket F2's chosen max retry attempts, from the brainstorm this ticket came out of.
export const MAX_RETRY_COUNT = 5

// Statuses eligible for a retry attempt — anything still 'new' (the record was created
// but never got a first attempt, e.g. the tab closed before submitFeedback's own
// updateFeedbackRecord(processing) call landed) or 'error' (a previous attempt, live or
// retried, failed outright). 'processing'/'ticket_created'/'needs_attention' records are
// never touched by this job. 'needs_attention' (ticket F3) is a deliberate terminal
// state — see FeedbackRecord in types.ts — a record only reaches it once, and never
// re-enters the retry pool afterwards.
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
  // Atomically flips one record from an eligible status to 'processing' AND stamps a
  // fresh `attemptId` on it (ticket F3's idempotency guard — see FeedbackRecord in
  // types.ts), using a real Admin SDK transaction — this is the actual point of using
  // Admin SDK here instead of a best-effort conditional client-SDK write: two
  // overlapping cron runs, or a cron run overlapping a live user submission, can't both
  // win the same record. Doing the status flip and the attemptId stamp in the same
  // atomic write (rather than two separate calls) means there's no window where a
  // record is claimed but not yet stamped — the only ambiguous state a later run can
  // ever observe is "claimed, stamped, outcome not yet durably written," which is
  // exactly the race this ticket's guard is meant to catch. Returns the claimed record
  // (post-transaction, attemptId included) if this call won the race, or null if
  // another caller already claimed it first or it's no longer eligible by the time the
  // transaction actually runs (e.g. its retryCount changed underneath it).
  claimForProcessing(key: string): Promise<FeedbackRecord | null>
  // Always clears attemptId back to null as part of this write — this IS the "outcome
  // durably recorded" moment the idempotency guard is waiting for.
  markTicketCreated(key: string, ticket: FeedbackRecord['ticket']): Promise<void>
  // retryCount is passed in already-incremented (the caller below owns that
  // arithmetic) rather than the adapter re-reading/incrementing it itself, since the
  // adapter has no other reason to re-fetch the record between claim and this call.
  // Always clears attemptId back to null as part of this write, same as
  // markTicketCreated — a plain (non-exhausting) failure IS durably recorded here, so
  // there is nothing ambiguous left for a later run to worry about.
  markError(key: string, error: { message: string; detail?: string }, retryCount: number): Promise<void>
  // Ticket F3's terminal state for anything a human needs to look at directly: either
  // retryCount just reached MAX_RETRY_COUNT, or a previous attempt's outcome was found
  // to be genuinely unknown (stale, non-null attemptId on read — see
  // retryEligibleFeedbacks below). Always clears attemptId back to null, same reason as
  // the other two terminal writes — whatever ambiguity existed is resolved the moment
  // this write lands (resolved as "a human now owns this," not as "succeeded" or
  // "failed cleanly," but resolved all the same). `retryCount` is optional and only
  // passed for the "just exhausted its retries" case (same already-incremented-by-the-
  // caller convention as markError above) — the stale-attemptId case has no new
  // retryCount to record, so it's omitted there and the adapter leaves the field
  // untouched.
  markNeedsAttention(key: string, reason: string, retryCount?: number): Promise<void>
}

// The actual n8n call is injected too (rather than retryEligibleFeedbacks importing
// `fetch` + the webhook URL directly) for the same reason as the adapter above — tests
// exercise the retry/claim/status-transition logic without needing a real or mocked
// network layer.
export type N8nFeedbackCaller = (
  record: FeedbackRecord
) => Promise<{ ok: true; ticket: FeedbackRecord['ticket'] } | { ok: false; message: string; detail?: string }>

// One record this run decided a human needs to see — either because it just exhausted
// its retries, or because a previous run left it in a genuinely ambiguous state (see
// the "stale attemptId" handling in retryEligibleFeedbacks below). `record` is a
// best-effort snapshot for the notifier to describe (message/user/error history) — it
// reflects the state right before/at the terminal write, not necessarily a fresh read
// after it.
export interface NeedsAttentionItem {
  key: string
  record: FeedbackRecord
  reason: string
}

// Ticket F3's human-notification hook. Injected the same way callN8n is (see above) so
// this stays unit-testable with a plain fake instead of a real Trello/email call.
// Called at most once per run, and only when needsAttentionItems is non-empty — see
// this file's "don't create a card every single hour if nothing's wrong" requirement.
export type MaintainerNotifier = (
  items: NeedsAttentionItem[]
) => Promise<{ ok: boolean; message?: string }>

export interface RetryFeedbacksResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number
  // Count of records that transitioned to 'needs_attention' during this run (stale
  // attemptId + newly-exhausted retries combined). Records already sitting in
  // 'needs_attention' from an earlier run are NOT recounted here — see the "reported
  // once" note on FeedbackRecord['status'] in types.ts.
  needsAttention: number
  // Whether notifyMaintainers was called AND reported success this run. false both when
  // there was nothing to report (the common case) and when the notification attempt
  // itself failed — callers that care which of those it was should inspect
  // needsAttention alongside this field.
  notified: boolean
}

// Orchestrates one full run of the hourly safety net: find everything eligible, claim
// each one exclusively, replay it through n8n, and record the outcome. Note this reads
// records once at the top (getAllFeedbacks) and then re-checks eligibility per-record
// via the transaction inside claimForProcessing — a record can legitimately fail the
// claim (return null) even though it looked eligible in the initial read, if something
// else claimed it in between; that's not a bug, it's exactly what the transaction is
// for, and shows up as `skipped` in the result rather than `failed`.
//
// Ticket F3 closes the two gaps F2 deliberately left open (see that ticket's
// Non-Goals):
//
// Part 1 — idempotency guard. claimForProcessing now stamps a fresh, non-null
// `attemptId` on a record at the same moment it claims it (see that method's own
// comment above). Every terminal write (markTicketCreated / markError /
// markNeedsAttention) clears it back to null. So: a non-null attemptId found on this
// run's initial read means a *previous* run claimed that record, but the process died
// before any terminal write landed — the n8n/Trello call may have already succeeded
// (a real card may already exist) or may not have run at all; there is no way to tell
// from here. Retrying it automatically risks a duplicate Trello card, so instead this
// function routes it straight to 'needs_attention' (Part 2) without ever calling
// claimForProcessing or callN8n for it — a human can check Trello directly before
// deciding whether to retry manually.
//
// Part 2 — permanently-failed / ambiguous records need a human. Both the stale-
// attemptId records above and any record whose retryCount reaches MAX_RETRY_COUNT
// during this run's own processing are collected into `needsAttentionItems` and, if
// that list is non-empty, handed once to the injected `notifyMaintainers` — seeded from
// this ticket's brainstorm, that's a synthetic call into the same "Feedback → Trello"
// n8n workflow already used for real feedback (see retry-feedback.tsx's
// `notifyMaintainers` for why: no new Trello credential is needed anywhere in this
// codebase, and the workflow's existing raw-request fallback still produces a visible
// card even if Gemini doesn't structure the summary text cleanly).
export async function retryEligibleFeedbacks(
  adapter: FeedbackRetryAdapter,
  callN8n: N8nFeedbackCaller,
  notifyMaintainers: MaintainerNotifier
): Promise<RetryFeedbacksResult> {
  const all = await adapter.getAllFeedbacks()
  const needsAttentionItems: NeedsAttentionItem[] = []

  // Part 1: find anything left over from a previous run whose outcome is unknown, and
  // pull it out of the pool before computing what's actually eligible for a fresh
  // attempt. Deliberately checked against the raw initial read (not against
  // ELIGIBLE_STATUSES) since a stale attemptId is, by construction, never on a record
  // whose status is 'new'/'error' anyway (claimForProcessing only ever stamps it
  // alongside the flip to 'processing') — this loop is the only place that notices it.
  for (const [key, record] of Object.entries(all)) {
    if (record.attemptId != null) {
      const reason =
        "Previous retry attempt's outcome was never durably recorded (attemptId still set) — " +
        'check Trello for a possible duplicate/orphan card before retrying this record manually.'
      await adapter.markNeedsAttention(key, reason)
      needsAttentionItems.push({ key, record, reason })
    }
  }

  const candidateKeys = Object.entries(all)
    .filter(([, record]) => record.attemptId == null && isEligibleForRetry(record))
    .map(([key]) => key)

  const result: RetryFeedbacksResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    needsAttention: 0,
    notified: false
  }

  // Part 2 (exhausted-retries half): shared by both the "n8n said no" branch and the
  // "callN8n threw" branch below, so the MAX_RETRY_COUNT check only lives in one place.
  const handleFailure = async (key: string, claimed: FeedbackRecord, message: string, detail?: string) => {
    const newRetryCount = claimed.retryCount + 1
    if (newRetryCount >= MAX_RETRY_COUNT) {
      const reason = `Exhausted ${MAX_RETRY_COUNT} retry attempts. Last error: ${message}`
      await adapter.markNeedsAttention(key, reason, newRetryCount)
      needsAttentionItems.push({
        key,
        record: { ...claimed, retryCount: newRetryCount, status: 'needs_attention', error: { message, detail } },
        reason
      })
    } else {
      await adapter.markError(key, { message, detail }, newRetryCount)
    }
    result.failed++
  }

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
        await handleFailure(key, claimed, outcome.message, outcome.detail)
      }
    } catch (err: any) {
      await handleFailure(key, claimed, err?.message || 'retry failed')
    }
  }

  result.needsAttention = needsAttentionItems.length
  if (needsAttentionItems.length > 0) {
    const notifyOutcome = await notifyMaintainers(needsAttentionItems)
    result.notified = notifyOutcome.ok
  }

  return result
}
