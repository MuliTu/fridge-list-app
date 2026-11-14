import { withDeadline } from '../lib/withDeadline'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getBackgroundAiReviewAvailability, requestBackgroundAiReview } from '../client/api/backgroundAiReview'
import { BACKGROUND_REVIEW_ITEM_LIMIT, backgroundReviewItems, type AiListReviewResult, type BackgroundReviewItem } from '../modules/ai'
import type { GroceryItem } from '../types'

const debounceMs = 2_500
const maximumRetrySeconds = 75

export type BackgroundReview = {
  scope: string
  snapshot: string
  items: BackgroundReviewItem[]
  result: AiListReviewResult
}

type SnapshotOutcome = { snapshot: string; kind: 'ineligible' | 'failed' | 'completed'; review?: BackgroundReview }
type ActiveRun = { scope: string; snapshot: string; controller: AbortController; waiting?: boolean }

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  if (signal.aborted) return resolve()
  const finish = () => {
    clearTimeout(timer)
    signal.removeEventListener('abort', finish)
    resolve()
  }
  const timer = setTimeout(finish, ms)
  signal.addEventListener('abort', finish, { once: true })
})

export function useBackgroundAiReview({
  actor, listId, entries, ready, language
}: {
  actor: string | null
  listId: string | null
  entries: GroceryItem[]
  ready: boolean
  language: 'en' | 'he'
}) {
  const scope = actor && listId ? JSON.stringify([actor, listId]) : null
  const [capability, setCapability] = useState<{ scope: string; synthetic: boolean } | null>(null)
  const [consentingActor, setConsentingActor] = useState<string | null>(null)
  const eligible = capability?.scope === scope && capability !== null
  const enabled = eligible && (capability.synthetic || consentingActor === actor)
  const [running, setRunning] = useState<ActiveRun | null>(null)
  const [outcomes, setOutcomes] = useState<Record<string, SnapshotOutcome>>({})
  const inFlight = useRef<ActiveRun | null>(null)
  const items = useMemo(() => backgroundReviewItems(entries), [entries])
  const withinLimit = items.length <= BACKGROUND_REVIEW_ITEM_LIMIT
  const snapshot = ready && items.length && withinLimit ? JSON.stringify(items) : null
  const current = useRef({ scope, snapshot, items, language })
  current.current = { scope, snapshot, items, language }

  useEffect(() => {
    setOutcomes({})
    setConsentingActor(null)
  }, [actor])

  useEffect(() => {
    if (!scope || !actor || !listId) return
    const controller = new AbortController()
    void getBackgroundAiReviewAvailability(listId, actor, controller.signal).then((available) => {
      if (!controller.signal.aborted) setCapability(available ? { scope, ...available } : null)
    }).catch(() => undefined)
    return () => {
      controller.abort()
      if (inFlight.current?.scope === scope) inFlight.current.controller.abort()
      setCapability((available) => available?.scope === scope ? null : available)
    }
  }, [scope, actor, listId])

  const outcome = scope ? outcomes[scope] : undefined
  useEffect(() => {
    if (!scope || !actor || !listId || !snapshot || !enabled || running || outcome?.snapshot === snapshot) return
    const timer = setTimeout(() => {
      if (inFlight.current || current.current.scope !== scope || current.current.snapshot !== snapshot) return
      const { items: reviewedItems, language: reviewLanguage } = current.current
      const controller = new AbortController()
      const run: ActiveRun = { scope, snapshot, controller }
      inFlight.current = run
      setRunning(run)
      const stillCurrent = () => !controller.signal.aborted &&
        current.current.scope === scope && current.current.snapshot === snapshot
      const save = (value: SnapshotOutcome) => {
        if (stillCurrent()) setOutcomes((previous) => ({ ...previous, [scope]: value }))
      }
      const analyze = () => withDeadline(
        (signal) => requestBackgroundAiReview(listId, snapshot, reviewLanguage, actor, signal),
        45_000, controller.signal
      )

      void (async () => {
        try {
          let response = await analyze()
          const seconds = response.kind === 'rate_limited' ? response.seconds : null
          if (seconds !== null && seconds > 0 && seconds <= maximumRetrySeconds && stillCurrent()) {
            run.waiting = true
            await wait(seconds * 1000 + 250, controller.signal)
            run.waiting = false
            if (!stillCurrent()) return
            response = await analyze()
          }
          if (response.kind === 'completed') {
            const result = response.result
            save({ snapshot, kind: 'completed',
              ...(result.duplicates.length || result.renames.length ? {
                review: { scope, snapshot, items: reviewedItems, result }
              } : {}) })
          } else if (response.kind === 'disabled') {
            save({ snapshot, kind: 'ineligible' })
          } else if (response.kind === 'ineligible') {
            save({ snapshot, kind: 'ineligible' })
          } else {
            save({ snapshot, kind: 'failed' })
          }
        } catch {
          save({ snapshot, kind: 'failed' })
        } finally {
          inFlight.current = null
          setRunning(null)
        }
      })()
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [scope, actor, snapshot, listId, enabled, outcome?.snapshot, running])

  useEffect(() => {
    // A pending backoff belongs to the snapshot that incurred it.
    // Active provider calls may finish before the next snapshot starts.
    if (running && (running.scope !== scope || (running.waiting && running.snapshot !== snapshot))) {
      running.controller.abort()
    }
  }, [scope, snapshot, running])

  return {
    scope,
    snapshot,
    offer: eligible && !enabled,
    enable: () => setConsentingActor(actor),
    enabled,
    blocked: enabled && (!withinLimit || (outcome?.snapshot === snapshot && outcome?.kind === 'ineligible')),
    running: Boolean(enabled && snapshot && outcome?.snapshot !== snapshot),
    completed: Boolean(snapshot && outcome?.snapshot === snapshot && outcome.kind === 'completed'),
    failed: outcome?.snapshot === snapshot && outcome?.kind === 'failed',
    notification: outcome?.snapshot === snapshot ? outcome?.review ?? null : null,
    isCurrent: (review: BackgroundReview) => current.current.scope === review.scope && current.current.snapshot === review.snapshot,
    retry: () => {
      if (scope) setOutcomes((previous) => {
        const next = { ...previous }
        delete next[scope]
        return next
      })
    },
    markRead: () => {
      if (scope && outcome?.review) setOutcomes((previous) => ({
        ...previous, [scope]: { snapshot: outcome.snapshot, kind: 'completed' }
      }))
    }
  }
}
