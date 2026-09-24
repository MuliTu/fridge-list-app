import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShoppingListItemRow } from '../../src/components/ShoppingListItemRow'
import type { GroceryItem } from '../../src/types'

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
  added_at: '2026-07-01T00:00:00.000Z',
  created_by: 'test@example.com'
}

const renderRow = (props: Partial<React.ComponentProps<typeof ShoppingListItemRow>> = {}) =>
  render(
    <ul>
      <ShoppingListItemRow
        entry={baseEntry}
        onCheckedChange={jest.fn()}
        onEditClick={jest.fn()}
        {...props}
      />
    </ul>
  )

describe('ShoppingListItemRow', () => {
  it('renders the item name and an unchecked accessible checkbox', () => {
    renderRow()
    expect(screen.getByText('חלב')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('checks through the dedicated checkbox control', async () => {
    const onCheckedChange = jest.fn()
    const user = userEvent.setup()
    renderRow({ onCheckedChange })

    await user.click(screen.getByRole('checkbox'))
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
  })

  it('keeps metadata hidden until the info popover is opened', async () => {
    const user = userEvent.setup()
    renderRow()
    expect(screen.queryByText('shoppingList:item.metadataTitle')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'shoppingList:item.info' }))
    expect(screen.getByText('shoppingList:item.metadataTitle')).toBeInTheDocument()
    expect(screen.getByText(/test@example.com/)).toBeInTheDocument()
  })

  it('opens item editing from the metadata popover', async () => {
    const onEditClick = jest.fn()
    const user = userEvent.setup()
    renderRow({ onEditClick })

    await user.click(screen.getByRole('button', { name: 'shoppingList:item.info' }))
    await user.click(screen.getByRole('button', { name: 'shoppingList:item.edit' }))
    expect(onEditClick).toHaveBeenCalledTimes(1)
  })

  it('shows note, photo, and quantity indicators when present', () => {
    renderRow({ entry: { ...baseEntry, note: 'קנה טרי', image_url: 'https://example.com/x.jpg', quantity: 2, unit: 'ק"ג' } })
    expect(screen.getByText('📝')).toBeInTheDocument()
    expect(screen.getByText('📷')).toBeInTheDocument()
    expect(screen.getByText('(2 ק"ג)')).toBeInTheDocument()
  })

  it('disables purchase changes in read-only mode', () => {
    renderRow({ canEdit: false })
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})
