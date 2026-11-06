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
    onOpenItem: jest.fn(),
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

  it('surfaces an exact active item and does not create it again', async () => {
    const onOpenItem = jest.fn()
    const onAdd = jest.fn()
    const user = userEvent.setup()
    renderControl({ entries: [milk], onOpenItem, addContext: { categories, onAdd } })

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), ' milk ')
    await user.click(screen.getByRole('button', { name: /unifiedAdd.showExisting/ }))

    expect(onOpenItem).toHaveBeenCalledWith(milk)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('keeps Add disabled while semantic matching is pending and enables explicit creation after a distinct result', async () => {
    const user = userEvent.setup()
    renderControl()

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'bread')
    expect(screen.getByRole('button', { name: 'shoppingList:quickAdd.button' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('shoppingList:unifiedAdd.checking')

    await waitFor(() => expect(screen.getByRole('button', { name: 'shoppingList:quickAdd.button' })).toBeEnabled())
    expect(screen.getByRole('status')).toHaveTextContent('shoppingList:unifiedAdd.notFound')
  })

  it('aborts an obsolete semantic request when the query changes', async () => {
    const signals: AbortSignal[] = []
    const onMatch = jest.fn((_listId: string, _query: string, signal?: AbortSignal) => {
      if (signal) signals.push(signal)
      return new Promise<never>(() => {})
    })
    const user = userEvent.setup()
    renderControl({ onMatch })
    const input = screen.getByLabelText('shoppingList:unifiedAdd.label')

    await user.type(input, 'milk')
    await waitFor(() => expect(onMatch).toHaveBeenCalledTimes(1))
    await user.clear(input)
    await user.type(input, 'bread')

    expect(signals[0].aborted).toBe(true)
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

  it('surfaces a purchased exact item without allowing a duplicate add', async () => {
    const onOpenItem = jest.fn()
    const onAdd = jest.fn()
    const user = userEvent.setup()
    renderControl({
      entries: [purchasedMilk],
      localOnly: true,
      onOpenItem,
      addContext: { categories, onAdd }
    })

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'milk')

    expect(screen.getByText('shoppingList:unifiedAdd.purchased')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'shoppingList:unifiedAdd.addDistinct' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Milk/ }))
    expect(onOpenItem).toHaveBeenCalledWith(purchasedMilk)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it.each(['similar', 'related'] as const)(
    'requires an explicit distinct action for a %s semantic match',
    async (classification) => {
      const onAdd = jest.fn().mockResolvedValue(undefined)
      const user = userEvent.setup()
      renderControl({
        onMatch: jest.fn().mockResolvedValue(semanticResult(classification)),
        addContext: { categories, onAdd }
      })

      await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'bread')
      const addDistinct = await screen.findByRole('button', {
        name: 'shoppingList:unifiedAdd.addDistinct'
      })
      await waitFor(() => expect(addDistinct).toBeEnabled())
      await user.click(addDistinct)

      await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Bread', 'Other'))
    }
  )

  it.each(['provider_unavailable', 'candidate_limit_exceeded'] as const)(
    'fails closed when semantic matching returns %s',
    async (status) => {
      const user = userEvent.setup()
      renderControl({ onMatch: jest.fn().mockResolvedValue(semanticResult('distinct', status)) })

      await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'bread')

      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
        'shoppingList:unifiedAdd.unavailable'
      ))
      expect(screen.getByRole('button', { name: 'shoppingList:quickAdd.button' })).toBeDisabled()
    }
  )

  it('ignores a late response from an older query', async () => {
    const first = deferred<ReturnType<typeof semanticResult>>()
    const second = deferred<ReturnType<typeof semanticResult>>()
    const onMatch = jest.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const user = userEvent.setup()
    renderControl({ onMatch })
    const input = screen.getByLabelText('shoppingList:unifiedAdd.label')

    await user.type(input, 'milk')
    await waitFor(() => expect(onMatch).toHaveBeenCalledTimes(1))
    await user.clear(input)
    await user.type(input, 'bread')
    await waitFor(() => expect(onMatch).toHaveBeenCalledTimes(2))
    await act(async () => first.resolve(semanticResult('distinct')))
    expect(screen.getByRole('status')).toHaveTextContent('shoppingList:unifiedAdd.checking')
    await act(async () => second.resolve(semanticResult('distinct')))
    expect(screen.getByRole('status')).toHaveTextContent('shoppingList:unifiedAdd.notFound')
  })

  it('does not write after a submitted batch becomes stale because the list changed', async () => {
    const match = deferred<ReturnType<typeof semanticResult>>()
    const onAdd = jest.fn()
    const user = userEvent.setup()
    const rendered = renderControl({
      onMatch: jest.fn().mockReturnValue(match.promise),
      addContext: { categories, onAdd }
    })

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'milk, bread{Enter}')
    rendered.rerender(<UnifiedGrocerySearchAdd {...rendered.props} listId="list-2" />)
    await act(async () => match.resolve(semanticResult('distinct')))

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('does not write after unmounting a submitted batch', async () => {
    const match = deferred<ReturnType<typeof semanticResult>>()
    const onAdd = jest.fn()
    const user = userEvent.setup()
    const rendered = renderControl({
      onMatch: jest.fn().mockReturnValue(match.promise),
      addContext: { categories, onAdd }
    })

    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'milk, bread{Enter}')
    rendered.unmount()
    await act(async () => match.resolve(semanticResult('distinct')))

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

  it('opens a matching result with keyboard activation', async () => {
    const onOpenItem = jest.fn()
    const user = userEvent.setup()
    renderControl({ entries: [milk], localOnly: true, onOpenItem })
    await user.type(screen.getByLabelText('shoppingList:unifiedAdd.label'), 'mil')
    const result = screen.getByRole('button', { name: /Milk/ })

    result.focus()
    await user.keyboard('{Enter}')

    expect(onOpenItem).toHaveBeenCalledWith(milk)
  })
})
