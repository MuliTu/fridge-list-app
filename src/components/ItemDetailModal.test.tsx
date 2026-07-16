import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ItemDetailModal from './ItemDetailModal'
import { useDialogService } from '../hooks/DialogServiceContext'
import type { GroceryItem } from '../types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

jest.mock('../lib/firebase', () => ({
  getImageDataUrl: jest.fn(() => Promise.resolve(null))
}))

jest.mock('../hooks/DialogServiceContext', () => ({
  useDialogService: jest.fn()
}))

const entry: GroceryItem = {
  key: 'item-1',
  item: 'חלב',
  category: 'dairy',
  bought: false,
  added_at: '2026-07-01T00:00:00.000Z'
}

describe('ItemDetailModal photo upload input — supports both camera and device file picker', () => {
  beforeEach(() => {
    ;(useDialogService as jest.Mock).mockReturnValue({ confirm: jest.fn() })
  })

  it('does not force straight-to-camera capture, so iPhone/Android show their file/photo picker too', () => {
    render(
      <ItemDetailModal
        entry={entry}
        canEdit={true}
        onSignIn={jest.fn()}
        onClose={jest.fn()}
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    )

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    // No `capture` attribute — capture="environment" is what forces iOS Safari/Android
    // Chrome straight into the camera app, skipping the OS picker that also offers
    // "choose from library/files". Removing it is the actual fix for this feature.
    expect(input.getAttribute('capture')).toBeNull()
    expect(input.getAttribute('accept')).toBe('image/*')
  })
})

describe('ItemDetailModal product name editing', () => {
  beforeEach(() => {
    ;(useDialogService as jest.Mock).mockReturnValue({ confirm: jest.fn() })
  })

  it('pre-fills the name field with the current item name, editable when canEdit', () => {
    render(
      <ItemDetailModal
        entry={entry}
        canEdit={true}
        onSignIn={jest.fn()}
        onClose={jest.fn()}
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    )

    expect(screen.getByLabelText('common:itemDetail.nameLabel')).toHaveValue('חלב')
  })

  it('shows the name as read-only static text (not an input) when the user cannot edit', () => {
    render(
      <ItemDetailModal
        entry={entry}
        canEdit={false}
        onSignIn={jest.fn()}
        onClose={jest.fn()}
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    )

    expect(screen.queryByLabelText('common:itemDetail.nameLabel')).not.toBeInTheDocument()
    expect(screen.getByText('חלב')).toBeInTheDocument()
  })

  it('saves the trimmed, edited name and closes the modal', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn(() => Promise.resolve())
    const onClose = jest.fn()
    render(
      <ItemDetailModal
        entry={entry}
        canEdit={true}
        onSignIn={jest.fn()}
        onClose={onClose}
        onSave={onSave}
        onDelete={jest.fn()}
      />
    )

    const nameInput = screen.getByLabelText('common:itemDetail.nameLabel')
    await user.clear(nameInput)
    await user.type(nameInput, '  חלב 3% שומן  ')
    await user.click(screen.getByRole('button', { name: 'common:actions.save' }))

    expect(onSave).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({ name: 'חלב 3% שומן' })
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('disables Save and shows a validation message when the name is emptied', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn()
    render(
      <ItemDetailModal
        entry={entry}
        canEdit={true}
        onSignIn={jest.fn()}
        onClose={jest.fn()}
        onSave={onSave}
        onDelete={jest.fn()}
      />
    )

    await user.clear(screen.getByLabelText('common:itemDetail.nameLabel'))

    expect(screen.getByRole('button', { name: 'common:actions.save' })).toBeDisabled()
    expect(screen.getByText('common:itemDetail.nameRequired')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('disables Save when the name is only whitespace', async () => {
    const user = userEvent.setup()
    render(
      <ItemDetailModal
        entry={entry}
        canEdit={true}
        onSignIn={jest.fn()}
        onClose={jest.fn()}
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    )

    const nameInput = screen.getByLabelText('common:itemDetail.nameLabel')
    await user.clear(nameInput)
    await user.type(nameInput, '   ')

    expect(screen.getByRole('button', { name: 'common:actions.save' })).toBeDisabled()
  })

  it('caps the name field at 100 characters via maxLength', () => {
    render(
      <ItemDetailModal
        entry={entry}
        canEdit={true}
        onSignIn={jest.fn()}
        onClose={jest.fn()}
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    )

    expect(screen.getByLabelText('common:itemDetail.nameLabel')).toHaveAttribute('maxLength', '100')
  })
})

describe('ItemDetailModal quantity/unit editing', () => {
  beforeEach(() => {
    ;(useDialogService as jest.Mock).mockReturnValue({ confirm: jest.fn() })
  })

  it('pre-fills quantity as empty when the item has none', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn(() => Promise.resolve())
    render(
      <ItemDetailModal
        entry={entry}
        canEdit={true}
        onSignIn={jest.fn()}
        onClose={jest.fn()}
        onSave={onSave}
        onDelete={jest.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'common:actions.save' }))

    expect(onSave).toHaveBeenCalledWith('item-1', expect.objectContaining({ quantity: null, unit: null }))
  })

  it('pre-fills and re-saves an existing quantity/unit unchanged', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn(() => Promise.resolve())
    render(
      <ItemDetailModal
        entry={{ ...entry, quantity: 2, unit: 'ק"ג' }}
        canEdit={true}
        onSignIn={jest.fn()}
        onClose={jest.fn()}
        onSave={onSave}
        onDelete={jest.fn()}
      />
    )

    expect(screen.getByRole('spinbutton')).toHaveValue(2)
    await user.click(screen.getByRole('button', { name: 'common:actions.save' }))

    expect(onSave).toHaveBeenCalledWith('item-1', expect.objectContaining({ quantity: 2, unit: 'ק"ג' }))
  })

  it('clearing a unit-less quantity field saves it back to null', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn(() => Promise.resolve())
    render(
      <ItemDetailModal
        entry={{ ...entry, quantity: 5, unit: null }}
        canEdit={true}
        onSignIn={jest.fn()}
        onClose={jest.fn()}
        onSave={onSave}
        onDelete={jest.fn()}
      />
    )

    await user.clear(screen.getByRole('spinbutton'))
    await user.click(screen.getByRole('button', { name: 'common:actions.save' }))

    expect(onSave).toHaveBeenCalledWith('item-1', expect.objectContaining({ quantity: null, unit: null }))
  })

  it('clearing the quantity while a unit is still selected blocks save with a validation error', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn()
    render(
      <ItemDetailModal
        entry={{ ...entry, quantity: 2, unit: 'ק"ג' }}
        canEdit={true}
        onSignIn={jest.fn()}
        onClose={jest.fn()}
        onSave={onSave}
        onDelete={jest.fn()}
      />
    )

    await user.clear(screen.getByRole('spinbutton'))
    await user.click(screen.getByRole('button', { name: 'common:actions.save' }))

    expect(screen.getByText('common:quantityUnit.unitRequiresQuantity')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows a validation error and does not save when quantity is invalid', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn()
    render(
      <ItemDetailModal
        entry={entry}
        canEdit={true}
        onSignIn={jest.fn()}
        onClose={jest.fn()}
        onSave={onSave}
        onDelete={jest.fn()}
      />
    )

    await user.type(screen.getByRole('spinbutton'), '0')
    await user.click(screen.getByRole('button', { name: 'common:actions.save' }))

    expect(screen.getByText('common:quantityUnit.invalidQuantity')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })
})
