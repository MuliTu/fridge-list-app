import { reviewAllItems } from './reviewAllItems'
import { retrieveAiContext, type RetrievedAiContext } from './aiRetrieval'

const context = (count: number): RetrievedAiContext => ({
  mode: 'list_review', language: 'he', householdName: 'Home',
  categories: ['Other'], changes: [], purchases: [], ignoredCorrectionCount: 0,
  items: Array.from({ length: count }, (_, i) => ({
    key: String(i), name: `product ${i}`, category: 'Other', bought: false,
    listName: null, addedAt: '2026-11-06T00:00:00Z', modifiedAt: null
  }))
})
const response = (keys: string[]) => ({
  mode: 'list_review', reviewedKeys: keys, duplicates: [],
  renames: keys.map((key) => ({ key, currentName: `product ${key}`, suggestedName: `corrected ${key}`, reason: 'spelling' }))
})

it('reviews all 300 items and returns more than 15 changes in one result', async () => {
  const input = context(300)
  const retrieved = retrieveAiContext(input)
  expect(retrieved.items).toHaveLength(300)
  const review = jest.fn(async (keys: string[]) => response(keys))
  const result = await reviewAllItems(retrieved, review)
  expect(review).toHaveBeenCalledTimes(12)
  expect(result.renames).toHaveLength(300)
  expect(new Set(review.mock.calls.flatMap(([keys]) => keys)).size).toBe(300)
})

it('retries an incomplete batch and fails rather than returning partial coverage', async () => {
  const review = jest.fn(async () => response(['0']))
  await expect(reviewAllItems(context(3), review)).rejects.toThrow('did not cover every')
  expect(review).toHaveBeenCalledTimes(2)
})

it('accepts a complete retry and includes its suggestions', async () => {
  const review = jest.fn().mockResolvedValueOnce(response(['0']))
    .mockResolvedValueOnce(response(['0', '1', '2']))
  expect((await reviewAllItems(context(3), review)).renames).toHaveLength(3)
})

it('merges cross-batch duplicate groups with one stable keeper and excludes removed-item renames', async () => {
  const input = context(51)
  const result = await reviewAllItems(input, async (keys) => ({
    ...response(keys),
    duplicates: keys.includes('25')
      ? [{ keepKey: '0', removeKeys: ['25'], reason: 'same product' }]
      : keys.includes('50')
        ? [{ keepKey: '25', removeKeys: ['50'], reason: 'same product' }]
        : []
  }))
  expect(result.duplicates).toEqual([{ keepKey: '0', removeKeys: ['25', '50'], reason: 'same product' }])
  expect(result.renames.some(({ key }) => key === '25' || key === '50')).toBe(false)
})

it('does not merge products from different lists', async () => {
  const input = context(2)
  input.items[1].listName = 'Trip'
  const result = await reviewAllItems(input, async (keys) => ({
    ...response(keys), duplicates: [{ keepKey: '0', removeKeys: ['1'], reason: 'same name' }]
  }))
  expect(result.duplicates).toEqual([])
})

it('returns an empty review without model calls for an empty list', async () => {
  const review = jest.fn()
  expect(await reviewAllItems(context(0), review)).toEqual({ mode: 'list_review', duplicates: [], renames: [] })
  expect(review).not.toHaveBeenCalled()
})

it('keeps model concurrency at three and forwards cancellation', async () => {
  let active = 0
  let maximum = 0
  await reviewAllItems(context(100), async (keys, signal) => {
    expect(signal.aborted).toBe(false)
    maximum = Math.max(maximum, ++active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active--
    return response(keys)
  })
  expect(maximum).toBe(3)
  const controller = new AbortController()
  controller.abort()
  const review = jest.fn()
  await expect(reviewAllItems(context(30), review, controller.signal)).rejects.toThrow()
  expect(review).not.toHaveBeenCalled()
})
