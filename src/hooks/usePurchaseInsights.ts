import { useEffect, useState } from 'react'
import { onValue } from '../lib/firebase'
import { computePurchaseInsights, EMPTY_PURCHASE_INSIGHTS, type PurchaseInsights } from '../lib/purchaseInsights'
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
export function usePurchaseInsights() {
  const [insights, setInsights] = useState<PurchaseInsights>(EMPTY_PURCHASE_INSIGHTS)
  const isPrerendering = useIsPrerendering()
  const { listApi } = useActiveList()

  useEffect(() => {
    if (isPrerendering || !listApi) return
    setInsights(EMPTY_PURCHASE_INSIGHTS)
    return onValue(listApi.purchaseHistoryRef, (snapshot) => {
      const data = snapshot.val() || {}
      const events = Object.values(data as Record<string, PurchaseEvent>)
      setInsights(computePurchaseInsights(events))
    })
  }, [isPrerendering, listApi])

  return insights
}
