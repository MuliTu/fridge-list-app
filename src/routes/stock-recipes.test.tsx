import { act, fireEvent, render, screen } from '@testing-library/react'
import { Route as StockRoute } from './stock'
import { Route as RecipesRoute } from './recipes'

type Snapshot = { val(): unknown }
type Subscription = {
  ref: unknown
  next: (snapshot: Snapshot) => void
  cancel: (error: Error) => void
  unsubscribe: jest.Mock
}

const subscriptions: Subscription[] = []
const mockOnValue = jest.fn((ref: unknown, next: Subscription['next'], cancel: Subscription['cancel']) => {
  const unsubscribe = jest.fn()
  subscriptions.push({ ref, next, cancel, unsubscribe })
  return unsubscribe
})
let currentApi = { stockRef: { id: 'stock-a' }, recipesRef: { id: 'recipes-a' } }

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))
jest.mock('../lib/firebase', () => ({
  onValue: (ref: unknown, next: Subscription['next'], cancel: Subscription['cancel']) =>
    mockOnValue(ref, next, cancel)
}))
jest.mock('../hooks/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
jest.mock('../hooks/ListContext', () => ({
  useActiveList: () => ({ canEdit: false, activeList: { id: 'a' } }),
  useListApi: () => currentApi
}))
jest.mock('../hooks/DialogServiceContext', () => ({
  useDialogService: () => ({ confirm: jest.fn(), alert: jest.fn() })
}))
jest.mock('../hooks/useCategories', () => ({
  useCategories: () => ({ categories: [], categoryMap: new Map() })
}))
jest.mock('../hooks/useCollapsedSections', () => ({
  useCollapsedSections: () => ({ isCollapsed: () => false, toggle: jest.fn() })
}))
jest.mock('../components/StockItemModal', () => () => null)
jest.mock('../components/CookingStudio', () => ({ CookingStudio: () => null }))

const StockPage = StockRoute.options.component as React.ComponentType
const RecipesPage = RecipesRoute.options.component as React.ComponentType

beforeEach(() => {
  subscriptions.length = 0
  mockOnValue.mockClear()
  currentApi = { stockRef: { id: 'stock-a' }, recipesRef: { id: 'recipes-a' } }
})

afterEach(() => {
  jest.useRealTimers()
})

describe.each([
  ['stock', StockPage, 'stock:loadFailed', 'stock:retry', 'stockRef'],
  ['recipes', RecipesPage, 'recipes:loadFailed', 'recipes:retry', 'recipesRef']
] as const)('%s startup', (_route, Page, errorKey, retryKey, refKey) => {
  it('replaces a denied read with a safe retryable error and recovers on retry', () => {
    render(<Page />)
    expect(subscriptions).toHaveLength(1)
    act(() => subscriptions[0].cancel(new Error('permission_denied at /users/private/stock')))
    expect(screen.getByRole('alert')).toHaveTextContent(errorKey)
    expect(screen.getByRole('alert')).not.toHaveTextContent('/users/private')
    fireEvent.click(screen.getByRole('button', { name: retryKey }))
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1)
    expect(subscriptions).toHaveLength(2)
    act(() => subscriptions[1].next({ val: () => null }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('טוען...')).not.toBeInTheDocument()
  })

  it('times out an unavailable read, then ignores a superseded listener after retry', () => {
    jest.useFakeTimers()
    render(<Page />)
    act(() => jest.advanceTimersByTime(10_001))
    expect(screen.getByRole('alert')).toHaveTextContent(errorKey)
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: retryKey }))
    act(() => subscriptions[0].next({ val: () => ({ stale: { name: 'stale' } }) }))
    expect(screen.queryByText('stale')).not.toBeInTheDocument()
    act(() => subscriptions[1].next({ val: () => null }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('unsubscribes and clears old data when the active list changes', () => {
    const { rerender } = render(<Page />)
    act(() => subscriptions[0].next({ val: () => null }))
    currentApi = { stockRef: { id: 'stock-b' }, recipesRef: { id: 'recipes-b' } }
    rerender(<Page />)
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1)
    expect(subscriptions).toHaveLength(2)
    expect(subscriptions[1].ref).toBe(currentApi[refKey])
    act(() => subscriptions[0].cancel(new Error('stale household read')))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    act(() => subscriptions[1].next({ val: () => null }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
