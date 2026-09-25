import { filterTransientCorrections, groundAiResult, retrieveAiContext } from './aiRetrieval'
import type { AiAssistantRequest } from '../domain/aiSchemas'

const change = (
  type: 'added' | 'removed' | 'renamed',
  itemKey: string,
  changedAt: string,
  itemName = 'חלב'
) => ({ type, itemKey, changedAt, itemName, previousName: null, listName: null })

const baseRequest = (): AiAssistantRequest => ({
  mode: 'list_review',
  language: 'he',
  householdName: 'הבית',
  items: [
    { key: 'a', name: 'גבינה צהובה עמק', category: 'מקרר', bought: false, listName: null, addedAt: '2026-09-01T00:00:00Z', modifiedAt: null },
    { key: 'b', name: 'גבינה צהובה', category: 'מקרר', bought: false, listName: null, addedAt: '2026-09-01T00:00:00Z', modifiedAt: null },
    { key: 'trip', name: 'גבינה צהובה', category: 'מקרר', bought: false, listName: 'טיול', addedAt: '2026-09-01T00:00:00Z', modifiedAt: null }
  ],
  changes: [],
  purchases: [],
  categories: ['מקרר', 'אחר']
})

describe('AI structured retrieval', () => {
  it('removes only same-key add/remove corrections completed within one minute', () => {
    const input = [
      change('added', 'quick', '2026-09-03T10:00:00Z'),
      change('removed', 'quick', '2026-09-03T10:00:59Z'),
      change('added', 'slow', '2026-09-03T10:00:00Z'),
      change('removed', 'slow', '2026-09-03T10:01:01Z'),
      change('removed', 'other-key', '2026-09-03T10:00:20Z')
    ]

    const result = filterTransientCorrections(input)

    expect(result.ignoredCorrectionCount).toBe(1)
    expect(result.changes.map((event) => event.itemKey)).toEqual(['slow', 'slow', 'other-key'])
  })

  it('bounds retrieved history and reports filtered corrections', () => {
    const request = baseRequest()
    request.changes = [
      change('added', 'quick', '2026-09-03T10:00:00Z'),
      change('removed', 'quick', '2026-09-03T10:00:30Z'),
      change('added', 'real', '2026-09-02T10:00:00Z')
    ]

    const context = retrieveAiContext(request, new Date('2026-09-03T12:00:00Z'))

    expect(context.ignoredCorrectionCount).toBe(1)
    expect(context.changes.map((event) => event.itemKey)).toEqual(['real', 'a', 'b', 'trip'])
  })

  it('grounds review keys and refuses duplicate removal across sub-lists', () => {
    const context = retrieveAiContext(baseRequest(), new Date('2026-09-03T12:00:00Z'))
    const result = groundAiResult({
      mode: 'list_review',
      duplicates: [
        { keepKey: 'a', removeKeys: ['b', 'trip', 'invented'], reason: 'same product' }
      ],
      renames: [
        { key: 'a', currentName: 'made up', suggestedName: 'גבינה צהובה', reason: 'canonical' },
        { key: 'invented', currentName: 'x', suggestedName: 'y', reason: 'bad key' }
      ]
    }, context)

    expect(result).toEqual({
      mode: 'list_review',
      duplicates: [{ keepKey: 'a', removeKeys: ['b'], reason: 'same product' }],
      renames: [{ key: 'a', currentName: 'גבינה צהובה עמק', suggestedName: 'גבינה צהובה', reason: 'canonical' }]
    })
  })

  it('adds a safe duplicate suggestion for known cottage-cheese name variants', () => {
    const request = baseRequest()
    request.items = [
      { key: 'cottage', name: "קוטג'", category: 'מקרר', bought: false, listName: null, addedAt: '2026-09-01T00:00:00Z', modifiedAt: null },
      { key: 'cottage-cheese', name: "גבינת קוטג׳", category: 'מקרר', bought: false, listName: null, addedAt: '2026-09-01T00:00:00Z', modifiedAt: null },
      { key: 'trip-cottage', name: "גבינת קוטג'", category: 'מקרר', bought: false, listName: 'טיול', addedAt: '2026-09-01T00:00:00Z', modifiedAt: null }
    ]
    const context = retrieveAiContext(request, new Date('2026-09-03T12:00:00Z'))

    const result = groundAiResult({ mode: 'list_review', duplicates: [], renames: [] }, context)

    expect(result).toEqual({
      mode: 'list_review',
      duplicates: [{
        keepKey: 'cottage',
        removeKeys: ['cottage-cheese'],
        reason: 'אותו מוצר בשם שונה'
      }],
      renames: []
    })
  })

  it('deduplicates proposed items and grounds unknown categories to אחר', () => {
    const request = baseRequest()
    request.mode = 'insights'
    const context = retrieveAiContext(request, new Date('2026-09-03T12:00:00Z'))
    const result = groundAiResult({
      mode: 'insights',
      summary: ['summary'],
      nextSteps: ['next'],
      proposedList: {
        name: 'סופשבוע',
        items: [
          { name: 'חלב', category: 'לא קיים', reason: 'reason' },
          { name: ' חלב ', category: 'מקרר', reason: 'duplicate' }
        ]
      }
    }, context)

    expect(result.mode).toBe('insights')
    if (result.mode === 'insights') {
      expect(result.proposedList?.items).toEqual([{ name: 'חלב', category: 'אחר', reason: 'reason' }])
    }
  })

  it('does not propose another copy of an active grocery item', () => {
    const request = baseRequest()
    request.mode = 'insights'
    const context = retrieveAiContext(request, new Date('2026-09-03T12:00:00Z'))
    const result = groundAiResult({
      mode: 'insights',
      summary: [],
      nextSteps: [],
      proposedList: {
        name: 'סופשבוע',
        items: [
          { name: ' גבינה צהובה ', category: 'מקרר', reason: 'already active' },
          { name: 'חלב', category: 'מקרר', reason: 'not active' }
        ]
      }
    }, context)

    expect(result.mode === 'insights' ? result.proposedList?.items : null).toEqual([
      { name: 'חלב', category: 'מקרר', reason: 'not active' }
    ])
  })
})
