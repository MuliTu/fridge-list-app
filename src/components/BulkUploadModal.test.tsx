import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BulkUploadModal from './BulkUploadModal'
import { categorizeItem } from '../lib/firebase'
import { enrichItemsWithAi } from '../client/api/aiItemEnrichment'
import type { Category } from '../types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

jest.mock('../lib/firebase', () => ({
  categorizeItem: jest.fn()
}))

jest.mock('../client/api/aiItemEnrichment', () => ({
  enrichItemsWithAi: jest.fn()
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
    const onUpdateDetails = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[{ key: 'existing-1', name: 'חלב', category: 'מוצרי חלב' }]}
        onClose={jest.fn()}
        onAdd={onAdd}
        onUpdateDetails={onUpdateDetails}
      />
    )

    const user = await parseAndReview('חלב\nלחם,מאפים')
    expect(await screen.findByText('shoppingList:bulkUpload.matchFound')).toBeInTheDocument()

    await clickSave(user)

    // The matched row (חלב) updates the existing item instead of calling onAdd.
    expect(onUpdateDetails).toHaveBeenCalledTimes(1)
    expect(onUpdateDetails).toHaveBeenCalledWith('existing-1', { quantity: null, unit: null })
    // The unmatched row (לחם) still creates a new item, exactly as before.
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith({ name: 'לחם', category: 'מאפים', note: null, quantity: null, unit: null })
  })

  it('defaults a fuzzy plural match to updating the existing item (מלפפון -> מלפפונים)', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([])
    const onUpdateDetails = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[{ key: 'cucumber-key', name: 'מלפפונים', category: 'אחר' }]}
        onClose={jest.fn()}
        onAdd={jest.fn()}
        onUpdateDetails={onUpdateDetails}
      />
    )

    const user = await parseAndReview('מלפפון,10')
    expect(await screen.findByText('shoppingList:bulkUpload.matchFound')).toBeInTheDocument()

    await clickSave(user)

    expect(onUpdateDetails).toHaveBeenCalledWith('cucumber-key', { quantity: 10, unit: null })
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
        onUpdateDetails={jest.fn()}
      />
    )

    const user = await parseAndReview('מלפפונים,10,ק"ג')
    await clickSave(user)

    expect(onAdd).toHaveBeenCalledWith({ name: 'מלפפונים', category: 'אחר', note: null, quantity: 10, unit: 'ק"ג' })
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
        onUpdateDetails={jest.fn()}
      />
    )

    const user = await parseAndReview('עגבניות, מוצרי חלב')
    await clickSave(user)

    expect(onAdd).toHaveBeenCalledWith({ name: 'עגבניות', category: 'מוצרי חלב', note: null, quantity: null, unit: null })
  })

  it('imports a headered CSV with category, item, quantity, unit, and notes in any column order', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([])
    const onAdd = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[]}
        onClose={jest.fn()}
        onAdd={onAdd}
        onUpdateDetails={jest.fn()}
      />
    )

    const user = await parseAndReview(
      'category,item,quantity,unit,notes\nמאפים,"לחם, פרוס",2,חבילה,ללא גלוטן'
    )
    await clickSave(user)

    expect(onAdd).toHaveBeenCalledWith({
      name: 'לחם, פרוס',
      category: 'מאפים',
      note: 'ללא גלוטן',
      quantity: 2,
      unit: 'חבילה'
    })
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
        onUpdateDetails={jest.fn()}
      />
    )

    const user = await parseAndReview('שוקולד,מאפים')
    expect(screen.queryByText('shoppingList:bulkUpload.matchFound')).not.toBeInTheDocument()

    await clickSave(user)

    expect(onAdd).toHaveBeenCalledWith({ name: 'שוקולד', category: 'מאפים', note: null, quantity: null, unit: null })
  })

  it('rejects an invalid quantity at save time with a blocking error, without calling onAdd/onUpdateDetails', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([])
    const onAdd = jest.fn(() => Promise.resolve())
    const onUpdateDetails = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[]}
        onClose={jest.fn()}
        onAdd={onAdd}
        onUpdateDetails={onUpdateDetails}
      />
    )

    const user = await parseAndReview('לחם,מאפים')
    // fireEvent.change bypasses the number input's native character filtering, so a
    // genuinely invalid value (negative) actually lands in the field's state.
    const qtyInput = screen.getByPlaceholderText('stock:editModal.quantity')
    fireEvent.change(qtyInput, { target: { value: '-5' } })

    await clickSave(user)

    expect(onAdd).not.toHaveBeenCalled()
    expect(onUpdateDetails).not.toHaveBeenCalled()
    expect(await screen.findByText(/common:quantityUnit.invalidQuantity/)).toBeInTheDocument()
  })
})

