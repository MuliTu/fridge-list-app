import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { GroceryItem } from '../types'

const mockToggleCategory = jest.fn()
const mockTogglePurchased = jest.fn()
const mockSetBought = jest.fn().mockResolvedValue(undefined)
const mockSetActions = jest.fn()
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
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
    i18n: { language: 'en' }
  })
}))

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => ({}),
    useNavigate: () => jest.fn()
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
    user: { email: 'owner@example.com' },
    onSignIn: jest.fn()
  })
}))
jest.mock('../hooks/ListContext', () => ({
  useActiveList: () => ({
    canEdit: true,
    isOwner: false,
    activeList: { id: 'owner@example.com' }
  }),
  useListApi: () => ({
    setBought: mockSetBought,
    addGroceryItem: jest.fn(),
    addCategory: jest.fn(),
    updateGroceryItemUrgency: jest.fn(),
    updateGroceryItemCategory: jest.fn(),
    findStockItemByName: jest.fn().mockResolvedValue(null),
    deleteGroceryList: jest.fn()
  })
}))
jest.mock('../hooks/GroceriesFeedContext', () => ({
  useGroceriesFeed: () => ({ entries: mockEntries, isLoading: false })
}))
jest.mock('../hooks/DialogServiceContext', () => ({
  useDialogService: () => ({
    confirm: jest.fn(),
    prompt: jest.fn(),
    alert: jest.fn()
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
    isCollapsed: () => true,
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

jest.mock('../components/CategorySection', () => ({
  __esModule: true,
  default: ({
    name,
    collapsed,
    onToggle,
    children
  }: {
    name: string
    collapsed: boolean
    onToggle: () => void
    children: React.ReactNode
  }) => (
    <section aria-label={name} data-collapsed={String(collapsed)}>
      <button aria-label={`toggle-${name}`} onClick={onToggle}>toggle</button>
      {!collapsed && <ul>{children}</ul>}
    </section>
  )
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

jest.mock('../components/ListPicker', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/ShoppingListSort', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/ListSharingBar', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/SharedShoppingLists', () => ({
  __esModule: true,
  default: () => null,
  SharedShoppingListsNavigation: () => null
}))
jest.mock('../components/ItemDetailModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/GroceryItemModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/BulkUploadModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/RestockPrompt', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/ListSkeleton', () => ({ __esModule: true, default: () => null }))

import { ShoppingListPage } from './index'

const renderPage = () => render(<ShoppingListPage />)

describe('ShoppingListPage unified in-place filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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

    const section = screen.getByRole('region', { name: 'Bakery' })
    expect(section).toHaveAttribute('data-collapsed', 'false')
    expect(screen.getByTestId('canonical-row-bread')).toBeInTheDocument()
    expect(mockToggleCategory).not.toHaveBeenCalled()
  })

  it('reveals a semantic-only purchased match without mutating the purchased preference', async () => {
    renderPage()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'purchased' }))
    })

    const purchased = screen.getByRole('region', { name: /shoppingList:purchased.sectionLabel/ })
    expect(purchased).toHaveAttribute('data-collapsed', 'false')
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
