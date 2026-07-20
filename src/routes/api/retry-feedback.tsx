import { createFileRoute } from '@tanstack/react-router'
import { deriveTicketFromN8nResponse } from '../../lib/deriveTicket'
import { FirebaseAdminNotConfiguredError, getAdminDatabase, isFirebaseAdminConfigured } from '../../lib/firebaseAdmin'
import { logger } from '../../lib/logger'
import { MAX_RETRY_COUNT, retryEligibleFeedbacks, type FeedbackRetryAdapter, type N8nFeedbackCaller } from '../../lib/retryFeedback'
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
        const now = new Date().toISOString()
        return { ...current, status: 'processing', lastAttemptAt: now, updatedAt: now }
      })
      if (!result.committed || !result.snapshot.exists()) return null
      return result.snapshot.val() as FeedbackRecord
    },

    async markTicketCreated(key, ticket) {
      await feedbacksRef.child(key).update({
        status: 'ticket_created',
        error: null,
        ticket,
        updatedAt: new Date().toISOString()
      })
    },

    async markError(key, error, retryCount) {
      await feedbacksRef.child(key).update({
        status: 'error',
        error,
        retryCount,
        updatedAt: new Date().toISOString()
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
          const result = await retryEligibleFeedbacks(adapter, callN8n)
          logger.success(
            `[retry-feedback] run complete: processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed} skipped=${result.skipped}`
          )
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
