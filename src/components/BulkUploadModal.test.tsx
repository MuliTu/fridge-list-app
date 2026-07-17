import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BulkUploadModal from './BulkUploadModal'
import { categorizeItem } from '../lib/firebase'
import type { Category } from '../types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

jest.mock('../lib/firebase', () => ({
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

describe('BulkUploadModal duplicate detection', () => {
  beforeEach(() => {
    ;(categorizeItem as jest.Mock).mockReset()
  })

  it('flags a row matching an existing list entry as a duplicate, excluded from onAdd by default', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([{ item: 'חלב', category: 'מוצרי חלב' }])
    const onAdd = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingItemNames={['חלב']}
        onClose={jest.fn()}
        onAdd={onAdd}
      />
    )

    const user = await parseAndReview('חלב\nלחם,מאפים')

    // Duplicate badge shows for the חלב row, and its checkbox starts unchecked.
    expect(await screen.findByText('shoppingList:bulkUpload.duplicateBadge')).toBeInTheDocument()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(1)
    expect(checkboxes[0]).toHaveAttribute('data-state', 'unchecked')

    await user.click(screen.getByRole('button', { name: /shoppingList:bulkUpload.saveCount/ }))

    // Only the non-duplicate row (לחם) is saved; the duplicate (חלב) is skipped.
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith({ name: 'לחם', category: 'מאפים' })
  })

  it('includes a flagged duplicate row when the user toggles its checkbox on', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([])
    const onAdd = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingItemNames={['חלב']}
        onClose={jest.fn()}
        onAdd={onAdd}
      />
    )

    const user = await parseAndReview('חלב,מוצרי חלב')

    const checkbox = await screen.findByRole('checkbox')
    expect(checkbox).toHaveAttribute('data-state', 'unchecked')

    await user.click(checkbox)
    expect(checkbox).toHaveAttribute('data-state', 'checked')

    await user.click(screen.getByRole('button', { name: /shoppingList:bulkUpload.saveCount/ }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith({ name: 'חלב', category: 'מוצרי חלב' })
  })

  it('behaves exactly as before when nothing on the list overlaps: no badge, no checkbox, row auto-included', async () => {
    ;(categorizeItem as jest.Mock).mockResolvedValue([])
    const onAdd = jest.fn(() => Promise.resolve())

    render(
      <BulkUploadModal
        listName={null}
        categories={categories}
        existingItemNames={['חלב']}
        onClose={jest.fn()}
        onAdd={onAdd}
      />
    )

    const user = await parseAndReview('עגבניות,מאפים')

    expect(screen.queryByText('shoppingList:bulkUpload.duplicateBadge')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /shoppingList:bulkUpload.saveCount/ }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith({ name: 'עגבניות', category: 'מאפים' })
  })
})
