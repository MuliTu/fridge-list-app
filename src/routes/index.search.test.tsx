import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { GroceryItem } from '../types'

const mockToggleCategory = jest.fn()
const mockTogglePurchased = jest.fn()
const mockSetBought = jest.fn().mockResolvedValue(undefined)
const mockSetActions = jest.fn()
const mockNavigate = jest.fn()
const mockConfirm = jest.fn()
const mockAlert = jest.fn()
const mockDeleteCustomList = jest.fn()
const mockLegacyDeleteGroceryList = jest.fn()
let mockSearch: { list?: string } = {}
let mockIsOwner = false
let mockCanEdit = true
let mockHousehold: { id: string } | null = { id: 'owner@example.com' }
let mockUser: { email: string } | null = { email: 'owner@example.com' }
let mockLanguage = 'en'
let mockCollapsed = true
const mockEntries: GroceryItem[] = [
  {
    key: 'milk',
    item: 'Milk',
    category: 'Dairy',
    bought: false,
    urgency: 'urgent',
    added_at: '2026-01-01T00:00:00.000Z'
  },
  {
    key: 'bread',
    item: 'Bread',
    category: 'Bakery',
    bought: false,
    added_at: '2026-01-01T00:00:00.000Z'
  },
  {
    key: 'eggs',
    item: 'Eggs',
    category: 'Dairy',
    bought: true,
    added_at: '2026-01-01T00:00:00.000Z'
  }
]

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'shoppingList:deleteListConfirm') {
        return mockLanguage === 'he'
          ? `למחוק את הרשימה "${options?.listName}" וכל ${options?.count} הפריטים בה? לא ניתן לשחזר.`
          : `Delete the list "${options?.listName}" and all ${options?.count} items in it? This cannot be undone.`
      }
      return options ? `${key}:${JSON.stringify(options)}` : key
    },
    i18n: { language: mockLanguage }
  })
}))

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => mockSearch,
    useNavigate: () => mockNavigate
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#test">{children}</a>
}))

jest.mock('../hooks/BehaviorSettingsContext', () => ({
  useBehaviorSettings: () => ({
    settings: {
      showUrgent: false,
      showCountdown: false,
      purchaseGesture: 'tap',
      listPresentation: 'categories',
      showChef: false
    }
  })
}))
jest.mock('../hooks/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    onSignIn: jest.fn()
  })
}))
jest.mock('../hooks/ListContext', () => ({
  useActiveList: () => ({
    canEdit: mockCanEdit,
    isOwner: mockIsOwner,
    activeList: mockHousehold
  }),
  useListApi: () => ({
    setBought: mockSetBought,
    addGroceryItem: jest.fn(),
    addCategory: jest.fn(),
    updateGroceryItemUrgency: jest.fn(),
    updateGroceryItemCategory: jest.fn(),
    findStockItemByName: jest.fn().mockResolvedValue(null),
    deleteGroceryList: mockLegacyDeleteGroceryList
  })
}))
jest.mock('../hooks/GroceriesFeedContext', () => ({
  useGroceriesFeed: () => ({ entries: mockEntries, isLoading: false })
}))
jest.mock('../hooks/DialogServiceContext', () => ({
  useDialogService: () => ({
    confirm: mockConfirm,
    prompt: jest.fn(),
    alert: mockAlert
  })
}))
jest.mock('../hooks/ListPickerActionsContext', () => ({
  useListPickerActions: () => ({ setActions: mockSetActions })
}))
jest.mock('../hooks/BoughtItemsPreferenceContext', () => ({
  useBoughtItemsPreference: () => ({ keepBoughtItemsInCategories: false })
}))
jest.mock('../hooks/useCategories', () => ({
  useCategories: () => {
    const categories = [
      { key: 'dairy', name: 'Dairy', color: '#fff', icon: '🥛', order: 1 },
      { key: 'bakery', name: 'Bakery', color: '#fff', icon: '🍞', order: 2 }
    ]
    return {
      categories,
      categoryMap: new Map(categories.map((category) => [category.name, category]))
    }
  }
}))
jest.mock('../hooks/useCollapsedSections', () => ({
  useCollapsedSections: () => ({
    isCollapsed: () => mockCollapsed,
    toggle: mockToggleCategory
  })
}))
jest.mock('../hooks/useShowPurchased', () => ({
  useShowPurchased: () => ({
    showPurchased: false,
    toggle: mockTogglePurchased
  })
}))
jest.mock('../hooks/useListSort', () => ({
  useListSort: () => ({ sortOption: 'date', setSortOption: jest.fn() })
}))
jest.mock('../hooks/useStockSuggestion', () => ({
  isStockSuggestionEnabled: () => false
}))
jest.mock('../lib/firebase', () => ({
  categorizeItem: jest.fn(),
  getCurrentUserIdToken: jest.fn(),
  sanitizeEmailKey: (value: string) => value.replace(/[@.]/g, '_')
}))
jest.mock('../client/api/groceries', () => ({
  createGroceryApiClient: () => ({ match: jest.fn() })
}))
jest.mock('../client/api/listManagement', () => ({
  createListManagementApiClient: () => ({ deleteCustomList: mockDeleteCustomList })
}))

