import { useEffect, useState } from 'react'
import { onValue } from '../lib/firebase'
import { computePurchaseInsights, EMPTY_PURCHASE_INSIGHTS, type PurchaseInsights } from '../lib/purchaseInsights'
import { computeHabitChanges, type HabitChange } from '../lib/purchaseHabitChanges'
import { useActiveList } from './ListContext'
import { useIsPrerendering } from './useIsPrerendering'
import type { PurchaseEvent } from '../types'

// Live wiring around the pure computePurchaseInsights() aggregation (see
// src/lib/purchaseInsights.ts for the actual weekly/monthly/frequent logic and why
// it's kept separate from this hook) — subscribes to the active list's
// purchaseHistoryRef exactly like useCategories subscribes to categoriesRef, and
// recomputes on every snapshot. This hook itself is intentionally thin and untested
// directly (same precedent as useCategories.ts/useWhatsNew.ts — plain onValue wiring
// isn't worth mocking Firebase's realtime listener machinery for); all the actual
// logic worth testing lives in the pure function it calls.
//
// P3: also runs the same events through computeHabitChanges (see
// src/lib/purchaseHabitChanges.ts) and exposes the result as `habitChanges` — kept in
// this same hook rather than a second subscription, since it's the same underlying
// /purchaseHistory data and there's no reason to double-subscribe. Consumers that
// don't care about habit changes (none currently) can simply ignore the extra field.
export const usePurchaseInsights = () => {
  const [insights, setInsights] = useState<PurchaseInsights>(EMPTY_PURCHASE_INSIGHTS)
  const [habitChanges, setHabitChanges] = useState<HabitChange[]>([])
  const isPrerendering = useIsPrerendering()
  const { listApi } = useActiveList()

  useEffect(() => {
    if (isPrerendering || !listApi) return
    setInsights(EMPTY_PURCHASE_INSIGHTS)
    setHabitChanges([])
    return onValue(listApi.purchaseHistoryRef, (snapshot) => {
      const data = snapshot.val() || {}
      const events = Object.values(data as Record<string, PurchaseEvent>)
      setInsights(computePurchaseInsights(events))
      setHabitChanges(computeHabitChanges(events))
    })
  }, [isPrerendering, listApi])

  return { ...insights, habitChanges }
}
