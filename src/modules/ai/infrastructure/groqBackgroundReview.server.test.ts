/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { GroqRateLimitError, reviewWithGroq } from './groqBackgroundReview.server'

const items = [
  { key: 'first-secret-id', item: 'Synthetic grocery 1', bought: false, list_name: 'private sublist' },
  { key: 'second-secret-id', item: 'Synthetic grocery 1', bought: false, list_name: 'private sublist' },
  { key: 'third-secret-id', item: 'Synthetic grocery 1', bought: true, list_name: 'private sublist' },
  { key: 'fourth-secret-id', item: 'Synthetic grocery 1', bought: false, list_name: 'another private sublist' }
]

const providerResponse = (result: object) => Response.json({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }]
})

it('minimizes the outbound payload and grounds results within sublist scope', async () => {
  const send = jest.fn(async (_url: string, _request: RequestInit) => providerResponse({
    mode: 'list_review',
    duplicates: [{ keepKey: '1', removeKeys: ['3', '4', '999'], reason: 'Provider suggestion' }],
    renames: [{ key: '2', currentName: 'Synthetic grocery 1', suggestedName: 'Other', reason: 'Provider suggestion' }]
  }))
  const signal = new AbortController().signal
  const result = await reviewWithGroq('test-key', items, 'en', signal, send,
    new Map([[items[0].key, Date.parse('2026-09-01T00:00:00Z')]]))
  const [url, request] = send.mock.calls[0]
  expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
  expect(request.signal).toBe(signal)
  const body = JSON.parse(String(request.body))
  expect(body.model).toBe('openai/gpt-oss-20b')
  expect(body.response_format.json_schema.strict).toBe(true)
  expect(JSON.parse(body.messages[1].content)).toEqual({
    language: 'en',
    items: [['1', items[0].item, 0, 0], ['2', items[1].item, 0, 0],
      ['3', items[2].item, 0, 1], ['4', items[3].item, 1, 0]]
  })
  expect(JSON.stringify(body)).not.toMatch(/secret-id|private sublist|test-key|2026-09-01|1788220800000/)
  expect(result.duplicates).toEqual([{ keepKey: items[2].key, removeKeys: [items[0].key, items[1].key], reason: 'Kept the purchased item' }])
  expect(result.renames).toEqual([])
})

it('preserves provider backoff for the shared limiter without hidden retries', async () => {
  const send = jest.fn(async () => new Response(null, { status: 429, headers: { 'Retry-After': '64.1' } }))
  await expect(reviewWithGroq('test-key', items, 'en', new AbortController().signal, send as unknown as typeof fetch))
    .rejects.toEqual(new GroqRateLimitError(65))
  expect(send).toHaveBeenCalledTimes(1)
})

it('finds exact matches across purchase states without grouping product variants', async () => {
  const groceries = [
    { key: 'open', item: 'Milk', bought: false, list_name: null },
    { key: 'purchased', item: ' milk ', bought: true, list_name: null },
    { key: 'variant', item: 'Chocolate milk', bought: true, list_name: null },
    { key: 'other', item: 'Milk', bought: true, list_name: 'Trip' }
  ]
  const send = async () => providerResponse({ mode: 'list_review', duplicates: [], renames: [] })
  const result = await reviewWithGroq('test-key', groceries, 'en', new AbortController().signal, send)
  expect(result.duplicates).toEqual([{ keepKey: 'purchased', removeKeys: ['open'], reason: 'Kept the purchased item' }])
})

it('ranks a purchased equivalent ahead of overlapping exact matches and rejects other sublists', async () => {
  const groceries = [
    { key: 'first', item: 'עוגה', bought: false, list_name: null },
    { key: 'second', item: 'עוגה', bought: false, list_name: null },
    { key: 'purchased', item: 'עוגות', bought: true, list_name: null },
    { key: 'other', item: 'עוגות', bought: true, list_name: 'Trip' },
    { key: 'unclaimed', item: 'עוגהה', bought: false, list_name: null }
  ]
  const send = jest.fn(async (_url: string, _request: RequestInit) => providerResponse({
    mode: 'list_review', duplicates: [
      { keepKey: '1', removeKeys: ['3', '4', '999', '3', '1'], reason: 'אותו מוצר' },
      { keepKey: '3', removeKeys: ['5'], reason: 'אותו מוצר' }
    ], renames: []
  }))
  const result = await reviewWithGroq('test-key', groceries, 'he', new AbortController().signal, send)
  const prompt = JSON.parse(String(send.mock.calls[0][1].body)).messages[0].content
  expect(result.duplicates).toEqual([{ keepKey: 'purchased', removeKeys: ['first', 'second'], reason: 'הפריט שנרכש נשמר' }])
  expect(prompt).toMatch(/regardless of purchase status/)
  expect(prompt).toMatch(/brand, flavor, variety or product form/)
})

