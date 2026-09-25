import { groundItemEnrichment } from './groundItemEnrichment'

describe('groundItemEnrichment', () => {
  const request = {
    language: 'he' as const,
    categories: ['מוצרי חלב', 'אחר'],
    items: [{ id: '1', name: 'חללב' }, { id: '2', name: 'לחם' }]
  }

  it('uses the exact dataset spelling and derives category status locally', () => {
    const result = groundItemEnrichment({
      items: [{
        id: '1', originalName: 'ignored', correctedName: 'חלב', category: 'מוצרי חלב ',
        categoryStatus: 'suggested', correctionReason: 'תיקון'
      }]
    }, request)

    expect(result.items[0]).toEqual(expect.objectContaining({
      originalName: 'חללב',
      correctedName: 'חלב',
      category: 'מוצרי חלב',
      categoryStatus: 'existing'
    }))
    expect(result.items[1]).toEqual(expect.objectContaining({
      id: '2', originalName: 'לחם', correctedName: 'לחם', category: 'מוצרי חלב'
    }))
  })
})
