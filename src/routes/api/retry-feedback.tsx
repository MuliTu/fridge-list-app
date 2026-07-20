import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { deriveTicketFromN8nResponse } from '../../lib/deriveTicket'
import { FirebaseAdminNotConfiguredError, getAdminDatabase, isFirebaseAdminConfigured } from '../../lib/firebaseAdmin'
import { logger } from '../../lib/logger'
import {
  MAX_RETRY_COUNT,
  retryEligibleFeedbacks,
  type FeedbackRetryAdapter,
  type MaintainerNotifier,
  type N8nFeedbackCaller
} from '../../lib/retryFeedback'
import type { FeedbackRecord } from '../../types'

// Ticket F2 — the daily safety net over the existing submit → n8n → Gemini → Trello
// feedback flow (see CLAUDE.md's In-app feedback module, and FeedbackRecord in
// src/types.ts from ticket F1). Vercel Cron (see vercel.json's "crons" entry) hits this
// path once a day at 04:00 UTC — Vercel's Hobby plan caps cron jobs at once per day,
// and cron schedules always run in UTC (no per-project timezone setting), so "4am" here
// means 04:00 UTC, not local time. It finds every /feedbacks record still stuck in
// 'new' or 'error' with retryCount < 5 and replays it through n8n. Orchestration and
// scheduling live here, in this app's own backend — not inside n8n — deliberately, so
// an ngrok/n8n outage only ever means "today's retry attempt failed, try again
// tomorrow" rather than "the whole retry system is down" (see the ticket brainstorm
// this came out of; ngrok instability is an already-documented known gap, CLAUDE.md's
// Known gaps #2).
//
// Ticket F3 adds the idempotency guard (attemptId, stamped/cleared in buildAdapter
// below) and the maintainer-notification hook (notifyMaintainers below) — see
// src/lib/retryFeedback.ts's top-of-file comment for the full design.
//
// Same n8n webhook URL submit-feedback.tsx already uses, reused for consistency — held
// server-side only here too, never shipped to a browser.
const FEEDBACK_WEBHOOK_URL = 'https://whiny-idealist-unseen.ngrok-free.dev/webhook/feedback'

// Wires the Admin SDK's real (non-modular, namespaced) Realtime Database API into the
// FeedbackRetryAdapter shape retryEligibleFeedbacks expects — kept as a thin adapter so
// the actual retry/claim logic in src/lib/retryFeedback.ts stays fully unit-testable
// with a fake, without needing to mock firebase-admin's whole API surface (see that
// file's tests).
function buildAdapter(): FeedbackRetryAdapter {
  const feedbacksRef = getAdminDatabase().ref('feedbacks')

  return {
    async getAllFeedbacks() {
      const snapshot = await feedbacksRef.get()
      return (snapshot.val() as Record<string, FeedbackRecord>) || {}
    },

    async claimForProcessing(key) {
      const nodeRef = feedbacksRef.child(key)
      const result = await nodeRef.transaction((current: FeedbackRecord | null) => {
        // Returning `undefined` aborts the transaction without modifying the data —
        // used for every "not eligible / already taken" case below, rather than
        // returning `current` unchanged (which would re-write it as-is but still
        // count as a committed transaction, muddying what "committed" actually means
        // for the caller).
        if (!current) return undefined
        if (current.status !== 'new' && current.status !== 'error') return undefined
        if (current.retryCount >= MAX_RETRY_COUNT) return undefined
        // Ticket F3: refuse to claim a record that's already mid-attempt from another
        // run's perspective (should be unreachable in practice, since a non-null
        // attemptId only ever sits on a 'processing' record — which already fails the
        // status check above — but kept as a defense-in-depth check inside the actual
        // atomicity boundary, not just in retryFeedback.ts's own pre-filtering).
        if (current.attemptId != null) return undefined
        const now = new Date().toISOString()
        // Stamped in the SAME atomic write as the status flip — see this field's
        // comment on FeedbackRetryAdapter.claimForProcessing in retryFeedback.ts for why
        // that matters (no window between "claimed" and "marked in-flight").
        return { ...current, status: 'processing', attemptId: randomUUID(), lastAttemptAt: now, updatedAt: now }
      })
      if (!result.committed || !result.snapshot.exists()) return null
      return result.snapshot.val() as FeedbackRecord
    },

    async markTicketCreated(key, ticket) {
      await feedbacksRef.child(key).update({
        status: 'ticket_created',
        error: null,
        ticket,
        attemptId: null,
        updatedAt: new Date().toISOString()
      })
    },

    async markError(key, error, retryCount) {
      await feedbacksRef.child(key).update({
        status: 'error',
        error,
        retryCount,
        attemptId: null,
        updatedAt: new Date().toISOString()
      })
    },

    async markNeedsAttention(key, reason, retryCount) {
      await feedbacksRef.child(key).update({
        status: 'needs_attention',
        error: { message: reason },
        attemptId: null,
        updatedAt: new Date().toISOString(),
        // Only present for the "just exhausted its retries" case — see this method's
        // doc comment on FeedbackRetryAdapter in retryFeedback.ts. Spreading in an
        // empty object when retryCount is undefined keeps this a single Admin SDK
        // update() call either way.
        ...(retryCount !== undefined ? { retryCount } : {})
      })
    }
  }
}

