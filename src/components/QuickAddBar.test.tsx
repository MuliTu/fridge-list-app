import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuickAddBar from './QuickAddBar'
import { enrichItemsWithAi } from '../client/api/aiItemEnrichment'
import type { Category } from '../types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

jest.mock('../client/api/aiItemEnrichment', () => ({
  enrichItemsWithAi: jest.fn()
}))

const categories: Category[] = [
  { key: 'dairy', name: 'מוצרי חלב', color: '#fff', icon: '🥛', protected: false, order: 1 },
  { key: 'other', name: 'אחר', color: '#fff', icon: '❓', protected: true, order: 2 }
]

describe('QuickAddBar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('submits a trimmed item on Enter and clears the input', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<QuickAddBar onAdd={onAdd} />)
    const input = screen.getByLabelText('shoppingList:quickAdd.label')

    await user.type(input, '  חלב{Enter}')

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('חלב'))
    expect(input).toHaveValue('')
  })

  it('adds comma-separated items in order and ignores blank segments', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<QuickAddBar onAdd={onAdd} />)

    await user.type(screen.getByLabelText('shoppingList:quickAdd.label'), ' , חלב,  לחם ,, ביצים, {Enter}')

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(3))
    expect(onAdd.mock.calls).toEqual([
      ['חלב'],
      ['לחם'],
      ['ביצים']
    ])
    expect(screen.getByLabelText('shoppingList:quickAdd.label')).toHaveValue('')
  })

  it('preserves repeated entries as separate add attempts', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<QuickAddBar onAdd={onAdd} />)

    await user.type(screen.getByLabelText('shoppingList:quickAdd.label'), 'חלב, חלב{Enter}')

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2))
    expect(onAdd.mock.calls).toEqual([['חלב'], ['חלב']])
  })

  it('does not submit an empty value', async () => {
    const onAdd = jest.fn()
    const user = userEvent.setup()
    render(<QuickAddBar onAdd={onAdd} />)

    await user.type(screen.getByLabelText('shoppingList:quickAdd.label'), '   {Enter}')
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('keeps the value and announces an error when adding fails', async () => {
    const onAdd = jest.fn().mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<QuickAddBar onAdd={onAdd} />)
    const input = screen.getByLabelText('shoppingList:quickAdd.label')

    await user.type(input, 'חלב{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
    expect(input).toHaveValue('חלב')
  })

  it('keeps only failed and unattempted entries after a partial failure', async () => {
    const onAdd = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<QuickAddBar onAdd={onAdd} />)
    const input = screen.getByLabelText('shoppingList:quickAdd.label')

    await user.type(input, 'חלב, לחם, ביצים{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
    expect(input).toHaveValue('לחם, ביצים')
    expect(onAdd.mock.calls).toEqual([['חלב'], ['לחם']])

    await user.type(input, '{Enter}')
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(4))
    expect(onAdd.mock.calls.slice(2)).toEqual([['לחם'], ['ביצים']])
  })

  it('rejects overlong items before writing', async () => {
    const onAdd = jest.fn()
    const user = userEvent.setup()
    render(<QuickAddBar onAdd={onAdd} />)

    await user.type(screen.getByLabelText('shoppingList:quickAdd.label'), `${'א'.repeat(101)}{Enter}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('shoppingList:quickAdd.itemTooLong')
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('rejects too many items before writing', async () => {
    const onAdd = jest.fn()
    render(<QuickAddBar onAdd={onAdd} />)
    const input = screen.getByLabelText('shoppingList:quickAdd.label')

    fireEvent.change(input, { target: { value: Array.from({ length: 101 }, (_, index) => `item-${index}`).join(',') } })
    fireEvent.submit(input.closest('form')!)

    expect(await screen.findByRole('alert')).toHaveTextContent('shoppingList:quickAdd.tooManyItems')
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('uses AI correction and category in one submit when checked', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [{
        id: 'quick-add-0', originalName: 'חללב', correctedName: 'חלב',
        category: 'מוצרי חלב', categoryStatus: 'existing', correctionReason: 'כתיב'
      }]
    })
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<QuickAddBar categories={categories} onAdd={onAdd} />)

    await user.type(screen.getByLabelText('shoppingList:quickAdd.label'), 'חללב')
    await user.click(screen.getByText('shoppingList:quickAdd.aiAssistant'))
    await user.click(screen.getByRole('button', { name: /shoppingList:quickAdd.button/ }))

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('חלב', 'מוצרי חלב'))
    expect(screen.getByLabelText('shoppingList:quickAdd.label')).toHaveValue('')
  })

  it('enriches a comma batch once and applies each result by stable id', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [
        { id: 'quick-add-1', originalName: 'לחמ', correctedName: 'לחם', category: 'מאפים', categoryStatus: 'suggested', correctionReason: 'כתיב' },
        { id: 'quick-add-0', originalName: 'חללב', correctedName: 'חלב', category: 'מוצרי חלב', categoryStatus: 'existing', correctionReason: 'כתיב' }
      ]
    })
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const onAddCategory = jest.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<QuickAddBar categories={categories} onAdd={onAdd} onAddCategory={onAddCategory} />)

    await user.type(screen.getByLabelText('shoppingList:quickAdd.label'), 'חללב, לחמ')
    await user.click(screen.getByText('shoppingList:quickAdd.aiAssistant'))
    await user.click(screen.getByRole('button', { name: /shoppingList:quickAdd.button/ }))

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2))
    expect(enrichItemsWithAi).toHaveBeenCalledTimes(1)
    expect(enrichItemsWithAi).toHaveBeenCalledWith(expect.objectContaining({
      items: [
        { id: 'quick-add-0', name: 'חללב' },
        { id: 'quick-add-1', name: 'לחמ' }
      ]
    }))
    expect(onAdd.mock.calls).toEqual([
      ['חלב', 'מוצרי חלב'],
      ['לחם', 'מאפים']
    ])
    expect(onAddCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'מאפים' }))
  })
})
