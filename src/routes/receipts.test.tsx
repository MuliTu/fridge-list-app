import { render } from '@testing-library/react'
import { Route } from './receipts'
import { useAuth } from '../hooks/AuthContext'
import { useActiveList, useListApi } from '../hooks/ListContext'
import { useDialogService } from '../hooks/DialogServiceContext'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

jest.mock('../lib/firebase', () => ({
  categorizeItem: jest.fn(),
  getImageDataUrl: jest.fn(),
  onValue: jest.fn((_ref, cb) => {
    cb({ val: () => null })
    return jest.fn()
  }),
  resizeImage: jest.fn(),
  scanReceipt: jest.fn(),
  scanReceiptFromUrl: jest.fn()
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
    ;(useDialogService as jest.Mock).mockReturnValue({ confirm: jest.fn(), prompt: jest.fn() })
    ;(useListApi as jest.Mock).mockReturnValue(mockListApi)
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
