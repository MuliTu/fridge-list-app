import { normalizeName } from './normalizeName'
import type { PurchaseEvent } from '../types'

// Pure aggregation over the append-only /users/{owner}/purchaseHistory log (see
// PurchaseEvent in ../types, and recordPurchaseEvent in firebase.ts) — deliberately
// kept as a plain, dependency-free function (no Firebase, no React) rather than
// inlined into usePurchaseInsights.ts, for two reasons: it's trivially unit-testable
// with plain mock event arrays (see purchaseInsights.test.ts), and a planned follow-up
// ticket (P3 — habit-change/anomaly detection + an AI-generated natural-language
// summary) is expected to build directly on top of this same windowed-count shape
// rather than re-deriving it.

export interface PurchaseInsightItem {
  // Display name — the raw (untranslated, exactly-as-purchased) item name from the
  // most recent event in this group, same "persisted data values are never
  // translated" rule as categories/list names/item notes elsewhere in this app.
  itemName: string
  count: number
}

export interface PurchaseInsights {
  // Trailing 7 days, counted from `now`.
  weekly: PurchaseInsightItem[]
  // Trailing 30 days, counted from `now`.
  monthly: PurchaseInsightItem[]
  // Trailing 90 days, counted from `now` — the "frequently purchased" ranking.
  // Chosen over an all-time window so this stays a rolling, currently-relevant view
  // (an item bought weekly a year ago but not since shouldn't keep topping the list
  // forever) and so it lines up with the same "windowed count" shape as weekly/
  // monthly — useful precedent for the P3 follow-up ticket, which will want
  // comparable windows to detect habit changes. Documented here rather than made
  // configurable, since this ticket doesn't call for a window picker.
  frequent: PurchaseInsightItem[]
}

export const EMPTY_PURCHASE_INSIGHTS: PurchaseInsights = { weekly: [], monthly: [], frequent: [] }

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKLY_WINDOW_DAYS = 7
const MONTHLY_WINDOW_DAYS = 30
const FREQUENT_WINDOW_DAYS = 90

// Groups events within a trailing window by normalized item name, counting
// occurrences and keeping the most-recently-purchased event's original (un-
// normalized) name as the group's display label. Sorted by count descending, then
// alphabetically (Hebrew-aware, matching useCategories' own tie-break) for a
// deterministic, non-flickering order across re-renders.
function aggregateWindow(events: PurchaseEvent[], now: Date, windowDays: number): PurchaseInsightItem[] {
  const cutoff = now.getTime() - windowDays * DAY_MS
  const groups = new Map<string, { itemName: string; count: number; latestAt: number }>()

  for (const event of events) {
    const purchasedAt = Date.parse(event.purchasedAt)
    // Lower bound is exclusive (an event exactly `windowDays` ago falls just outside
    // the window) — an arbitrary but consistent choice for the boundary, pinned down
    // by the boundary test in purchaseInsights.test.ts so it can't silently drift.
    if (Number.isNaN(purchasedAt) || purchasedAt <= cutoff || purchasedAt > now.getTime()) continue

    const key = normalizeName(event.itemName)
    if (!key) continue

    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { itemName: event.itemName, count: 1, latestAt: purchasedAt })
    } else {
      existing.count += 1
      if (purchasedAt > existing.latestAt) {
        existing.itemName = event.itemName
        existing.latestAt = purchasedAt
      }
    }
  }

  return Array.from(groups.values())
    .map(({ itemName, count }) => ({ itemName, count }))
    .sort((a, b) => b.count - a.count || a.itemName.localeCompare(b.itemName, 'he'))
}

export function computePurchaseInsights(events: PurchaseEvent[], now: Date = new Date()): PurchaseInsights {
  return {
    weekly: aggregateWindow(events, now, WEEKLY_WINDOW_DAYS),
    monthly: aggregateWindow(events, now, MONTHLY_WINDOW_DAYS),
    frequent: aggregateWindow(events, now, FREQUENT_WINDOW_DAYS)
  }
}
