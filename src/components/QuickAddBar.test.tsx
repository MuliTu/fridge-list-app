import { render, screen, waitFor } from '@testing-library/react'
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
  it('submits a trimmed item on Enter and clears the input', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<QuickAddBar onAdd={onAdd} />)
    const input = screen.getByLabelText('shoppingList:quickAdd.label')

    await user.type(input, '  חלב{Enter}')

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('חלב'))
    expect(input).toHaveValue('')
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

  it('uses AI correction and category in one submit when checked', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [{
        id: 'quick-add-item', originalName: 'חללב', correctedName: 'חלב',
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
})