jest.mock('../components/UnifiedGrocerySearchAdd', () => ({
  UnifiedGrocerySearchAdd: ({
    listId,
    onQueryChange,
    onSemanticMatchesChange
  }: {
    listId: string
    onQueryChange: (query: string) => void
    onSemanticMatchesChange: (filter: { listId: string; query: string; matchIds: string[] }) => void
  }) => {
    const apply = (query: string, matchIds: string[]) => {
      onQueryChange(query)
      onSemanticMatchesChange({ listId, query, matchIds })
    }
    return (
      <div data-testid="unified-search">
        <button onClick={() => apply('mil', [])}>partial</button>
        <button onClick={() => apply('milk', ['milk'])}>exact</button>
        <button onClick={() => apply('loaf', ['bread'])}>similar</button>
        <button onClick={() => apply('staple', ['bread'])}>related</button>
        <button onClick={() => apply('protein', ['eggs'])}>purchased</button>
      </div>
    )
  }
}))

jest.mock('../components/ShoppingListItemRow', () => ({
  __esModule: true,
  default: ({
    entry,
    onCheckedChange,
    onEditClick
  }: {
    entry: GroceryItem
    onCheckedChange: () => void
    onEditClick: () => void
  }) => (
    <li data-testid={`canonical-row-${entry.key}`}>
      <span>{entry.item}</span>
      <button aria-label={`state-${entry.key}`} onClick={onCheckedChange}>state</button>
      <button aria-label={`edit-${entry.key}`} onClick={onEditClick}>edit</button>
    </li>
  )
}))

