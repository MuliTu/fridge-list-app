import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroceryItemModal from './GroceryItemModal'
import { categorizeItem } from '../lib/firebase'
import { enrichItemsWithAi } from '../client/api/aiItemEnrichment'
import type { Category } from '../types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

jest.mock('../lib/firebase', () => ({
  categorizeItem: jest.fn()
}))

jest.mock('../client/api/aiItemEnrichment', () => ({
  enrichItemsWithAi: jest.fn()
}))

const categories: Category[] = [
  { key: 'dairy', name: 'מוצרי חלב', color: '#fff', icon: '🥛', protected: false, order: 1 },
  { key: 'other', name: 'אחר', color: '#fff', icon: '❓', protected: true, order: 2 }
]

describe('GroceryItemModal quantity/unit', () => {
  beforeEach(() => {
    ;(categorizeItem as jest.Mock).mockReset()
  })

  it('adds the item with no quantity/unit when neither is filled in', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([{ item: 'חלב', category: 'מוצרי חלב' }])
    const user = userEvent.setup()
    const onAdd = jest.fn(() => Promise.resolve())
    render(<GroceryItemModal listName={null} onClose={jest.fn()} onAdd={onAdd} />)

    await user.type(screen.getByPlaceholderText('common:groceryItem.namePlaceholder'), 'חלב')
    await user.click(screen.getByRole('button', { name: 'common:actions.add' }))

    expect(onAdd).toHaveBeenCalledWith({ name: 'חלב', category: 'מוצרי חלב', quantity: null, unit: null })
  })

  it('adds the item with a quantity and no unit', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([{ item: 'תפוחים', category: 'פירות' }])
    const user = userEvent.setup()
    const onAdd = jest.fn(() => Promise.resolve())
    render(<GroceryItemModal listName={null} onClose={jest.fn()} onAdd={onAdd} />)

    await user.type(screen.getByPlaceholderText('common:groceryItem.namePlaceholder'), 'תפוחים')
    await user.type(screen.getByRole('spinbutton'), '5')
    await user.click(screen.getByRole('button', { name: 'common:actions.add' }))

    expect(onAdd).toHaveBeenCalledWith({ name: 'תפוחים', category: 'פירות', quantity: 5, unit: null })
  })

  it('shows a validation error and does not add when quantity is non-numeric', async () => {
    const user = userEvent.setup()
    const onAdd = jest.fn()
    render(<GroceryItemModal listName={null} onClose={jest.fn()} onAdd={onAdd} />)

    await user.type(screen.getByPlaceholderText('common:groceryItem.namePlaceholder'), 'לחם')
    await user.type(screen.getByRole('spinbutton'), '-1')
    await user.click(screen.getByRole('button', { name: 'common:actions.add' }))

    expect(screen.getByText('common:quantityUnit.invalidQuantity')).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
    expect(categorizeItem).not.toHaveBeenCalled()
  })
})

describe('GroceryItemModal initialName', () => {
  beforeEach(() => {
    ;(categorizeItem as jest.Mock).mockReset()
  })

  it('leaves the name field empty when initialName is not provided (unchanged FAB-triggered behavior)', () => {
    render(<GroceryItemModal listName={null} onClose={jest.fn()} onAdd={jest.fn()} />)
    expect(screen.getByPlaceholderText('common:groceryItem.namePlaceholder')).toHaveValue('')
  })

  it('pre-fills the name field with initialName when provided', () => {
    render(<GroceryItemModal listName={null} initialName="banana" onClose={jest.fn()} onAdd={jest.fn()} />)
    expect(screen.getByPlaceholderText('common:groceryItem.namePlaceholder')).toHaveValue('banana')
  })

  it('adds the pre-filled name through the normal categorize flow when confirmed unedited', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([{ item: 'banana', category: 'פירות' }])
    const user = userEvent.setup()
    const onAdd = jest.fn(() => Promise.resolve())
    render(<GroceryItemModal listName={null} initialName="banana" onClose={jest.fn()} onAdd={onAdd} />)

    await user.click(screen.getByRole('button', { name: 'common:actions.add' }))

    expect(categorizeItem).toHaveBeenCalledWith('banana')
    expect(onAdd).toHaveBeenCalledWith({ name: 'banana', category: 'פירות', quantity: null, unit: null })
  })
})

describe('GroceryItemModal AI assistant', () => {
  beforeEach(() => {
    ;(enrichItemsWithAi as jest.Mock).mockReset()
  })

  it('corrects, categorizes, and adds in one submit', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [{
        id: 'single-item',
        originalName: 'חללב',
        correctedName: 'חלב',
        category: 'מוצרי חלב',
        categoryStatus: 'existing',
        correctionReason: 'תיקון כתיב'
      }]
    })
    const user = userEvent.setup()
    const onAdd = jest.fn(() => Promise.resolve())
    render(
      <GroceryItemModal
        listName={null}
        categories={categories}
        onClose={jest.fn()}
        onAdd={onAdd}
      />
    )

    await user.type(screen.getByPlaceholderText('common:groceryItem.namePlaceholder'), 'חללב')
    await user.click(screen.getByText('common:groceryItem.aiAssistant'))
    await user.click(screen.getByRole('button', { name: 'common:actions.add' }))

    expect(enrichItemsWithAi).toHaveBeenCalledWith(expect.objectContaining({
      categories: ['מוצרי חלב', 'אחר'],
      items: [{ id: 'single-item', name: 'חללב' }]
    }))
    expect(await screen.findByPlaceholderText('common:groceryItem.namePlaceholder')).toBeInTheDocument()
    expect(onAdd).toHaveBeenCalledWith({ name: 'חלב', category: 'מוצרי חלב', quantity: null, unit: null })
  })

  it('creates a suggested category once before adding the item', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [{
        id: 'single-item',
        originalName: 'סושי',
        correctedName: 'סושי',
        category: 'אוכל מוכן',
        categoryStatus: 'suggested',
        correctionReason: null
      }]
    })
    const user = userEvent.setup()
    const onAdd = jest.fn(() => Promise.resolve())
    const onAddCategory = jest.fn(() => Promise.resolve())
    render(
      <GroceryItemModal
        listName={null}
        categories={categories}
        onClose={jest.fn()}
        onAdd={onAdd}
        onAddCategory={onAddCategory}
      />
    )

    await user.type(screen.getByPlaceholderText('common:groceryItem.namePlaceholder'), 'סושי')
    await user.click(screen.getByText('common:groceryItem.aiAssistant'))
    await user.click(screen.getByRole('button', { name: 'common:actions.add' }))

    expect(onAddCategory).toHaveBeenCalledTimes(1)
    expect(onAddCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'אוכל מוכן' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'סושי', category: 'אוכל מוכן' }))
    expect(onAddCategory.mock.invocationCallOrder[0]).toBeLessThan(onAdd.mock.invocationCallOrder[0])
  })
})
