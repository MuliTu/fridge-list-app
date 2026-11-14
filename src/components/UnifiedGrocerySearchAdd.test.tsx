import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { enrichItemsWithAi } from '../client/api/aiItemEnrichment'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import type { Category, GroceryItem } from '../types'
import { UnifiedGrocerySearchAdd } from './UnifiedGrocerySearchAdd'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { language: 'en' }
  })
}))

jest.mock('../client/api/aiItemEnrichment', () => ({
  enrichItemsWithAi: jest.fn()
}))

const categories: Category[] = [
  { key: 'other', name: 'Other', color: '#fff', icon: '📌', protected: true, order: 1 }
]

const milk: GroceryItem = {
  key: 'milk',
  item: 'Milk',
  category: 'Other',
  bought: false,
  added_at: '2026-01-01T00:00:00.000Z'
}

const purchasedMilk: GroceryItem = { ...milk, key: 'purchased-milk', bought: true }

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((done) => { resolve = done })
  return { promise, resolve }
}

const semanticResult = (
  classification: 'exact' | 'similar' | 'related' | 'distinct',
  status: 'ok' | 'provider_unavailable' | 'stale_request' | 'candidate_limit_exceeded' = 'ok'
) => ({
  status,
  evaluatedName: 'bread',
  snapshotId: 'a'.repeat(64),
  classification,
  matches: classification === 'distinct' ? [] : [{
    id: milk.key,
    name: milk.item,
    category: milk.category,
    bought: milk.bought,
    hidden: false,
    collapsed: false,
    matchType: classification === 'exact'
      ? 'exact' as const
      : classification === 'related'
        ? 'related' as const
        : 'similar' as const
  }],
  candidateCount: 1
})

const renderControl = (overrides: Partial<Parameters<typeof UnifiedGrocerySearchAdd>[0]> = {}) => {
  const props: Parameters<typeof UnifiedGrocerySearchAdd>[0] = {
    listId: 'list-1',
    entries: [],
    canEdit: true,
    addContext: { categories, onAdd: jest.fn() },
    onQueryChange: jest.fn(),
    onSemanticMatchesChange: jest.fn(),
    onMatch: jest.fn().mockResolvedValue({
      status: 'ok',
      evaluatedName: 'bread',
      snapshotId: 'a'.repeat(64),
      classification: 'distinct',
      matches: [],
      candidateCount: 0
    }),
    ...overrides
  }
  return { ...render(<UnifiedGrocerySearchAdd {...props} />), props }
}

