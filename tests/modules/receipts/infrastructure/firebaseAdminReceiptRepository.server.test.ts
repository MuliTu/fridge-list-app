/** @jest-environment node */
import { FirebaseAdminReceiptRepository } from '../../../../src/modules/receipts/infrastructure/firebaseAdminReceiptRepository.server'

it('preserves users/{list}/receipts/{id} and the receipt record shape', async () => {
  const fetcher = jest.fn().mockResolvedValue(new Response(null, { status: 200 }))
  const credential = { getAccessToken: jest.fn().mockResolvedValue({ access_token: 'token', expires_in: 3600 }) }
  const repository = new FirebaseAdminReceiptRepository('https://db.example', credential, fetcher, () => 'receipt-1')
  const record = { image_url: null, image_ref: 'receipt-1', source_url: null, store_name: 'Store', items: [], total: null, scanned_at: '2026-08-02T00:00:00Z', scanned_by: 'u@example.com' }
  await repository.save('owner_email_com', 'receipt-1', record)
  expect(fetcher).toHaveBeenCalledWith('https://db.example/users/owner_email_com/receipts/receipt-1.json', {
    method: 'PUT', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify(record)
  })
})
