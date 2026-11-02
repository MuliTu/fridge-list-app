import { act, renderHook, waitFor } from '@testing-library/react'
import { useCookingSession } from '../useCookingSession'
import type { GroceryItem, RecipeCandidate } from '../../types'

const mockApi = {
  getPendingRecipeSaves: jest.fn(),
  suggestRecipes: jest.fn(),
  saveRecipe: jest.fn()
}
const mockTranslate = (key: string) => key
jest.mock('../ListContext', () => ({ useListApi: () => mockApi }))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockTranslate, i18n: { language: 'en' } })
}))
const food = {
  key: 'tomato',
  item: 'Tomatoes',
  category: 'Vegetables',
  bought: true,
  quantity: 2,
  unit: 'pcs'
} as GroceryItem
const recipe = { id: 'salad', title: 'Salad' } as RecipeCandidate

beforeEach(() => {
  jest.clearAllMocks()
  mockApi.getPendingRecipeSaves.mockResolvedValue([])
  mockApi.suggestRecipes.mockResolvedValue({ recipes: [recipe] })
  mockApi.saveRecipe.mockResolvedValue({ key: 'saved' })
})

it('opens suggestions for review and does not save until explicitly requested', async () => {
  const { result } = renderHook(() => useCookingSession([food]))
  act(() => result.current.toggleProduct('tomato'))
  await act(async () => {
    await result.current.generate()
  })
  expect(result.current.reviewOpen).toBe(true)
  expect(result.current.recipes).toEqual([recipe])
  expect(mockApi.saveRecipe).not.toHaveBeenCalled()
  expect(mockApi.suggestRecipes).toHaveBeenCalledWith(
    expect.objectContaining({
      language: 'en',
      products: [expect.objectContaining({ groceryKey: 'tomato', name: 'Tomatoes' })]
    })
  )
  await act(async () => {
    await result.current.save(recipe)
  })
  expect(mockApi.saveRecipe).toHaveBeenCalledTimes(1)
  expect(result.current.reviewOpen).toBe(false)
})

it('ignores stale selections when a product is no longer available', async () => {
  const { result, rerender } = renderHook(({ products }) => useCookingSession(products), {
    initialProps: { products: [food] }
  })
  act(() => result.current.toggleProduct('tomato'))
  rerender({ products: [] })
  await act(async () => {
    await result.current.generate()
  })
  expect(mockApi.suggestRecipes).not.toHaveBeenCalled()
  expect(result.current.error).toBe('shoppingList:chef.selectAtLeastOne')
})

it('prevents duplicate requests while generation is pending and permits retry after failure', async () => {
  let reject: (error: Error) => void = () => {}
  mockApi.suggestRecipes.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail
      })
  )
  const { result } = renderHook(() => useCookingSession([food]))
  act(() => result.current.toggleProduct('tomato'))
  let request: Promise<void>
  act(() => {
    request = result.current.generate()
    result.current.generate()
  })
  expect(mockApi.suggestRecipes).toHaveBeenCalledTimes(1)
  await act(async () => {
    reject(new Error('Try again'))
    await request
  })
  expect(result.current.generating).toBe(false)
  expect(result.current.error).toBe('Try again')
  await act(async () => {
    await result.current.generate()
  })
  expect(result.current.reviewOpen).toBe(true)
})

it('keeps the review and recipe available when saving fails', async () => {
  mockApi.saveRecipe.mockRejectedValueOnce(new Error('Offline'))
  const { result } = renderHook(() => useCookingSession([food]))
  act(() => result.current.toggleProduct('tomato'))
  await act(async () => {
    await result.current.generate()
  })
  await act(async () => {
    await result.current.save(recipe)
  })
  expect(result.current.reviewOpen).toBe(true)
  expect(result.current.recipes).toEqual([recipe])
  expect(result.current.saveError).toBe('Offline')
  await act(async () => {
    await result.current.save(recipe)
  })
  expect(result.current.reviewOpen).toBe(false)
})

it('restores pending saves for explicit review without sending another save', async () => {
  mockApi.getPendingRecipeSaves.mockResolvedValue([recipe])
  const { result } = renderHook(() => useCookingSession([food]))
  await waitFor(() => expect(result.current.reviewOpen).toBe(true))
  expect(result.current.saveError).toBe('shoppingList:chef.pendingSave')
  expect(mockApi.saveRecipe).not.toHaveBeenCalled()
})