describe('UnifiedGrocerySearchAdd', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [{ id: 'unified-add-0', correctedName: 'Bread', category: 'Other' }]
    })
  })

  it('publishes an exact active item for in-place filtering and does not render a result dropdown', async () => {
    const onSemanticMatchesChange = jest.fn()
    const onAdd = jest.fn()
    const user = userEvent.setup()
    renderControl({
      entries: [milk],
      localOnly: true,
      onSemanticMatchesChange,
      addContext: { categories, onAdd }
    })

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), ' milk ')

    await waitFor(() => expect(onSemanticMatchesChange).toHaveBeenLastCalledWith({
      listId: 'list-1',
      query: 'milk',
      matchIds: ['milk']
    }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(document.querySelector('.unified-grocery-results')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'shoppingList:unifiedAdd.showExisting' })).toBeDisabled()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('enables immediate creation without calling the semantic provider', async () => {
    const onMatch = jest.fn().mockRejectedValue(new Error('provider down'))
    const user = userEvent.setup()
    renderControl({ onMatch })

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'bread')
    expect(screen.getByRole('button', { name: 'shoppingList:quickAdd.button' })).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('shoppingList:unifiedAdd.notFound')
    expect(onMatch).not.toHaveBeenCalled()
  })

  it('adds immediately when the selected list has more than 100 candidates', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [{ id: 'unified-add-0', correctedName: 'New product', category: 'Other' }]
    })
    const onMatch = jest.fn()
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const entries = Array.from({ length: 101 }, (_, index) => ({
      ...milk, key: `item-${index}`, item: `item ${index}`
    }))
    const user = userEvent.setup()
    renderControl({ entries, onMatch, addContext: { categories, onAdd } })

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'new product{Enter}')
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('New product', 'Other'))
    expect(onMatch).not.toHaveBeenCalled()
  })

  it('adds the original item to Other when AI enrichment is unavailable', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockRejectedValueOnce(new Error('AI item assistant is temporarily unavailable'))
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const onAddCategory = jest.fn()
    const user = userEvent.setup()
    renderControl({ addContext: { categories, onAdd, onAddCategory } })

    const input = screen.getByLabelText('shoppingList:unifiedAdd.label')
    await user.type(input, 'לבבות דקל{enter}')

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('לבבות דקל', 'אחר'))
    expect(onAddCategory).not.toHaveBeenCalled()
  })

  it('keeps only failed and unconfirmed batch entries after an add failure', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [
        { id: 'unified-add-0', correctedName: 'Milk', category: 'Other' },
        { id: 'unified-add-1', correctedName: 'Bread', category: 'Other' },
        { id: 'unified-add-2', correctedName: 'Eggs', category: 'Other' }
      ]
    })
    const onAdd = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderControl({ addContext: { categories, onAdd } })
    const input = screen.getByLabelText('shoppingList:unifiedAdd.label')

    await user.type(input, 'milk, bread, eggs{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
    expect(input).toHaveValue('bread, eggs')
    expect(onAdd.mock.calls).toEqual([
      ['Milk', 'Other'],
      ['Bread', 'Other']
    ])
  })

  it('publishes a purchased exact item for the canonical list without allowing a duplicate add', async () => {
    const onSemanticMatchesChange = jest.fn()
    const onAdd = jest.fn()
    const user = userEvent.setup()
    renderControl({
      entries: [purchasedMilk],
      localOnly: true,
      onSemanticMatchesChange,
      addContext: { categories, onAdd }
    })

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'milk')

    await waitFor(() => expect(onSemanticMatchesChange).toHaveBeenLastCalledWith({
      listId: 'list-1',
      query: 'milk',
      matchIds: ['purchased-milk']
    }))
    expect(screen.getByRole('button', { name: 'shoppingList:unifiedAdd.showExisting' })).toBeDisabled()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it.each(['provider_unavailable', 'candidate_limit_exceeded'] as const)(
    'adds without consulting a semantic provider returning %s',
    async (status) => {
      const onAdd = jest.fn().mockResolvedValue(undefined)
      const onMatch = jest.fn().mockResolvedValue(semanticResult('distinct', status))
      const user = userEvent.setup()
      renderControl({ onMatch, addContext: { categories, onAdd } })

      await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'bread{Enter}')
      await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Bread', 'Other'))
      expect(onMatch).not.toHaveBeenCalled()
    }
  )

  it('does not write after a submitted batch becomes stale because the list changed', async () => {
    const enrichment = deferred<{ items: Array<{ id: string; correctedName: string; category: string }> }>()
    ;(enrichItemsWithAi as jest.Mock).mockReturnValue(enrichment.promise)
    const onAdd = jest.fn()
    const user = userEvent.setup()
    const rendered = renderControl({ addContext: { categories, onAdd } })

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'milk, bread{Enter}')
    rendered.rerender(<UnifiedGrocerySearchAdd {...rendered.props} listId="list-2" />)
    await act(async () => enrichment.resolve({ items: [
      { id: 'unified-add-0', correctedName: 'Milk', category: 'Other' },
      { id: 'unified-add-1', correctedName: 'Bread', category: 'Other' }
    ] }))

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('does not write after unmounting a submitted batch', async () => {
    const enrichment = deferred<{ items: Array<{ id: string; correctedName: string; category: string }> }>()
    ;(enrichItemsWithAi as jest.Mock).mockReturnValue(enrichment.promise)
    const onAdd = jest.fn()
    const user = userEvent.setup()
    const rendered = renderControl({ addContext: { categories, onAdd } })

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'milk, bread{Enter}')
    rendered.unmount()
    await act(async () => enrichment.resolve({ items: [
      { id: 'unified-add-0', correctedName: 'Milk', category: 'Other' },
      { id: 'unified-add-1', correctedName: 'Bread', category: 'Other' }
    ] }))

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('does not write when the query changes while batch enrichment is pending', async () => {
    const enrichment = deferred<{ items: Array<{ id: string; correctedName: string; category: string }> }>()
    ;(enrichItemsWithAi as jest.Mock).mockReturnValue(enrichment.promise)
    const onAdd = jest.fn()
    const user = userEvent.setup()
    renderControl({ addContext: { categories, onAdd } })
    const input = screen.getByLabelText('shoppingList:unifiedAdd.label')

    await user.type(input, 'milk, bread{Enter}')
    await waitFor(() => expect(enrichItemsWithAi).toHaveBeenCalledTimes(1))
    await user.clear(input)
    await user.type(input, 'eggs')
    await act(async () => enrichment.resolve({
      items: [
        { id: 'unified-add-0', correctedName: 'Milk', category: 'Other' },
        { id: 'unified-add-1', correctedName: 'Bread', category: 'Other' }
      ]
    }))

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('does not start another write after a submitted batch becomes stale mid-write', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [
        { id: 'unified-add-0', correctedName: 'Milk', category: 'Other' },
        { id: 'unified-add-1', correctedName: 'Bread', category: 'Other' }
      ]
    })
    const firstWrite = deferred<void>()
    const onAdd = jest.fn().mockReturnValueOnce(firstWrite.promise)
    const user = userEvent.setup()
    renderControl({ addContext: { categories, onAdd } })
    const input = screen.getByLabelText('shoppingList:unifiedAdd.label')

    await user.type(input, 'milk, bread{Enter}')
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    await user.clear(input)
    await user.type(input, 'eggs')
    await act(async () => firstWrite.resolve())

    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('uses deterministic local matching and addition without server or AI calls', async () => {
    const onMatch = jest.fn()
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderControl({ localOnly: true, onMatch, addContext: { categories, onAdd } })

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'bread')
    await user.click(await screen.findByRole('button', { name: 'shoppingList:quickAdd.button' }))

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('bread', OTHER_CATEGORY_NAME))
    expect(onMatch).not.toHaveBeenCalled()
    expect(enrichItemsWithAi).not.toHaveBeenCalled()
  })

  it('clears published semantic IDs when the query is cleared', async () => {
    const onSemanticMatchesChange = jest.fn()
    const user = userEvent.setup()
    renderControl({ entries: [milk], localOnly: true, onSemanticMatchesChange })
    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'mil')
    await waitFor(() => expect(onSemanticMatchesChange).toHaveBeenLastCalledWith({
      listId: 'list-1',
      query: 'mil',
      matchIds: ['milk']
    }))
    await user.clear(screen.getByLabelText('shoppingList:unifiedAdd.label'))

    await waitFor(() => expect(onSemanticMatchesChange).toHaveBeenLastCalledWith({
      listId: 'list-1',
      query: '',
      matchIds: []
    }))
  })
})
