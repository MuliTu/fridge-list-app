import type { ListAuthorizationRepository } from '../../../../src/modules/groceries'
import type { RequestContext } from '../../../../src/modules/shared'
import { ReceiptCommandService } from '../../../../src/modules/receipts/application/receiptCommands.service'
import type { ImageRepository, ReceiptRepository } from '../../../../src/modules/receipts/application/receiptPersistence'

const context: RequestContext = { principal: { kind: 'user', uid: 'u', email: 'u@example.com', emailVerified: true }, requestId: 'r', now: new Date('2026-08-02T12:00:00Z') }
const receipts = (): jest.Mocked<ReceiptRepository> => ({ nextId: jest.fn().mockReturnValue('receipt-1'), save: jest.fn().mockResolvedValue(undefined), find: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) })
const images = (): jest.Mocked<ImageRepository> => ({ save: jest.fn().mockResolvedValue(undefined), find: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) })
const access = (): jest.Mocked<ListAuthorizationRepository> => ({ assertAccessible: jest.fn() })

describe('ReceiptCommandService', () => {
  it('authorizes and saves the existing receipt/image shapes', async () => {
    const repo = receipts(), imageRepo = images(), authorization = access()
    const service = new ReceiptCommandService(repo, imageRepo, authorization)
    await expect(service.save(context, 'owner_email_com', {
      source_url: 'https://example.com/r', store_name: ' Store ', items: [{ name: 'Milk', price: 5, quantity: 2 }], total: 10,
      image: { data: Buffer.from('image').toString('base64'), contentType: 'image/jpeg' }
    })).resolves.toEqual({ key: 'receipt-1', imageSkipped: false })
    expect(authorization.assertAccessible).toHaveBeenCalledWith(context.principal, 'owner_email_com')
    expect(imageRepo.save).toHaveBeenCalledWith('receipt-1', { data: 'aW1hZ2U=', contentType: 'image/jpeg', uploaded_at: context.now.toISOString() })
    expect(repo.save).toHaveBeenCalledWith('owner_email_com', 'receipt-1', {
      image_url: null, image_ref: 'receipt-1', source_url: 'https://example.com/r', store_name: 'Store',
      items: [{ name: 'Milk', price: 5, quantity: 2 }], total: 10, scanned_at: context.now.toISOString(), scanned_by: 'u@example.com'
    })
  })

  it('uses the stored image reference for delete and authenticated image access', async () => {
    const repo = receipts(), imageRepo = images(), authorization = access()
    repo.find.mockResolvedValue({ image_url: null, image_ref: 'receipt', source_url: null, store_name: null, items: [], total: null, scanned_at: '', scanned_by: null })
    imageRepo.find.mockResolvedValue({ data: 'aW1hZ2U=', contentType: 'image/png', uploaded_at: '' })
    const service = new ReceiptCommandService(repo, imageRepo, authorization)
    await expect(service.getImage(context, 'list', 'receipt')).resolves.toEqual({ dataUrl: 'data:image/png;base64,aW1hZ2U=' })
    await service.delete(context, 'list', 'receipt')
    expect(imageRepo.delete).toHaveBeenCalledWith('receipt')
    expect(repo.delete).toHaveBeenCalledWith('list', 'receipt')
    expect(authorization.assertAccessible).toHaveBeenCalledTimes(2)
  })

  it('fails before persistence when authorization rejects', async () => {
    const repo = receipts(), imageRepo = images(), authorization = access()
    authorization.assertAccessible.mockRejectedValue({ code: 'forbidden' })
    await expect(new ReceiptCommandService(repo, imageRepo, authorization).save(context, 'list', { items: [] })).rejects.toMatchObject({ code: 'forbidden' })
    expect(repo.save).not.toHaveBeenCalled(); expect(imageRepo.save).not.toHaveBeenCalled()
  })

  it('preserves the UI contract by saving without an oversized image', async () => {
    const repo = receipts(), imageRepo = images(), authorization = access()
    const result = await new ReceiptCommandService(repo, imageRepo, authorization).save(context, 'list', {
      items: [], total: null, image: { data: Buffer.alloc(700_001).toString('base64'), contentType: 'image/jpeg' }
    })
    expect(result).toEqual({ key: 'receipt-1', imageSkipped: true })
    expect(imageRepo.save).not.toHaveBeenCalled()
    expect(repo.save).toHaveBeenCalledWith('list', 'receipt-1', expect.objectContaining({ image_ref: null }))
  })

  it('does not follow a tampered cross-receipt image reference', async () => {
    const repo = receipts(), imageRepo = images(), authorization = access()
    repo.find.mockResolvedValue({ image_url: null, image_ref: 'another-receipt', source_url: null, store_name: null, items: [], total: null, scanned_at: '', scanned_by: null })
    const service = new ReceiptCommandService(repo, imageRepo, authorization)
    await expect(service.getImage(context, 'list', 'receipt')).rejects.toMatchObject({ code: 'not_found' })
    await service.delete(context, 'list', 'receipt')
    expect(imageRepo.find).not.toHaveBeenCalled()
    expect(imageRepo.delete).not.toHaveBeenCalled()
    expect(repo.delete).toHaveBeenCalledWith('list', 'receipt')
  })

  it('cleans up a newly stored image when receipt persistence fails', async () => {
    const repo = receipts(), imageRepo = images(), authorization = access()
    repo.save.mockRejectedValue(new Error('database failed'))
    await expect(new ReceiptCommandService(repo, imageRepo, authorization).save(context, 'list', {
      items: [], image: { data: 'aW1hZ2U=', contentType: 'image/jpeg' }
    })).rejects.toThrow('database failed')
    expect(imageRepo.delete).toHaveBeenCalledWith('receipt-1')
  })
})