it.each([
  ['forward', [['1', '3'], ['2', '4']]],
  ['reverse', [['2', '4'], ['1', '3']]]
] as const)('ranks direct claims on the same exact group together in %s response order', async (_order, claims) => {
  const groceries = [
    { key: 'exact-first', item: 'Tomato', bought: false, list_name: null },
    { key: 'exact-second', item: ' tomato ', bought: false, list_name: null },
    { key: 'alternate', item: 'Tomatos', bought: false, list_name: null },
    { key: 'purchased', item: 'Tomatoes', bought: true, list_name: null }
  ]
  const duplicates = claims.map(([keepKey, removal]) => ({ keepKey, removeKeys: [removal], reason: 'Same product' }))
  const send = jest.fn(async () => providerResponse({ mode: 'list_review', duplicates, renames: [] }))
  const result = await reviewWithGroq('test-key', groceries, 'en', new AbortController().signal, send)

  expect(send).toHaveBeenCalledTimes(1)
  expect(result.duplicates).toEqual([{
    keepKey: 'purchased', removeKeys: ['alternate', 'exact-first', 'exact-second'], reason: 'Kept the purchased item'
  }])
})

it('joins existing exact groups when a direct claim connects them', async () => {
  const groceries = [
    { key: 'first-tomato', item: 'Tomato', bought: false, list_name: null },
    { key: 'second-tomato', item: ' tomato ', bought: false, list_name: null },
    { key: 'first-tomatoes', item: 'Tomatoes', bought: false, list_name: null },
    { key: 'second-tomatoes', item: ' tomatoes ', bought: false, list_name: null },
    { key: 'purchased', item: 'עגבניות', bought: true, list_name: null },
    { key: 'alternate', item: 'Tomatos', bought: false, list_name: null }
  ]
  const send = async () => providerResponse({
    mode: 'list_review', duplicates: [
      { keepKey: '1', removeKeys: ['5'], reason: 'Same product' },
      { keepKey: '3', removeKeys: ['6'], reason: 'Same product' },
      { keepKey: '2', removeKeys: ['4'], reason: 'Same product' }
    ], renames: []
  })
  const result = await reviewWithGroq('test-key', groceries, 'en', new AbortController().signal, send)

  expect(result.duplicates).toEqual([{
    keepKey: 'purchased',
    removeKeys: ['alternate', 'first-tomato', 'first-tomatoes', 'second-tomato', 'second-tomatoes'],
    reason: 'Kept the purchased item'
  }])
})

it('keeps separate exact groups when claims overlap only on a provider alias', async () => {
  const groceries = [
    { key: 'first-lime', item: 'Lime', bought: false, list_name: null },
    { key: 'second-lime', item: ' lime ', bought: false, list_name: null },
    { key: 'first-lemon', item: 'Lemon', bought: false, list_name: null },
    { key: 'second-lemon', item: ' lemon ', bought: false, list_name: null },
    { key: 'purchased', item: 'Citrus', bought: true, list_name: null }
  ]
  const send = async () => providerResponse({
    mode: 'list_review', duplicates: [
      { keepKey: '1', removeKeys: ['5'], reason: 'Same product' },
      { keepKey: '3', removeKeys: ['5'], reason: 'Same product' }
    ], renames: []
  })
  const result = await reviewWithGroq('test-key', groceries, 'en', new AbortController().signal, send)

  expect(result.duplicates).toEqual([
    { keepKey: 'purchased', removeKeys: ['first-lime', 'second-lime'], reason: 'Kept the purchased item' },
    { keepKey: 'first-lemon', removeKeys: ['second-lemon'], reason: 'Broke the tie by grocery ID order' }
  ])
})

it('drops a claim that relies on a previously claimed provider-only anchor', async () => {
  const groceries = [
    { key: 'first-lime', item: 'Lime', bought: false, list_name: null },
    { key: 'second-lime', item: ' lime ', bought: false, list_name: null },
    { key: 'first-lemon', item: 'Lemon', bought: false, list_name: null },
    { key: 'second-lemon', item: ' lemon ', bought: false, list_name: null },
    { key: 'purchased', item: 'Citrus', bought: true, list_name: null },
    { key: 'unclaimed', item: 'Citrus fruit', bought: true, list_name: null }
  ]
  const send = async () => providerResponse({
    mode: 'list_review', duplicates: [
      { keepKey: '1', removeKeys: ['5'], reason: 'Same product' },
      { keepKey: '5', removeKeys: ['3', '6'], reason: 'Same product' }
    ], renames: []
  })
  const result = await reviewWithGroq('test-key', groceries, 'en', new AbortController().signal, send)

  expect(result.duplicates).toEqual([
    { keepKey: 'purchased', removeKeys: ['first-lime', 'second-lime'], reason: 'Kept the purchased item' },
    { keepKey: 'first-lemon', removeKeys: ['second-lemon'], reason: 'Broke the tie by grocery ID order' }
  ])
})

