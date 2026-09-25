import { buildAiAssistantRequest } from './buildAiAssistantRequest'

describe('buildAiAssistantRequest', () => {
  it('normalizes legacy Firebase records with missing optional-era fields', () => {
    const result = buildAiAssistantRequest({
      mode: 'insights',
      language: 'he',
      householdName: 'Home',
      context: {
        items: [{ key: 'milk', item: 'חלב' } as any],
        changes: [{ type: 'added', itemKey: 'milk', itemName: 'חלב' } as any],
        purchases: [{ itemName: 'לחם' } as any],
        categories: [{ key: 'other', name: 'אחר' } as any]
      }
    })

    expect(result.items[0]).toEqual({
      key: 'milk', name: 'חלב', category: 'אחר', bought: false,
      listName: null, addedAt: '', modifiedAt: null
    })
    expect(result.changes[0]).toEqual(expect.objectContaining({
      previousName: null, listName: null, changedAt: ''
    }))
    expect(result.purchases[0]).toEqual({
      itemName: 'לחם', category: 'אחר', quantity: null, unit: null, purchasedAt: ''
    })
  })

  it('drops malformed records and bounds every collection to the API limits', () => {
    const result = buildAiAssistantRequest({
      mode: 'list_review',
      language: 'en',
      householdName: '',
      context: {
        items: [
          { key: '', item: 'invalid' } as any,
          ...Array.from({ length: 305 }, (_, index) => ({ key: `k${index}`, item: `item ${index}` } as any))
        ],
        changes: [],
        purchases: [],
        categories: []
      }
    })

    expect(result.householdName).toBe('Home')
    expect(result.items).toHaveLength(300)
    expect(result.items[0].key).toBe('k5')
  })
})
