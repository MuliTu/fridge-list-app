import { useEffect, useRef, useState } from 'react'
import { getPurchaseHabitSummary } from '../lib/firebase'
import { habitChangesSignature, type HabitChange } from '../lib/purchaseHabitChanges'

export type PurchaseHabitSummaryState = {
  summary: string[] | null
  loading: boolean
  error: boolean
}

// Fetches a plain-language AI summary of the given habit changes from
// /api/purchase-habit-summary. Kept as its own hook, separate from
// usePurchaseInsights, since this one triggers a network call against a shared
// external AI quota rather than being a pure client-side computation; re-fetching on every
// Firebase snapshot (which is what would happen if this just used a plain
// useEffect(..., [habitChanges]) with no dedup, since that array gets a new reference
// on every snapshot) would multiply Gemini calls for no reason. Never calls out at all
// when there are no changes to summarize.
export const usePurchaseHabitSummary = (habitChanges: HabitChange[]): PurchaseHabitSummaryState => {
  const [state, setState] = useState<PurchaseHabitSummaryState>({ summary: null, loading: false, error: false })
  const lastFetchedSignature = useRef<string | null>(null)

  useEffect(() => {
    if (habitChanges.length === 0) {
      // Guarded on the ref, not called unconditionally: computeHabitChanges (and
      // therefore usePurchaseInsights' habitChanges) returns a brand-new empty array
      // on every Firebase snapshot even when nothing changed, so this effect can rerun
      // with a "new" empty array many times in a row. Calling setState with a fresh
      // object every time would be a genuine infinite-render-loop bug — React reruns
      // this effect whenever the (new-reference) habitChanges dependency "changes",
      // and each rerun's setState would trigger yet another render, forever. Skipping
      // the no-op reset once we're already at the empty/reset baseline breaks that
      // loop (confirmed the hard way against this exact object array — see this
      // file's test suite, "does NOT re-fetch..." case).
      if (lastFetchedSignature.current !== null) {
        lastFetchedSignature.current = null
        setState({ summary: null, loading: false, error: false })
      }
      return
    }

    const signature = habitChangesSignature(habitChanges)
    if (signature === lastFetchedSignature.current) return
    lastFetchedSignature.current = signature

    let cancelled = false
    setState({ summary: null, loading: true, error: false })

    getPurchaseHabitSummary(habitChanges)
      .then((summary) => {
        if (!cancelled) setState({ summary, loading: false, error: false })
      })
      .catch(() => {
        if (!cancelled) setState({ summary: null, loading: false, error: true })
      })

    return () => {
      cancelled = true
    }
  }, [habitChanges])

  return state
}