it('ranks every exact member before applying the group removal cap', async () => {
  const groceries = Array.from({ length: 12 }, (_, index) => ({
    key: `item-${String(index).padStart(2, '0')}`, item: 'Milk', bought: index === 11, list_name: null
  }))
  const send = async () => providerResponse({ mode: 'list_review', duplicates: [], renames: [] })
  const result = await reviewWithGroq('test-key', groceries, 'en', new AbortController().signal, send)
  expect(result.duplicates).toEqual([{
    keepKey: 'item-11', removeKeys: groceries.slice(0, 10).map(({ key }) => key), reason: 'Kept the purchased item'
  }])
})

it('drops a deferred provider group when an exact-backed group claims its anchor', async () => {
  const groceries = [
    { key: 'exact-first', item: 'Tomato', bought: false, list_name: null },
    { key: 'exact-second', item: ' tomato ', bought: false, list_name: null },
    { key: 'purchased', item: 'Tomatoes', bought: true, list_name: null },
    { key: 'other-first', item: 'Tomatos', bought: false, list_name: null },
    { key: 'other-second', item: 'Tomatoe', bought: false, list_name: null }
  ]
  const send = async () => providerResponse({
    mode: 'list_review', duplicates: [
      { keepKey: '3', removeKeys: ['4', '5'], reason: 'Same product' },
      { keepKey: '1', removeKeys: ['3'], reason: 'Same product' }
    ], renames: []
  })
  const result = await reviewWithGroq('test-key', groceries, 'en', new AbortController().signal, send)
  expect(result.duplicates).toEqual([{
    keepKey: 'purchased', removeKeys: ['exact-first', 'exact-second'], reason: 'Kept the purchased item'
  }])
})

it('prioritizes an exact group when twelve disjoint provider groups fill the output cap', async () => {
  const groceries = [
    { key: 'milk-first', item: 'Milk', bought: false, list_name: null },
    { key: 'milk-second', item: ' milk ', bought: false, list_name: null },
    ...Array.from({ length: 12 }, (_, index) => [
      { key: `singular-${index}`, item: `Product ${index}`, bought: false, list_name: null },
      { key: `plural-${index}`, item: `Products ${index}`, bought: false, list_name: null }
    ]).flat()
  ]
  const duplicates = Array.from({ length: 12 }, (_, index) => ({
    keepKey: String(3 + 2 * index), removeKeys: [String(4 + 2 * index)], reason: 'Same product'
  }))
  const send = jest.fn(async () => providerResponse({ mode: 'list_review', duplicates, renames: [] }))
  const result = await reviewWithGroq('test-key', groceries, 'en', new AbortController().signal, send)

  expect(send).toHaveBeenCalledTimes(1)
  expect(result.duplicates).toHaveLength(12)
  expect(result.duplicates).toEqual(expect.arrayContaining([
    expect.objectContaining({ keepKey: 'milk-first', removeKeys: ['milk-second'] })
  ]))
  expect(result.duplicates[0].keepKey).toBe('milk-first')
  const proposedKeys = result.duplicates.flatMap(({ keepKey, removeKeys }) => [keepKey, ...removeKeys])
  expect(new Set(proposedKeys).size).toBe(proposedKeys.length)
})

it('keeps the purchased equivalent when the provider anchors on the open row', async () => {
  const groceries = [
    { key: 'tomato-open', item: 'עגבנייה', bought: false, list_name: null },
    { key: 'tomato-purchased', item: 'עגבניות', bought: true, list_name: null }
  ]
  const send = async () => providerResponse({
    mode: 'list_review', duplicates: [{ keepKey: '1', removeKeys: ['2'], reason: 'אותו מוצר' }], renames: []
  })
  const result = await reviewWithGroq('test-key', groceries, 'he', new AbortController().signal, send)
  expect(result.duplicates).toMatchObject([{ keepKey: 'tomato-purchased', removeKeys: ['tomato-open'] }])
})

it('breaks equal-status ties by stable grocery key when recorded times match or are absent', async () => {
  const groceries = [
    { key: 'z', item: 'Milk', bought: true, list_name: null },
    { key: 'a', item: 'Milk', bought: true, list_name: null }
  ]
  const send = async () => providerResponse({ mode: 'list_review', duplicates: [], renames: [] })
  const signal = new AbortController().signal
  const sameTime = Date.parse('2026-09-01T00:00:00Z')
  for (const [rows, history] of [[groceries, new Map()], [[...groceries].reverse(), new Map([['a', sameTime], ['z', sameTime]])]] as const) {
    const review = await reviewWithGroq('test-key', rows, 'en', signal, send, history)
    expect(review.duplicates).toEqual([{ keepKey: 'a', removeKeys: ['z'], reason: 'Broke the tie by grocery ID order' }])
  }
})

