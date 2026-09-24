/** @jest-environment node */
import { FirebaseAdminReceiptImageRepository } from '../../../../src/modules/receipts/infrastructure/firebaseAdminReceiptImageRepository.server'

it('preserves the receiptImages/{receiptId} Firestore document shape', async () => {
  const doc = { set: jest.fn(), get: jest.fn(), delete: jest.fn() }
  const collection = jest.fn(() => ({ doc: jest.fn(() => doc) }))
  const repository = new FirebaseAdminReceiptImageRepository({ collection } as any)
  const record = { data: 'aW1hZ2U=', contentType: 'image/jpeg', uploaded_at: '2026-08-02T00:00:00Z' }
  await repository.save('receipt-1', record)
  expect(collection).toHaveBeenCalledWith('receiptImages')
  expect(doc.set).toHaveBeenCalledWith(record)
})
