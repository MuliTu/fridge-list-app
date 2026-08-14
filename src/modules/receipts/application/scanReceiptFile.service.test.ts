import { ScanReceiptFileService, MAX_RECEIPT_FILE_BYTES } from './scanReceiptFile.service'
import type { ReceiptScanner } from './receiptScanner'

const context = { principal: { kind: 'user' as const, uid: 'u', email: 'u@example.com', emailVerified: true }, requestId: 'r', now: new Date() }
const scanner = (): jest.Mocked<ReceiptScanner> => ({ scanFile: jest.fn(), scanText: jest.fn() })

describe('ScanReceiptFileService', () => {
  it('validates locally then preserves the provider response contract', async () => {
    const provider = scanner()
    provider.scanFile.mockResolvedValue({ body: { store_name: 'Store', items: [] }, status: 201 })
    await expect(new ScanReceiptFileService(provider).execute(context, {
      image_base64: Buffer.from('image').toString('base64'), mime_type: 'image/jpeg'
    })).resolves.toEqual({ body: { store_name: 'Store', items: [] }, status: 201 })
  })

  it.each([
    null,
    { image_base64: '!!!!', mime_type: 'image/jpeg' },
    { image_base64: 'aW1hZ2U=', mime_type: 'text/html' },
    { image_base64: Buffer.alloc(MAX_RECEIPT_FILE_BYTES + 1).toString('base64'), mime_type: 'image/png' }
  ])('rejects invalid input without calling the provider', async (input) => {
    const provider = scanner()
    await expect(new ScanReceiptFileService(provider).execute(context, input)).rejects.toMatchObject({ code: 'invalid_input' })
    expect(provider.scanFile).not.toHaveBeenCalled()
  })

  it('rejects a service principal without calling the provider', async () => {
    const provider = scanner()
    const serviceContext = {
      ...context,
      principal: {
        kind: 'service' as const,
        service: 'receipt-bot',
        scopes: []
      }
    }

    await expect(new ScanReceiptFileService(provider).execute(serviceContext, {
      image_base64: 'aW1hZ2U=', mime_type: 'image/jpeg'
    })).rejects.toMatchObject({ code: 'forbidden' })
    expect(provider.scanFile).not.toHaveBeenCalled()
  })
})
