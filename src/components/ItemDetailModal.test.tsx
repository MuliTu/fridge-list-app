import { render, screen } from '@testing-library/react'
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