// Same request shape submitFeedback() builds in src/lib/firebase.ts, populated from the
// stored record instead of a live browser session — n8n/Gemini has no way to tell (and
// doesn't need to) whether a given call is the original attempt or a retry.
const callN8n: N8nFeedbackCaller = async (record) => {
  try {
    const response = await fetch(FEEDBACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: record.message,
        name: record.username,
        email: record.userId === 'anonymous' ? null : record.userId,
        submittedAt: record.createdAt,
        language: 'he',
        source: 'fridge-list-app-retry-job',
        route: null
      })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) {
      return { ok: false, message: data.message || 'feedback upstream failed' }
    }
    return { ok: true, ticket: deriveTicketFromN8nResponse(data, record.message) }
  } catch (err: any) {
    return { ok: false, message: err?.message || 'network error' }
  }
}

// Ticket F3's notification mechanism: reuse the exact same "Feedback → Trello
// (Hebrew/English)" n8n workflow (see CLAUDE.md's In-app feedback module — webhook
// path `feedback`, same FEEDBACK_WEBHOOK_URL as callN8n above) that real user feedback
// already goes through, rather than adding a brand-new Trello credential/API call to
// this codebase. This was the deliberate choice among the options the ticket left open
// (a fresh Trello call, an email via the existing SMTP setup, or a new admin view) —
// reasoning:
//   - Zero new credentials: the app has no Trello API key/token anywhere (Trello card
//     creation has only ever lived inside n8n's workflow, per CLAUDE.md), so a "call
//     Trello directly" implementation would need a brand-new credential provisioned
//     and stored server-side, another manual step in the same category as
//     GITHUB_RELEASES_TOKEN/CRON_SECRET (Known gaps #9) before it could ever run for
//     real. Piggy-backing on the feedback webhook needs nothing new.
//   - Same list, no extra wiring: the workflow already files every card into the
//     Customer Response list on the Fridge app board (ids in CLAUDE.md), which is
//     exactly where this ticket asks the summary to land.
//   - Graceful degradation even if Gemini misreads the summary text: "Build Card"'s
//     existing fallback still creates a raw-request card (labelled
//     `needs-clarification`) if Gemini's structuring step fails or returns junk — so
//     even in the worst case, a human still sees *something* land in Trello, just
//     possibly less well-titled. That matches this app's house style (see
//     senior-backend skill's "graceful degradation" note) better than a bespoke
//     Trello/email call that could itself fail with no fallback.
// Trade-off accepted: the workflow's Gemini step will try to structure this summary as
// if it were a feature request, since that's what the prompt was written for — it may
// title/tag the card oddly. That's a cosmetic risk, not a functional one (the card
// still gets created, still contains every detail below), and was judged acceptable
// against the cost of hardening a second, purpose-built n8n workflow or wiring a new
// credential just for this.
const notifyMaintainers: MaintainerNotifier = async (items) => {
  const lines = items.map(({ key, record, reason }) => {
    const lastError = record.error ? ` | last error: ${record.error.message}` : ''
    return `- [${key}] "${record.message}" — submitted by ${record.username} (${record.userId}), retryCount=${record.retryCount}, reason: ${reason}${lastError}`
  })
  const message =
    `Automated notice from the hourly feedback retry job: ${items.length} feedback ` +
    `record(s) need manual attention and will NOT be retried automatically. For each, ` +
    `check /feedbacks/<key> in Firebase and Trello for a possible duplicate/orphan ` +
    `card before taking any action.\n\n${lines.join('\n')}`

  try {
    const response = await fetch(FEEDBACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: message,
        name: 'Feedback Retry Job',
        email: null,
        submittedAt: new Date().toISOString(),
        language: 'en',
        source: 'fridge-list-app-retry-job-notification',
        route: null
      })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) {
      return { ok: false, message: data.message || 'maintainer notification upstream failed' }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, message: err?.message || 'network error' }
  }
}