it('grounds spelling and language corrections to input keys and original names', async () => {
  const groceries = [
    { key: 'typo', item: ' Tomatos ', bought: false, list_name: null },
    { key: 'translation', item: 'חלב שיבולת שועל', bought: false, list_name: null },
    { key: 'unchanged', item: 'Whole milk', bought: false, list_name: null }
  ]
  const reason = 'Clarify the same grocery'
  const send = jest.fn(async (_url: string, _request: RequestInit) => providerResponse({
    mode: 'list_review', duplicates: [], renames: [
      { key: '1', currentName: 'Tomatos', suggestedName: 'Tomatoes', reason },
      { key: '2', currentName: 'חלב שיבולת שועל', suggestedName: 'Oat milk', reason },
      { key: '1', currentName: 'Tomatos', suggestedName: 'Tomato', reason },
      { key: '3', currentName: 'Whole milk', suggestedName: 'whole MILK', reason },
      { key: '3', currentName: 'Wrong source', suggestedName: 'Milk', reason },
      { key: '99', currentName: 'Whole milk', suggestedName: 'Milk', reason }
    ]
  }))
  const review = await reviewWithGroq('test-key', groceries, 'en', new AbortController().signal, send)
  const prompt = JSON.parse(String(send.mock.calls[0][1].body)).messages[0].content
  expect(prompt).toMatch(/clear spelling and language corrections only when the suggested name preserves the same product and its qualifiers/)
  expect(review.renames).toEqual([
    { key: 'typo', currentName: ' Tomatos ', suggestedName: 'Tomatoes', reason },
    { key: 'translation', currentName: 'חלב שיבולת שועל', suggestedName: 'Oat milk', reason }
  ])
})

it('matches the Hebrew tomato forms and keeps the purchased record when Groq misses the match', async () => {
  const groceries = [
    { key: 'open', item: 'עגבנייה', bought: false, list_name: null },
    { key: 'bought', item: 'עגבניות', bought: true, list_name: null },
    { key: 'cherry', item: 'עגבניות שרי', bought: true, list_name: null }
  ]
  const send = async () => providerResponse({ mode: 'list_review', duplicates: [], renames: [] })
  const result = await reviewWithGroq('test-key', groceries, 'he', new AbortController().signal, send)
  expect(result.duplicates).toEqual([{ keepKey: 'bought', removeKeys: ['open'], reason: 'הפריט שנרכש נשמר' }])
})

it('matches peach in different categories even at the end of a full review', async () => {
  const groceries = [
    { key: 'open', item: 'אפרסק', bought: false, list_name: null, category: 'אחר' },
    ...Array.from({ length: 297 }, (_, index) => ({
      key: `fixture-${index}`, item: `Fixture ${index}`, bought: false, list_name: null
    })),
    { key: 'qualified', item: 'אפרסק קפוא', bought: false, list_name: null, category: 'קפואים' },
    { key: 'purchased', item: 'אפרסקים', bought: true, list_name: null, category: 'פירות' }
  ]
  const send = jest.fn(async (_url: string, _options: RequestInit) =>
    providerResponse({ mode: 'list_review', duplicates: [], renames: [] }))
  const result = await reviewWithGroq('test-key', groceries, 'he', new AbortController().signal, send)
  expect(result.duplicates).toEqual([{ keepKey: 'purchased', removeKeys: ['open'], reason: 'הפריט שנרכש נשמר' }])
  expect(send).toHaveBeenCalledTimes(1)
  const payload = JSON.parse(String(send.mock.calls[0][1].body))
  expect(JSON.parse(payload.messages[1].content).items).toHaveLength(300)
})

it('keeps a known distinct-name match visible behind twelve ordinary duplicate groups', async () => {
  const groceries = [
    ...Array.from({ length: 24 }, (_, index) => ({
      key: `fixture-${index}`, item: `Fixture ${Math.floor(index / 2)}`, bought: false, list_name: null
    })),
    { key: 'open', item: 'אפרסק', bought: false, list_name: null, category: 'אחר' },
    { key: 'purchased', item: 'אפרסקים', bought: true, list_name: null, category: 'פירות' }
  ]
  const send = async () => providerResponse({ mode: 'list_review', duplicates: [], renames: [] })
  const result = await reviewWithGroq('test-key', groceries, 'he', new AbortController().signal, send)
  expect(result.duplicates).toHaveLength(12)
  expect(result.duplicates[0]).toMatchObject({ keepKey: 'purchased', removeKeys: ['open'] })
})
