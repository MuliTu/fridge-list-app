import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ShoppingListItemRow from './ShoppingListItemRow'
import type { GroceryItem } from '../types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

const baseEntry: GroceryItem = {
  key: 'item-1',
  item: 'חלב',
  category: 'dairy',
  bought: false,
  added_at: '2026-07-01T00:00:00.000Z'
}

describe('ShoppingListItemRow', () => {
  it('renders the item name', () => {
    render(
      <ul>
        <ShoppingListItemRow entry={baseEntry} onClick={jest.fn()} onInfoClick={jest.fn()} />
      </ul>
    )
    expect(screen.getByText('חלב')).toBeInTheDocument()
  })

  it('calls onClick when the row itself is clicked', async () => {
    const onClick = jest.fn()
    const user = userEvent.setup()
    render(
      <ul>
        <ShoppingListItemRow entry={baseEntry} onClick={onClick} onInfoClick={jest.fn()} />
      </ul>
    )

    await user.click(screen.getByText('חלב'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('calls onInfoClick but NOT onClick when the info button is clicked (stopPropagation)', async () => {
    const onClick = jest.fn()
    const onInfoClick = jest.fn()
    const user = userEvent.setup()
    render(
      <ul>
        <ShoppingListItemRow entry={baseEntry} onClick={onClick} onInfoClick={onInfoClick} />
      </ul>
    )

    await user.click(screen.getByRole('button', { name: 'shoppingList:item.info' }))
    expect(onInfoClick).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows a note icon only when the item has a note', () => {
    const { rerender } = render(
      <ul>
        <ShoppingListItemRow entry={baseEntry} onClick={jest.fn()} onInfoClick={jest.fn()} />
      </ul>
    )
    expect(screen.queryByText('📝')).not.toBeInTheDocument()

    rerender(
      <ul>
        <ShoppingListItemRow entry={{ ...baseEntry, note: 'קנה טרי' }} onClick={jest.fn()} onInfoClick={jest.fn()} />
      </ul>
    )
    expect(screen.getByText('📝')).toBeInTheDocument()
  })

  it('shows a photo icon only when the item has an image', () => {
    render(
      <ul>
        <ShoppingListItemRow
          entry={{ ...baseEntry, image_url: 'https://example.com/x.jpg' }}
          onClick={jest.fn()}
          onInfoClick={jest.fn()}
        />
      </ul>
    )
    expect(screen.getByText('📷')).toBeInTheDocument()
  })

  it('shows no quantity annotation when quantity is absent', () => {
    render(
      <ul>
        <ShoppingListItemRow entry={baseEntry} onClick={jest.fn()} onInfoClick={jest.fn()} />
      </ul>
    )
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument()
  })

  it('shows "(quantity unit)" when both are set', () => {
    render(
      <ul>
        <ShoppingListItemRow
          entry={{ ...baseEntry, quantity: 2, unit: 'ק"ג' }}
          onClick={jest.fn()}
          onInfoClick={jest.fn()}
        />
      </ul>
    )
    expect(screen.getByText('(2 ק"ג)')).toBeInTheDocument()
  })

  it('shows "(quantity)" with no unit when only quantity is set', () => {
    render(
      <ul>
        <ShoppingListItemRow entry={{ ...baseEntry, quantity: 5, unit: null }} onClick={jest.fn()} onInfoClick={jest.fn()} />
      </ul>
    )
    expect(screen.getByText('(5)')).toBeInTheDocument()
  })
})