export const Route = createFileRoute('/api/retry-feedback')({
  server: {
    handlers: {
      // Vercel Cron invokes a scheduled path with an HTTP GET request. When a
      // `CRON_SECRET` project env var is set, Vercel automatically attaches it as
      // `Authorization: Bearer <CRON_SECRET>` on that request — see
      // https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs. Without
      // verifying that header, anyone on the internet who found this path could trigger
      // repeated Trello-card-creation attempts and burn the shared Gemini free-tier
      // quota — same class of gap as security-2/security-3 (already closed on the other
      // n8n-proxy routes via verifyAuthToken), just using Vercel's own cron-auth
      // mechanism here since a scheduled cron invocation has no Firebase session/ID
      // token to send.
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET
        if (!cronSecret) {
          logger.error('[retry-feedback] CRON_SECRET is not configured — refusing to run')
          return Response.json({ error: true, message: 'not_configured' }, { status: 500 })
        }
        const authHeader = request.headers.get('authorization')
        if (authHeader !== `Bearer ${cronSecret}`) {
          logger.warn('[retry-feedback] request rejected: missing or invalid CRON_SECRET bearer token')
          return Response.json({ error: true, message: 'unauthorized' }, { status: 401 })
        }

        if (!isFirebaseAdminConfigured()) {
          // Fails soft, same "not yet provisioned" pattern as GITHUB_RELEASES_TOKEN
          // (releases.tsx, CLAUDE.md Known gaps #9) — this credential is a manual step
          // outside this codebase (see src/lib/firebaseAdmin.ts).
          logger.error('[retry-feedback] FIREBASE_SERVICE_ACCOUNT_KEY is not configured — cannot run retry job')
          return Response.json({ error: true, message: 'not_configured' }, { status: 503 })
        }

        try {
          const adapter = buildAdapter()
          const result = await retryEligibleFeedbacks(adapter, callN8n, notifyMaintainers)
          logger.success(
            `[retry-feedback] run complete: processed=${result.processed} succeeded=${result.succeeded} ` +
              `failed=${result.failed} skipped=${result.skipped} needsAttention=${result.needsAttention} ` +
              `notified=${result.notified}`
          )
          if (result.needsAttention > 0 && !result.notified) {
            logger.warn(
              `[retry-feedback] ${result.needsAttention} record(s) need attention but the maintainer ` +
                'notification itself failed to send — check /feedbacks for status=needs_attention records directly'
            )
          }
          return Response.json(result)
        } catch (err: any) {
          if (err instanceof FirebaseAdminNotConfiguredError) {
            logger.error('[retry-feedback] Firebase Admin SDK not configured — cannot run retry job')
            return Response.json({ error: true, message: 'not_configured' }, { status: 503 })
          }
          logger.error(`[retry-feedback] run failed: ${err.message}`)
          return Response.json({ error: true, message: 'retry_job_failed' }, { status: 500 })
        }
      }
    }
  }
})
