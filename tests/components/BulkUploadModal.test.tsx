import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BulkUploadModal } from '../../src/components/BulkUploadModal'
import { categorizeItem } from '../../src/lib/firebase'
import type { Category } from '../../src/types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

jest.mock('../../src/lib/firebase', () => ({
  categorizeItem: jest.fn()
}))

const categories: Category[] = [
  { key: 'dairy', name: 'מוצרי חלב', color: '#fff', icon: '🥛', protected: false },
  { key: 'bakery', name: 'מאפים', color: '#fff', icon: '🍞', protected: false },
  { key: 'other', name: 'אחר', color: '#fff', icon: '❓', protected: true }
]

const parseAndReview = async (raw: string) => {
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText('shoppingList:bulkUpload.placeholder'), raw)
  await user.click(screen.getByRole('button', { name: 'shoppingList:bulkUpload.parse' }))
  return user
}

const clickSave = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /shoppingList:bulkUpload.saveCount/ }))
}

describe('BulkUploadModal — existing-product matching (bulk update)', () => {
  beforeEach(() => {
    ;(categorizeItem as jest.Mock).mockReset()
  })

  it('defaults an exact-name match to updating the existing item, not creating a duplicate', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([])
    const onAdd = jest.fn(() => Promise.resolve())
    const onUpdateQuantity = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[{ key: 'existing-1', name: 'חלב', category: 'מוצרי חלב' }]}
        onClose={jest.fn()}
        onAdd={onAdd}
        onUpdateQuantity={onUpdateQuantity}
      />
    )

    const user = await parseAndReview('חלב\nלחם,מאפים')
    expect(await screen.findByText('shoppingList:bulkUpload.matchFound')).toBeInTheDocument()

    await clickSave(user)

    // The matched row (חלב) updates the existing item instead of calling onAdd.
    expect(onUpdateQuantity).toHaveBeenCalledTimes(1)
    expect(onUpdateQuantity).toHaveBeenCalledWith('existing-1', { quantity: null, unit: null })
    // The unmatched row (לחם) still creates a new item, exactly as before.
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith({ name: 'לחם', category: 'מאפים', quantity: null, unit: null })
  })

  it('defaults a fuzzy plural match to updating the existing item (מלפפון -> מלפפונים)', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([])
    const onUpdateQuantity = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[{ key: 'cucumber-key', name: 'מלפפונים', category: 'אחר' }]}
        onClose={jest.fn()}
        onAdd={jest.fn()}
        onUpdateQuantity={onUpdateQuantity}
      />
    )

    const user = await parseAndReview('מלפפון,10')
    expect(await screen.findByText('shoppingList:bulkUpload.matchFound')).toBeInTheDocument()

    await clickSave(user)

    expect(onUpdateQuantity).toHaveBeenCalledWith('cucumber-key', { quantity: 10, unit: null })
  })

  it('parses "name,amount,unit" into quantity + unit for a new item', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([])
    const onAdd = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[]}
        onClose={jest.fn()}
        onAdd={onAdd}
        onUpdateQuantity={jest.fn()}
      />
    )

    const user = await parseAndReview('מלפפונים,10,ק"ג')
    await clickSave(user)

    expect(onAdd).toHaveBeenCalledWith({ name: 'מלפפונים', category: 'אחר', quantity: 10, unit: 'ק"ג' })
  })

  it('still honors an explicit non-numeric second column as a category (backward compatible)', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([])
    const onAdd = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[]}
        onClose={jest.fn()}
        onAdd={onAdd}
        onUpdateQuantity={jest.fn()}
      />
    )

    const user = await parseAndReview('עגבניות, מוצרי חלב')
    await clickSave(user)

    expect(onAdd).toHaveBeenCalledWith({ name: 'עגבניות', category: 'מוצרי חלב', quantity: null, unit: null })
  })

  it('behaves as before when nothing on the list matches at all: no suggestion shown, row added as new', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([])
    const onAdd = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[{ key: 'k1', name: 'חלב', category: 'מוצרי חלב' }]}
        onClose={jest.fn()}
        onAdd={onAdd}
        onUpdateQuantity={jest.fn()}
      />
    )

    const user = await parseAndReview('שוקולד,מאפים')
    expect(screen.queryByText('shoppingList:bulkUpload.matchFound')).not.toBeInTheDocument()

    await clickSave(user)

    expect(onAdd).toHaveBeenCalledWith({ name: 'שוקולד', category: 'מאפים', quantity: null, unit: null })
  })

  it('rejects an invalid quantity at save time with a blocking error, without calling onAdd/onUpdateQuantity', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([])
    const onAdd = jest.fn(() => Promise.resolve())
    const onUpdateQuantity = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[]}
        onClose={jest.fn()}
        onAdd={onAdd}
        onUpdateQuantity={onUpdateQuantity}
      />
    )

    const user = await parseAndReview('לחם,מאפים')
    // fireEvent.change bypasses the number input's native character filtering, so a
    // genuinely invalid value (negative) actually lands in the field's state.
    const qtyInput = screen.getByPlaceholderText('stock:editModal.quantity')
    fireEvent.change(qtyInput, { target: { value: '-5' } })

    await clickSave(user)

    expect(onAdd).not.toHaveBeenCalled()
    expect(onUpdateQuantity).not.toHaveBeenCalled()
    expect(await screen.findByText(/common:quantityUnit.invalidQuantity/)).toBeInTheDocument()
  })
})
