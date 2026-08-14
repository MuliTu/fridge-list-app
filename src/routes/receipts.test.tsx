import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Route } from './receipts'
import { useAuth } from '../hooks/AuthContext'
import { useActiveList, useListApi } from '../hooks/ListContext'
import { useDialogService } from '../hooks/DialogServiceContext'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

type SnapshotCallback = (snapshot: { val(): unknown }) => void

const mockOnValue = jest.fn((_ref: unknown, cb: SnapshotCallback) => {
  cb({ val: () => null })
  return jest.fn()
})
const mockReceiptApi = {
  save: jest.fn(),
  delete: jest.fn(),
  getImage: jest.fn()
}

jest.mock('../lib/firebase', () => ({
  categorizeItem: jest.fn(),
  getCurrentUserIdToken: jest.fn(),
  onValue: (ref: unknown, cb: SnapshotCallback) => mockOnValue(ref, cb),
  resizeImage: jest.fn(),
  scanReceipt: jest.fn(),
  scanReceiptFromUrl: jest.fn()
}))

jest.mock('../client/api/receipts', () => ({
  createReceiptApiClient: jest.fn(() => mockReceiptApi)
}))

const mockListApi = {
  receiptsRef: {},
  applyReceiptReconciliation: jest.fn(),
  deleteReceipt: jest.fn(),
  getAllGroceryItems: jest.fn(),
  getAllStockItems: jest.fn(),
  saveReceipt: jest.fn()
}

jest.mock('../hooks/AuthContext', () => ({
  useAuth: jest.fn()
}))

jest.mock('../hooks/ListContext', () => ({
  useActiveList: jest.fn(),
  useListApi: jest.fn()
}))

jest.mock('../hooks/DialogServiceContext', () => ({
  useDialogService: jest.fn()
}))

const ReceiptsPage = Route.options.component as React.ComponentType

describe('ReceiptsPage upload input — supports both camera and device file picker', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOnValue.mockImplementation((_ref, cb) => {
      cb({ val: () => null })
      return jest.fn()
    })
    ;(useDialogService as jest.Mock).mockReturnValue({ confirm: jest.fn(), prompt: jest.fn() })
    ;(useListApi as jest.Mock).mockReturnValue(mockListApi)
  })

  it('uses authenticated server mediation for receipt delete and image access', async () => {
    mockOnValue.mockImplementation((_ref, cb) => {
      cb({ val: () => ({
        receipt1: {
          store_name: 'Store', items: [], total: 5, scanned_at: '2026-08-02T10:00:00Z',
          image_ref: 'trusted-image-ref'
        }
      }) })
      return jest.fn()
    })
    mockReceiptApi.delete.mockResolvedValue(undefined)
    mockReceiptApi.getImage.mockResolvedValue('data:image/jpeg;base64,aW1hZ2U=')
    const confirm = jest.fn().mockResolvedValue(true)
    const alert = jest.fn()
    ;(useDialogService as jest.Mock).mockReturnValue({ confirm, prompt: jest.fn(), alert })
    ;(useAuth as jest.Mock).mockReturnValue({ user: { email: 'a@b.com' } })
    ;(useActiveList as jest.Mock).mockReturnValue({ canEdit: true, activeList: { id: 'list-1' } })
    ;(globalThis as any).fetch = jest.fn().mockResolvedValue({ blob: async () => new Blob(['image']) })
    URL.createObjectURL = jest.fn(() => 'blob:receipt')
    window.open = jest.fn()

    render(<ReceiptsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'receipts:deleteBtn' }))
    await waitFor(() => expect(mockReceiptApi.delete).toHaveBeenCalledWith('list-1', 'receipt1'))

    fireEvent.click(screen.getByRole('button', { name: 'receipts:viewImageAria' }))
    await waitFor(() => expect(mockReceiptApi.getImage).toHaveBeenCalledWith('list-1', 'receipt1'))
    expect(window.open).toHaveBeenCalledWith('blob:receipt', '_blank')
    expect(mockListApi.deleteReceipt).not.toHaveBeenCalled()
  })

  it('does not force straight-to-camera capture, so iPhone/Android show their file/photo picker too', () => {
    ;(useAuth as jest.Mock).mockReturnValue({ user: { email: 'a@b.com' } })
    ;(useActiveList as jest.Mock).mockReturnValue({ canEdit: true })
    render(<ReceiptsPage />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    // No `capture` attribute — capture="environment" is what forces iOS Safari/Android
    // Chrome straight into the camera app, skipping the OS picker that also offers
    // "choose from library/files". Removing it is the actual fix for this feature.
    expect(input.getAttribute('capture')).toBeNull()
    expect(input.getAttribute('accept')).toBe('image/*,application/pdf')
    expect(input.multiple).toBe(true)
  })

  it('does not render the upload input at all for a viewer who cannot edit', () => {
    ;(useAuth as jest.Mock).mockReturnValue({ user: null })
    ;(useActiveList as jest.Mock).mockReturnValue({ canEdit: false })
    render(<ReceiptsPage />)

    expect(document.querySelector('input[type="file"]')).toBeNull()
  })
})
