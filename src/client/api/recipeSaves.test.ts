import { clearPendingRecipeSaves, createRecipeSaveClient } from './recipeSaves'
import type { RecipeCandidate } from '../../types'

const recipe: RecipeCandidate = {
  id: 'demo-recipe', title: 'Demo salad', description: 'Synthetic recipe', servings: 1,
  mealType: 'lunch', estimatedTimeMinutes: 10,
  selectedProducts: [{ groceryKey: 'tomato', name: 'tomatoes', category: 'Vegetables' }],
  assumedBasics: [], ingredients: [{ name: 'tomatoes', quantity: null, fromSelectedProducts: true, pantryBasic: false }],
  steps: ['Rinse and chop.'], nutrition: { calories: null, proteinGrams: null, fatGrams: null },
  image: { url: null, alt: 'No photo' }, source: { kind: 'personal_chef', graphRunId: 'demo-run' }
}
const options = (fetcher: any, uid = 'user-a') => ({
  identity: async () => ({ uid, token: `synthetic-${uid}` }), storage: () => localStorage,
  fetch: fetcher, uuid: () => '00000000-0000-4000-8000-000000000001'
})
beforeEach(() => localStorage.clear())

it('restores an uncertain save across client recreation and replays the same operation explicitly', async () => {
  const lost = jest.fn().mockRejectedValue(new Error('response lost'))
  await expect(createRecipeSaveClient(options(lost)).save('list', recipe)).rejects.toThrow('response lost')
  const recoveredFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ key: 'saved-record' }) })
  const recreated = createRecipeSaveClient(options(recoveredFetch))
  expect(await recreated.pending('list')).toHaveLength(1)
  expect(recoveredFetch).not.toHaveBeenCalled()
  await expect(recreated.save('list', recipe)).resolves.toEqual({ key: 'saved-record' })
  expect(JSON.parse(recoveredFetch.mock.calls[0][1].body).operationId).toBe(JSON.parse(lost.mock.calls[0][1].body).operationId)
  expect(await recreated.pending('list')).toEqual([])
})

it('scopes pending drafts by UID and household and clears them on sign out', async () => {
  const fetcher = jest.fn().mockRejectedValue(new Error('offline'))
  await expect(createRecipeSaveClient(options(fetcher)).save('list', recipe)).rejects.toThrow()
  expect(await createRecipeSaveClient(options(fetcher, 'user-b')).pending('list')).toEqual([])
  expect(await createRecipeSaveClient(options(fetcher)).pending('other')).toEqual([])
  clearPendingRecipeSaves(localStorage)
  expect(await createRecipeSaveClient(options(fetcher)).pending('list')).toEqual([])
})

it('does not send a changed payload under a pending operation', async () => {
  const fetcher = jest.fn().mockRejectedValue(new Error('offline'))
  const client = createRecipeSaveClient(options(fetcher))
  await expect(client.save('list', recipe)).rejects.toThrow()
  await expect(client.save('list', { ...recipe, title: 'Different' })).rejects.toThrow('different recipe data')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('does not send a save if durable local storage is unavailable', async () => {
  const fetcher = jest.fn()
  const client = createRecipeSaveClient({ ...options(fetcher), storage: () => { throw new Error('storage unavailable') } })
  await expect(client.save('list', recipe)).rejects.toThrow('storage unavailable')
  expect(fetcher).not.toHaveBeenCalled()
})
