import { normalizeName } from './normalizeName'
import type { PurchaseEvent } from '../types'

// P3 follow-up on top of purchaseInsights.ts's windowed counts (see that file's own
// comment for the plan this continues). Deliberately a *separate* pure function
// rather than a change to computePurchaseInsights — that function's tested contract
// (weekly/monthly/frequent trailing-window counts) is relied on by
// purchaseInsights.test.ts and usePurchaseInsights.ts as-is, and this ticket's
// non-goals explicitly rule out changing it. This file reuses the same
// dependency-free-pure-function philosophy (no Firebase, no React, no Gemini) so it's
// trivially unit-testable with plain mock event arrays — see
// purchaseHabitChanges.test.ts.
//
// What this adds that computePurchaseInsights doesn't: a *comparison* between two
// equal-length, adjacent windows (not just "how many in the trailing N days"), so a
// real habit shift (e.g. "started buying coffee every week" or "stopped buying
// diapers") can be told apart from an item that has simply always been bought at a
// steady rate. Two comparisons are run, both over equal-length windows so counts are
// directly comparable without any rate normalization:
//   - "weekly":  trailing 7 days   vs. the 7 days before that (8-14 days ago)
//   - "monthly": trailing 30 days  vs. the 30 days before that (31-60 days ago)
// Equal window lengths were chosen over e.g. "this week vs. the 3 weeks before that"
// specifically to keep the comparison a direct count-vs-count one — no averaging/
// per-week-rate math to get wrong or explain.

export type HabitChangeDirection = 'increase' | 'decrease'
export type HabitChangeWindow = 'weekly' | 'monthly'

export type HabitChange = {
  // Display name — same "raw, untranslated, most-recent-event's-spelling" convention
  // as PurchaseInsightItem.itemName in purchaseInsights.ts.
  itemName: string
  direction: HabitChangeDirection
  window: HabitChangeWindow
  // Count in the more recent of the two compared windows.
  recentCount: number
  // Count in the older of the two compared windows.
  priorCount: number
}

const DAY_MS = 24 * 60 * 60 * 1000

// A change only counts as "real" once at least one side of the comparison clears this
// floor — without it, an item going from 1 purchase to 2 ("doubled!") would get
// flagged despite being completely unremarkable on this little data. Not
// statistically sophisticated (this ticket doesn't call for that), just enough to
// keep sparse/noisy histories from producing misleading output.
const NOISE_FLOOR = 3

// Caps how many changes are ever returned (after sorting by how dramatic the shift
// is) — keeps whatever ends up in a Gemini prompt short and keeps the summary to a
// handful of genuinely notable shifts rather than a long tail of borderline ones.
export const MAX_HABIT_CHANGES = 8

type WindowDefinition = {
  window: HabitChangeWindow
  windowDays: number
}

const WINDOW_DEFINITIONS: WindowDefinition[] = [
  { window: 'weekly', windowDays: 7 },
  { window: 'monthly', windowDays: 30 }
]

type CountEntry = {
  itemName: string
  count: number
}

// Counts events strictly within (rangeStart, rangeEnd] by normalized item name, same
// exclusive-lower/inclusive-upper boundary convention as aggregateWindow in
// purchaseInsights.ts (pinned down there by its own boundary test).
const countsInRange = (events: PurchaseEvent[], rangeStart: number, rangeEnd: number): Map<string, CountEntry> => {
  const counts = new Map<string, CountEntry>()

  for (const event of events) {
    const purchasedAt = Date.parse(event.purchasedAt)
    if (Number.isNaN(purchasedAt) || purchasedAt <= rangeStart || purchasedAt > rangeEnd) continue

    const key = normalizeName(event.itemName)
    if (!key) continue

    const existing = counts.get(key)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(key, { itemName: event.itemName, count: 1 })
    }
  }

  return counts
}

// Decides whether a recent-vs-prior count pair represents a real, worth-mentioning
// change. Handles the "brand new habit" / "stopped entirely" edge cases (one side is
// zero) separately from the "both sides nonzero" doubled/halved case, since a plain
// ratio is undefined when either count is zero.
const classify = (recentCount: number, priorCount: number): HabitChangeDirection | null => {
  if (recentCount === 0 && priorCount === 0) return null
  if (priorCount === 0) return recentCount >= NOISE_FLOOR ? 'increase' : null
  if (recentCount === 0) return priorCount >= NOISE_FLOOR ? 'decrease' : null
  if (Math.max(recentCount, priorCount) < NOISE_FLOOR) return null
  if (recentCount >= priorCount * 2) return 'increase'
  if (recentCount <= priorCount / 2) return 'decrease'
  return null
}

// How dramatic a change is, used purely for sort order (most notable first) — a
// brand-new or fully-stopped item (one side zero) is treated as maximally dramatic
// since there's no meaningful ratio to compute.
const magnitude = (recentCount: number, priorCount: number): number => {
  if (recentCount === 0 || priorCount === 0) return Infinity
  return Math.max(recentCount / priorCount, priorCount / recentCount)
}

export const computeHabitChanges = (
  events: PurchaseEvent[],
  now: Date = new Date(),
  maxResults: number = MAX_HABIT_CHANGES
): HabitChange[] => {
  const changes: HabitChange[] = []

  for (const { window, windowDays } of WINDOW_DEFINITIONS) {
    const recentEnd = now.getTime()
    const recentStart = recentEnd - windowDays * DAY_MS
    const priorEnd = recentStart
    const priorStart = priorEnd - windowDays * DAY_MS

    const recentCounts = countsInRange(events, recentStart, recentEnd)
    const priorCounts = countsInRange(events, priorStart, priorEnd)

    const keys = new Set([...recentCounts.keys(), ...priorCounts.keys()])
    for (const key of keys) {
      const recent = recentCounts.get(key)
      const prior = priorCounts.get(key)
      const recentCount = recent?.count ?? 0
      const priorCount = prior?.count ?? 0

      const direction = classify(recentCount, priorCount)
      if (!direction) continue

      changes.push({
        itemName: (recent ?? prior)!.itemName,
        direction,
        window,
        recentCount,
        priorCount
      })
    }
  }

  return changes
    .sort((a, b) => {
      const magnitudeDiff = magnitude(b.recentCount, b.priorCount) - magnitude(a.recentCount, a.priorCount)
      if (magnitudeDiff !== 0) return magnitudeDiff
      return a.itemName.localeCompare(b.itemName, 'he')
    })
    .slice(0, maxResults)
}

export const habitChangesSignature = (changes: HabitChange[]): string => {
  return JSON.stringify(
    changes.map((change) => [
      change.itemName,
      change.window,
      change.direction,
      change.recentCount,
      change.priorCount
    ])
  )
}
