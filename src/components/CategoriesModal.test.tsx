import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CategoriesModal from './CategoriesModal'
import { addCategory, deleteCategory } from '../lib/firebase'
import { useDialogService } from '../hooks/DialogServiceContext'
import type { Category } from '../types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

// Mocking at the ../lib/firebase module boundary, not the raw firebase/* SDK —
// this component's own logic (validation, error messages, confirm-before-delete)
// is what's under test, not Firebase's read/write behavior itself.
jest.mock('../lib/firebase', () => ({
  addCategory: jest.fn(() => Promise.resolve()),
  deleteCategory: jest.fn(() => Promise.resolve()),
  updateCategory: jest.fn(() => Promise.resolve())
}))

jest.mock('../hooks/DialogServiceContext', () => ({
  useDialogService: jest.fn()
}))

const categories: Category[] = [
  { key: 'cat-1', name: 'ירקות', color: '#8fbf6a', icon: '🥕', protected: false, order: 0 },
  { key: 'cat-2', name: 'אחר', color: '#a8a8a8', icon: '📌', protected: true, order: 1 }
]

describe('CategoriesModal', () => {
  const mockConfirm = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useDialogService as jest.Mock).mockReturnValue({ confirm: mockConfirm })
  })

  it('renders every category name', () => {
    render(<CategoriesModal categories={categories} onClose={jest.fn()} />)
    expect(screen.getByDisplayValue('ירקות')).toBeInTheDocument()
    expect(screen.getByDisplayValue('אחר')).toBeInTheDocument()
  })

  it('does not show a delete button for the protected category', () => {
    render(<CategoriesModal categories={categories} onClose={jest.fn()} />)
    const deleteButtons = screen.getAllByRole('button', { name: 'categories:deleteCategory' })
    // Only the non-protected category ("ירקות") gets a delete button.
    expect(deleteButtons).toHaveLength(1)
  })

  it('deletes the category when the confirm dialog resolves true', async () => {
    mockConfirm.mockResolvedValue(true)
    const user = userEvent.setup()
    render(<CategoriesModal categories={categories} onClose={jest.fn()} />)

    await user.click(screen.getByRole('button', { name: 'categories:deleteCategory' }))

    expect(mockConfirm).toHaveBeenCalledWith(
      'categories:deleteConfirm:{"categoryName":"ירקות"}'
    )
    expect(deleteCategory).toHaveBeenCalledWith('cat-1')
  })

  it('does NOT delete the category when the confirm dialog resolves false', async () => {
    mockConfirm.mockResolvedValue(false)
    const user = userEvent.setup()
    render(<CategoriesModal categories={categories} onClose={jest.fn()} />)

    await user.click(screen.getByRole('button', { name: 'categories:deleteCategory' }))

    expect(deleteCategory).not.toHaveBeenCalled()
  })

  it('adds a new category with the next order value', async () => {
    const user = userEvent.setup()
    render(<CategoriesModal categories={categories} onClose={jest.fn()} />)

    await user.type(screen.getByPlaceholderText('categories:newCategoryNamePlaceholder'), 'קפואים')
    await user.click(screen.getByRole('button', { name: 'categories:addCategory' }))

    expect(addCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'קפואים', order: 2 })
    )
  })

  it('shows a validation error and does not call addCategory when the name is empty', async () => {
    const user = userEvent.setup()
    render(<CategoriesModal categories={categories} onClose={jest.fn()} />)

    await user.click(screen.getByRole('button', { name: 'categories:addCategory' }))

    expect(screen.getByText('categories:nameRequired')).toBeInTheDocument()
    expect(addCategory).not.toHaveBeenCalled()
  })
})
