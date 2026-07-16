import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroceryItemModal from './GroceryItemModal'
import { categorizeItem } from '../lib/firebase'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

jest.mock('../lib/firebase', () => ({
  categorizeItem: jest.fn()
}))

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
