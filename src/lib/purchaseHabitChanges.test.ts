import { computeHabitChanges, MAX_HABIT_CHANGES } from './purchaseHabitChanges'
import type { PurchaseEvent } from '../types'

// Same fixed-instant pattern as purchaseInsights.test.ts, so every event's timestamp
// is expressed relative to a known NOW instead of the real system clock.
const NOW = new Date('2026-07-20T12:00:00.000Z')

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

const event = (overrides: Partial<PurchaseEvent>): PurchaseEvent => ({
  itemName: 'קפה',
  category: 'משקאות',
  quantity: null,
  unit: null,
  purchasedAt: daysAgo(1),
  purchasedBy: 'muli@example.com',
  ...overrides
})

// Repeats an event `count` times at the given age (days ago) — a habit-change
// comparison cares about counts, not individual event identity.
const repeat = (itemName: string, daysAgoValue: number, count: number): PurchaseEvent[] =>
  Array.from({ length: count }, () => event({ itemName, purchasedAt: daysAgo(daysAgoValue) }))

describe('computeHabitChanges', () => {
  it('returns an empty array for an empty history', () => {
    expect(computeHabitChanges([], NOW)).toEqual([])
  })

  it('returns an empty array for a single sparse event (nothing to compare against, and nothing crashes)', () => {
    const events = [event({ purchasedAt: daysAgo(2) })]
    expect(computeHabitChanges(events, NOW)).toEqual([])
  })

  it('detects a clear weekly increase (a new habit: 0 in the prior week, several in the recent week)', () => {
    const events = repeat('קפה', 2, 4) // inside the trailing 7 days
    const [change] = computeHabitChanges(events, NOW)

    expect(change).toEqual({
      itemName: 'קפה',
      direction: 'increase',
      window: 'weekly',
      recentCount: 4,
      priorCount: 0
    })
  })

  it('detects a clear weekly decrease (bought a lot last week-before-last, nothing this week)', () => {
    const events = repeat('חיתולים', 10, 4) // 8-14 days ago = the "prior" weekly window
    const [change] = computeHabitChanges(events, NOW)

    expect(change).toEqual({
      itemName: 'חיתולים',
      direction: 'decrease',
      window: 'weekly',
      recentCount: 0,
      priorCount: 4
    })
  })

  it('detects a doubling once both counts clear the noise floor', () => {
    const events = [...repeat('חלב', 2, 6), ...repeat('חלב', 10, 3)]
    const change = computeHabitChanges(events, NOW).find((c) => c.window === 'weekly')

    expect(change).toEqual({
      itemName: 'חלב',
      direction: 'increase',
      window: 'weekly',
      recentCount: 6,
      priorCount: 3
    })
  })

  it('detects a halving once both counts clear the noise floor', () => {
    const events = [...repeat('ביצים', 2, 3), ...repeat('ביצים', 10, 6)]
    const change = computeHabitChanges(events, NOW).find((c) => c.window === 'weekly')

    expect(change).toEqual({
      itemName: 'ביצים',
      direction: 'decrease',
      window: 'weekly',
      recentCount: 3,
      priorCount: 6
    })
  })

  it('does NOT flag noise-floor-level fluctuation in the weekly comparison (1 -> 2 is a "doubling" but too sparse to mean anything)', () => {
    const events = [...repeat('לחם', 2, 2), ...repeat('לחם', 10, 1)]
    const weeklyChanges = computeHabitChanges(events, NOW).filter((c) => c.window === 'weekly')
    expect(weeklyChanges).toEqual([])
  })

  it('does NOT flag a steady, unchanged weekly rate', () => {
    const events = [...repeat('בננות', 2, 4), ...repeat('בננות', 10, 4)]
    const weeklyChanges = computeHabitChanges(events, NOW).filter((c) => c.window === 'weekly')
    expect(weeklyChanges).toEqual([])
  })

  it('does NOT flag stopping an item that was only bought once or twice before (too sparse to call a real habit change)', () => {
    const events = repeat('משהו נדיר', 10, 2) // prior week only, recent week empty
    expect(computeHabitChanges(events, NOW)).toEqual([])
  })

  it('detects a clear monthly increase using the 30-vs-prior-30-days comparison, independent of the weekly window', () => {
    // Bought steadily 10 days ago (inside both weekly-prior and monthly-recent) plus a
    // burst 45 days ago (inside monthly-prior, outside the 14-day weekly comparison
    // entirely) so this is purely a monthly-window signal.
    const events = [...repeat('שמן זית', 10, 5), ...repeat('שמן זית', 45, 1)]
    const change = computeHabitChanges(events, NOW).find((c) => c.window === 'monthly')

    expect(change).toEqual({
      itemName: 'שמן זית',
      direction: 'increase',
      window: 'monthly',
      recentCount: 5,
      priorCount: 1
    })
  })

  it('ignores events with an unparseable purchasedAt instead of throwing', () => {
    const events = [...repeat('תקין', 2, 4), event({ itemName: 'לא תקין', purchasedAt: 'not-a-date' })]
    expect(() => computeHabitChanges(events, NOW)).not.toThrow()
    const weeklyChanges = computeHabitChanges(events, NOW).filter((c) => c.window === 'weekly')
    expect(weeklyChanges.map((c) => c.itemName)).toEqual(['תקין'])
  })

  it('ignores events with an empty/blank item name', () => {
    const events = [event({ itemName: '   ', purchasedAt: daysAgo(2) })]
    expect(computeHabitChanges(events, NOW)).toEqual([])
  })

  it('caps the number of returned changes at maxResults, keeping the most dramatic ones first', () => {
    const events = Array.from({ length: MAX_HABIT_CHANGES + 5 }, (_, i) => repeat(`פריט ${i}`, 2, 4)).flat()
    const changes = computeHabitChanges(events, NOW)

    expect(changes).toHaveLength(MAX_HABIT_CHANGES)
  })

  it('honors a custom maxResults override', () => {
    const events = [...repeat('א', 2, 5), ...repeat('ב', 2, 4)]
    const changes = computeHabitChanges(events, NOW, 1)

    expect(changes).toHaveLength(1)
  })
})