describe('BulkUploadModal — AI assistant', () => {
  beforeEach(() => {
    ;(enrichItemsWithAi as jest.Mock).mockReset()
  })

  it('sends one category dataset for the batch, applies corrections, and creates each new category once', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [
        { id: '0', originalName: 'חללב', correctedName: 'חלב', category: 'מוצרי חלב', categoryStatus: 'existing', correctionReason: 'כתיב' },
        { id: '1', originalName: 'סושי', correctedName: 'סושי', category: 'אוכל מוכן', categoryStatus: 'suggested', correctionReason: null },
        { id: '2', originalName: 'פיצה', correctedName: 'פיצה', category: 'אוכל מוכן', categoryStatus: 'suggested', correctionReason: null }
      ]
    })
    const user = userEvent.setup()
    const onAdd = jest.fn(() => Promise.resolve())
    const onAddCategory = jest.fn(() => Promise.resolve())
    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[]}
        onClose={jest.fn()}
        onAdd={onAdd}
        onUpdateDetails={jest.fn()}
        onAddCategory={onAddCategory}
      />
    )

    await user.type(screen.getByPlaceholderText('shoppingList:bulkUpload.placeholder'), 'חללב\nסושי\nפיצה')
    await user.click(screen.getByText('shoppingList:bulkUpload.aiAssistant'))
    await user.click(screen.getByRole('button', { name: 'shoppingList:bulkUpload.parse' }))

    expect(enrichItemsWithAi).toHaveBeenCalledWith(expect.objectContaining({
      categories: ['מוצרי חלב', 'מאפים', 'אחר'],
      items: [
        { id: '0', name: 'חללב' },
        { id: '1', name: 'סושי' },
        { id: '2', name: 'פיצה' }
      ]
    }))
    expect(await screen.findByDisplayValue('חלב')).toBeInTheDocument()

    await clickSave(user)
    expect(onAddCategory).toHaveBeenCalledTimes(1)
    expect(onAddCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'אוכל מוכן' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'חלב', category: 'מוצרי חלב' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'סושי', category: 'אוכל מוכן' }))
  })

  it('rechecks corrected names against existing items and updates instead of duplicating', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [{ id: '0', originalName: 'חללב', correctedName: 'חלב', category: 'מוצרי חלב', categoryStatus: 'existing', correctionReason: 'כתיב' }]
    })
    const user = userEvent.setup()
    const onAdd = jest.fn()
    const onUpdateDetails = jest.fn(() => Promise.resolve())
    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[{ key: 'milk', name: 'חלב', category: 'מוצרי חלב' }]}
        onClose={jest.fn()}
        onAdd={onAdd}
        onUpdateDetails={onUpdateDetails}
      />
    )

    await user.type(screen.getByPlaceholderText('shoppingList:bulkUpload.placeholder'), 'חללב')
    await user.click(screen.getByText('shoppingList:bulkUpload.aiAssistant'))
    await user.click(screen.getByRole('button', { name: 'shoppingList:bulkUpload.parse' }))
    await clickSave(user)

    expect(onUpdateDetails).toHaveBeenCalledWith('milk', { quantity: null, unit: null })
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('adds repeated corrected products only once within the same batch', async () => {
    ;(enrichItemsWithAi as jest.Mock).mockResolvedValue({
      items: [
        { id: '0', originalName: 'חללב', correctedName: 'חלב', category: 'מוצרי חלב', categoryStatus: 'existing', correctionReason: 'כתיב' },
        { id: '1', originalName: 'חלב', correctedName: 'חלב', category: 'מוצרי חלב', categoryStatus: 'existing', correctionReason: null }
      ]
    })
    const user = userEvent.setup()
    const onAdd = jest.fn(() => Promise.resolve())
    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingEntries={[]}
        onClose={jest.fn()}
        onAdd={onAdd}
        onUpdateDetails={jest.fn()}
      />
    )

    await user.type(screen.getByPlaceholderText('shoppingList:bulkUpload.placeholder'), 'חללב\nחלב')
    await user.click(screen.getByText('shoppingList:bulkUpload.aiAssistant'))
    await user.click(screen.getByRole('button', { name: 'shoppingList:bulkUpload.parse' }))
    await clickSave(user)

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'חלב' }))
  })
})