jest.mock('../components/ListPicker', () => ({
  __esModule: true,
  default: ({ activeList, customLists }: { activeList: string | null; customLists: string[] }) => (
    <div data-testid="list-picker" data-active-list={activeList ?? 'permanent'}>
      {customLists.map((name) => <span key={name}>{name}</span>)}
    </div>
  )
}))
jest.mock('../components/ShoppingListSort', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/ListSharingBar', () => ({
  __esModule: true,
  default: ({ listName }: { listName: string | null }) => (
    <div data-testid="list-owner-context" data-list-name={listName ?? 'permanent'} />
  )
}))
jest.mock('../components/SharedShoppingLists', () => ({
  __esModule: true,
  default: () => null,
  SharedShoppingListsNavigation: () => null
}))
jest.mock('../components/ItemDetailModal', () => ({
  __esModule: true,
  default: ({ entry }: { entry: GroceryItem }) => <div data-testid="selected-entry">{entry.item}</div>
}))
jest.mock('../components/GroceryItemModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/BulkUploadModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/RestockPrompt', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/ListSkeleton', () => ({ __esModule: true, default: () => null }))

import { ShoppingListPage } from './index'
import { ListPickerManagementActions } from '../components/ListPickerManagementActions'
import type { ListPickerActions } from '../hooks/ListPickerActionsContext'

const renderPage = () => render(<ShoppingListPage />)

describe('ShoppingListPage unified in-place filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSearch = {}
    mockIsOwner = false
    mockCanEdit = true
    mockHousehold = { id: 'owner@example.com' }
    mockUser = { email: 'owner@example.com' }
    mockLanguage = 'en'
    mockCollapsed = true
  })

  it.each([
    ['partial', 'milk'],
    ['exact', 'milk'],
    ['similar', 'bread'],
    ['related', 'bread']
  ])('renders the canonical active row for a %s match with no duplicate results UI', async (control, key) => {
    renderPage()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: control }))
    })

    expect(screen.getByTestId(`canonical-row-${key}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`canonical-row-${key === 'milk' ? 'bread' : 'milk'}`)).not.toBeInTheDocument()
    expect(document.querySelector('.unified-grocery-results')).not.toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('reveals a semantic-only match inside a collapsed category without mutating its preference', async () => {
    renderPage()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'similar' }))
    })

    const section = screen.getByRole('button', { name: /^Bakery/ })
    expect(section).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('canonical-row-bread')).toBeInTheDocument()
    expect(mockToggleCategory).not.toHaveBeenCalled()
  })

  it('reveals a semantic-only purchased match without mutating the purchased preference', async () => {
    renderPage()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'purchased' }))
    })

    const purchased = screen.getByRole('button', { name: /shoppingList:purchased.sectionLabel/ })
    expect(purchased).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('canonical-row-eggs')).toBeInTheDocument()
    expect(mockTogglePurchased).not.toHaveBeenCalled()
  })

  it('keeps canonical row state and edit actions available after filtering', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'exact' }))

    fireEvent.click(screen.getByRole('button', { name: 'state-milk' }))
    await waitFor(() => expect(mockSetBought).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'milk' }),
      true,
      expect.objectContaining({ email: 'owner@example.com' })
    ))
    expect(screen.getByRole('button', { name: 'edit-milk' })).toBeEnabled()
  })
})

describe('ShoppingListPage verified custom-list deletion', () => {
  const tripEntries: GroceryItem[] = [
    { ...mockEntries[0], key: 'trip-milk', list_name: 'Weekend trip' },
    { ...mockEntries[1], key: 'trip-bread', list_name: 'Weekend trip' }
  ]

  const renderEligiblePage = async () => {
    mockSearch = { list: 'Weekend trip' }
    mockIsOwner = true
    mockEntries.splice(0, mockEntries.length, ...tripEntries)
    const view = renderPage()
    await waitFor(() => expect(mockSetActions).toHaveBeenCalled())
    return {
      view,
      actions: mockSetActions.mock.calls.at(-1)?.[0] as {
        canDeleteList: boolean
        deletePending: boolean
        onDeleteList: () => Promise<void>
      }
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockSearch = {}
    mockIsOwner = false
    mockCanEdit = true
    mockHousehold = { id: 'owner@example.com' }
    mockUser = { email: 'owner@example.com' }
    mockLanguage = 'en'
    mockCollapsed = true
  })

  afterEach(() => {
    mockEntries.splice(0, mockEntries.length,
      { key: 'milk', item: 'Milk', category: 'Dairy', bought: false, urgency: 'urgent', added_at: '2026-01-01T00:00:00.000Z' },
      { key: 'bread', item: 'Bread', category: 'Bakery', bought: false, added_at: '2026-01-01T00:00:00.000Z' },
      { key: 'eggs', item: 'Eggs', category: 'Dairy', bought: true, added_at: '2026-01-01T00:00:00.000Z' }
    )
  })

  it.each([
    ['owner, last custom list with permanent fallback', true, true, true, true],
    ['shared editor', false, true, true, false],
    ['signed-out actor', true, false, true, false],
    ['unrelated actor without a household', true, true, false, false],
    ['permanent list', true, true, true, false]
  ])('presents deletion correctly for %s', async (_case, owner, signedIn, household, expected) => {
    mockIsOwner = owner
    mockUser = signedIn ? { email: 'owner@example.com' } : null
    mockHousehold = household ? { id: 'owner@example.com' } : null
    mockSearch = { list: _case === 'permanent list' ? undefined : 'Weekend trip' }
    mockEntries.splice(0, mockEntries.length, ...tripEntries)
    renderPage()
    await waitFor(() => expect(mockSetActions).toHaveBeenCalled())
    const actions = mockSetActions.mock.calls.at(-1)?.[0] as ListPickerActions
    render(
      <ListPickerManagementActions
        actions={actions}
        itemClassName="item"
        sectionLabelClassName="label"
        dividerClassName="divider"
        runAfterSidebarCloses={(action) => action()}
      />
    )
    expect(actions.canDeleteList).toBe(expected)
    expect(Boolean(screen.queryByRole('button', { name: 'shoppingList:listPicker.deleteList' }))).toBe(expected)
    if (_case === 'shared editor') expect(actions.canEdit).toBe(true)
  })

  it('hides deletion in the sidebar when no selectable fallback remains', () => {
    const actions: ListPickerActions = {
      canEdit: true,
      canDeleteList: false,
      deletePending: false,
      hasUnbought: false,
      onCreateList: jest.fn(),
      onDeleteList: jest.fn(),
      onShareMissing: jest.fn(),
      onBulkUpload: jest.fn()
    }
    render(
      <ListPickerManagementActions
        actions={actions}
        itemClassName="item"
        sectionLabelClassName="label"
        dividerClassName="divider"
        runAfterSidebarCloses={(action) => action()}
      />
    )
    expect(screen.queryByRole('button', { name: 'shoppingList:listPicker.deleteList' })).not.toBeInTheDocument()
  })

  it.each([
    ['en', 'Delete the list "Weekend trip" and all 2 items'],
    ['he', 'למחוק את הרשימה "Weekend trip" וכל 2 הפריטים']
  ])('identifies the list and item count in the %s confirmation', async (language, expected) => {
    mockLanguage = language
    mockConfirm.mockResolvedValue(false)
    const { actions } = await renderEligiblePage()

    await act(() => actions.onDeleteList())

    expect(actions.canDeleteList).toBe(true)
    expect(mockConfirm).toHaveBeenCalledWith(expect.stringContaining(expected))
    expect(mockDeleteCustomList).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('allows only one request while a confirmed deletion is pending', async () => {
    let resolveDeletion!: (value: { deletedItems: number }) => void
    mockConfirm.mockResolvedValue(true)
    mockDeleteCustomList.mockReturnValue(new Promise((resolve) => { resolveDeletion = resolve }))
    const { actions } = await renderEligiblePage()

    const first = actions.onDeleteList()
    const second = actions.onDeleteList()
    await waitFor(() => expect(mockDeleteCustomList).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockSetActions.mock.calls.at(-1)?.[0].deletePending).toBe(true))
    render(
      <ListPickerManagementActions
        actions={mockSetActions.mock.calls.at(-1)?.[0] as ListPickerActions}
        itemClassName="item"
        sectionLabelClassName="label"
        dividerClassName="divider"
        runAfterSidebarCloses={(action) => action()}
      />
    )
    expect(screen.getByRole('button', { name: 'shoppingList:listPicker.deletingList' })).toBeDisabled()

    resolveDeletion({ deletedItems: 2 })
    await act(async () => { await Promise.all([first, second]) })
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  it('preserves the active view and exposes a recoverable error when deletion fails', async () => {
    mockConfirm.mockResolvedValue(true)
    mockDeleteCustomList.mockRejectedValue(new Error('network unavailable'))
    mockAlert.mockResolvedValue(undefined)
    const { actions } = await renderEligiblePage()

    await act(() => actions.onDeleteList())

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockLegacyDeleteGroceryList).not.toHaveBeenCalled()
    expect(mockAlert).toHaveBeenCalledWith('shoppingList:deleteListFailed')
    expect(screen.getByRole('button', { name: /^Dairy/ })).toBeInTheDocument()
    expect(mockSetActions.mock.calls.at(-1)?.[0].canDeleteList).toBe(true)
    await waitFor(() => expect(mockSetActions.mock.calls.at(-1)?.[0].deletePending).toBe(false))
  })

  it('removes deleted list, selection, owner context, and items before the realtime feed refreshes', async () => {
    mockConfirm.mockResolvedValue(true)
    mockDeleteCustomList.mockResolvedValue({ deletedItems: 2 })
    mockCollapsed = false
    const { actions, view } = await renderEligiblePage()
    fireEvent.click(screen.getByRole('button', { name: 'edit-trip-milk' }))
    expect(screen.getByTestId('selected-entry')).toHaveTextContent('Milk')
    expect(screen.getByTestId('list-picker')).toHaveAttribute('data-active-list', 'Weekend trip')
    expect(screen.getByTestId('list-owner-context')).toHaveAttribute('data-list-name', 'Weekend trip')

    await act(() => actions.onDeleteList())

    expect(mockDeleteCustomList).toHaveBeenCalledWith('owner_example_com', 'Weekend trip')
    expect(mockLegacyDeleteGroceryList).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({ search: { list: undefined } })
    // The feed deliberately still contains the deleted rows. The UI must not
    // display them or offer the deleted list while awaiting its next snapshot.
    expect(mockEntries).toHaveLength(2)
    expect(screen.getByTestId('list-picker')).toHaveAttribute('data-active-list', 'permanent')
    expect(screen.getByTestId('list-picker')).not.toHaveTextContent('Weekend trip')
    expect(screen.getByTestId('list-owner-context')).toHaveAttribute('data-list-name', 'permanent')
    expect(screen.queryByTestId('selected-entry')).not.toBeInTheDocument()
    expect(screen.queryByTestId('canonical-row-trip-milk')).not.toBeInTheDocument()
    expect(screen.queryByTestId('canonical-row-trip-bread')).not.toBeInTheDocument()

    mockSearch = {}
    mockEntries.splice(0, mockEntries.length)
    view.rerender(<ShoppingListPage />)
    expect(screen.getByTestId('list-picker')).toHaveAttribute('data-active-list', 'permanent')
    expect(screen.getByTestId('list-picker')).not.toHaveTextContent('Weekend trip')
  })
})
