import { act, fireEvent, render, screen } from '@testing-library/react'
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


describe('delayed purchase', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('waits five seconds before committing the purchase', () => {
    const onCheckedChange = jest.fn()
    renderRow({ delayPurchase: true, onCheckedChange })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => jest.advanceTimersByTime(4999))
    expect(onCheckedChange).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(1))
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
  })

  it('cancels without writing and restores the checkbox', () => {
    const onCheckedChange = jest.fn()
    renderRow({ delayPurchase: true, onCheckedChange })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'shoppingList:item.cancelPurchase' }))
    act(() => jest.advanceTimersByTime(5000))
    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('cancels a pending purchase when the row unmounts', () => {
    const onCheckedChange = jest.fn()
    const { unmount } = renderRow({ delayPurchase: true, onCheckedChange })
    fireEvent.click(screen.getByRole('checkbox'))
    unmount()
    act(() => jest.advanceTimersByTime(5000))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})

describe('purchase gestures and urgency', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    // jsdom does not implement PointerEvent; mouse coordinates exercise the handlers.
    window.PointerEvent = MouseEvent as typeof PointerEvent
  })
  afterEach(() => jest.useRealTimers())
  it('requires a full second and suppresses the trailing pointer click', () => {
    const onCheckedChange = jest.fn()
    renderRow({ purchaseGesture: 'hold', delayPurchase: true, onCheckedChange })
    const name = screen.getByText('חלב')
    fireEvent.pointerDown(name, { button: 0, clientX: 10, clientY: 10 })
    act(() => jest.advanceTimersByTime(999))
    expect(onCheckedChange).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(1))
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.pointerUp(name)
    fireEvent.click(name, { detail: 1 })
    act(() => jest.advanceTimersByTime(5000))
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
  })
  it('cancels early release, movement and scrolling without a purchase', () => {
    const onCheckedChange = jest.fn()
    renderRow({ purchaseGesture: 'hold', onCheckedChange })
    const name = screen.getByText('חלב')
    fireEvent.pointerDown(name, { button: 0, clientX: 10, clientY: 10 })
    act(() => jest.advanceTimersByTime(500))
    fireEvent.pointerUp(name)
    act(() => jest.advanceTimersByTime(1000))
    fireEvent.pointerDown(name, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(name, { clientX: 10, clientY: 40 })
    act(() => jest.advanceTimersByTime(1000))
    fireEvent.pointerDown(name, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.scroll(window)
    act(() => jest.advanceTimersByTime(1000))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
  it('keeps a keyboard checkbox action available in hold mode', () => {
    const onCheckedChange = jest.fn()
    renderRow({ purchaseGesture: 'hold', onCheckedChange })
    fireEvent.click(screen.getByRole('checkbox'), { detail: 0 })
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
  })
  it('keeps Undo when countdown text is hidden', () => {
    const onCheckedChange = jest.fn()
    renderRow({ delayPurchase: true, showCountdown: false, onCheckedChange })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('status')).toHaveTextContent('shoppingList:item.purchasePendingNoTimer')
    fireEvent.click(screen.getByRole('button', { name: 'shoppingList:item.cancelPurchase' }))
    act(() => jest.advanceTimersByTime(5000))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
  it('does not mark a purchase when holding the information button', () => {
    const onCheckedChange = jest.fn()
    renderRow({ purchaseGesture: 'hold', onCheckedChange })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'shoppingList:item.info' }), { button: 0 })
    act(() => jest.advanceTimersByTime(1500))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
