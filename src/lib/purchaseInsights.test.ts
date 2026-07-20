import { computePurchaseInsights, EMPTY_PURCHASE_INSIGHTS } from './purchaseInsights'
import type { PurchaseEvent } from '../types'

// NOW is deliberately a fixed instant so every test's event timestamps are
// expressed relative to it, instead of depending on the real system clock.
const NOW = new Date('2026-07-20T12:00:00.000Z')

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

const event = (overrides: Partial<PurchaseEvent>): PurchaseEvent => ({
  itemName: 'חלב',
  category: 'מוצרי חלב',
  quantity: null,
  unit: null,
  purchasedAt: daysAgo(1),
  purchasedBy: 'muli@example.com',
  ...overrides
})

describe('computePurchaseInsights', () => {
  it('returns empty arrays for an empty history', () => {
    expect(computePurchaseInsights([], NOW)).toEqual(EMPTY_PURCHASE_INSIGHTS)
  })

  it('groups and counts events by normalized item name within the weekly window (trailing 7 days), labeling the group with the most recent event\'s raw name', () => {
    const events = [
      event({ itemName: '  חלב  ', purchasedAt: daysAgo(2) }), // same item, different whitespace, older
      event({ itemName: 'חלב', purchasedAt: daysAgo(1) }), // more recent — should win as the display label
      event({ itemName: 'לחם', purchasedAt: daysAgo(3) })
    ]

    const { weekly } = computePurchaseInsights(events, NOW)

    expect(weekly).toEqual([
      { itemName: 'חלב', count: 2 },
      { itemName: 'לחם', count: 1 }
    ])
  })

  it('excludes events older than 7 days from the weekly bucket but keeps them in monthly', () => {
    const events = [
      event({ itemName: 'חלב', purchasedAt: daysAgo(2) }), // inside both windows
      event({ itemName: 'ביצים', purchasedAt: daysAgo(10) }) // outside weekly, inside monthly
    ]

    const { weekly, monthly } = computePurchaseInsights(events, NOW)

    expect(weekly.map((i) => i.itemName)).toEqual(['חלב'])
    expect(monthly.map((i) => i.itemName).sort()).toEqual(['ביצים', 'חלב'].sort())
  })

  it('correctly buckets an event exactly on the 7-day boundary as excluded, and just inside as included', () => {
    const events = [
      event({ itemName: 'בדיוק בגבול', purchasedAt: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() }),
      event({ itemName: 'בתוך הגבול', purchasedAt: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000 + 1000).toISOString() })
    ]

    const { weekly } = computePurchaseInsights(events, NOW)
    const names = weekly.map((i) => i.itemName)

    expect(names).not.toContain('בדיוק בגבול')
    expect(names).toContain('בתוך הגבול')
  })

  it('excludes events older than 30 days from monthly but keeps them in the 90-day frequent window', () => {
    const events = [
      event({ itemName: 'קפה', purchasedAt: daysAgo(45) })
    ]

    const { monthly, frequent } = computePurchaseInsights(events, NOW)

    expect(monthly).toEqual([])
    expect(frequent).toEqual([{ itemName: 'קפה', count: 1 }])
  })

  it('excludes events older than 90 days entirely', () => {
    const events = [event({ itemName: 'ישן מדי', purchasedAt: daysAgo(91) })]

    const { weekly, monthly, frequent } = computePurchaseInsights(events, NOW)

    expect(weekly).toEqual([])
    expect(monthly).toEqual([])
    expect(frequent).toEqual([])
  })

  it('ranks frequency by count descending, tie-breaking alphabetically', () => {
    const events = [
      event({ itemName: 'תפוחים', purchasedAt: daysAgo(1) }),
      event({ itemName: 'תפוחים', purchasedAt: daysAgo(2) }),
      event({ itemName: 'תפוחים', purchasedAt: daysAgo(3) }),
      event({ itemName: 'בננות', purchasedAt: daysAgo(1) }),
      event({ itemName: 'בננות', purchasedAt: daysAgo(2) }),
      event({ itemName: 'ענבים', purchasedAt: daysAgo(1) })
    ]

    const { frequent } = computePurchaseInsights(events, NOW)

    expect(frequent).toEqual([
      { itemName: 'תפוחים', count: 3 },
      { itemName: 'בננות', count: 2 },
      { itemName: 'ענבים', count: 1 }
    ])
  })

  it('ignores events with an unparseable purchasedAt instead of throwing', () => {
    const events = [event({ itemName: 'תקין', purchasedAt: daysAgo(1) }), event({ itemName: 'לא תקין', purchasedAt: 'not-a-date' })]

    const { weekly } = computePurchaseInsights(events, NOW)

    expect(weekly.map((i) => i.itemName)).toEqual(['תקין'])
  })

  it('ignores events with an empty/blank item name', () => {
    const events = [event({ itemName: '   ' })]

    const { weekly } = computePurchaseInsights(events, NOW)

    expect(weekly).toEqual([])
  })
})
