/** @jest-environment node */

import { createReceiptApiClient } from '../../../src/client/api/receipts'

if (!globalThis.btoa) {
  globalThis.btoa = (value: string) => Buffer.from(value, 'binary').toString('base64')
}

describe('receipt API client', () => {
  it('server-mediates receipt data and image bytes with authentication', async () => {
    const fetchMock = jest.fn().mockResolvedValue(Response.json({ key: 'receipt-1', imageSkipped: false }))
    const client = createReceiptApiClient({
      getIdToken: jest.fn().mockResolvedValue('firebase-token'),
      fetch: fetchMock
    })

    await expect(client.save('household/unsafe', {
      store_name: 'Store',
      items: [{ name: 'Milk', price: 5, quantity: 1 }],
      total: 5,
      source_url: null
    }, new Blob(['image-bytes'], { type: 'image/jpeg' }))).resolves.toEqual({
      key: 'receipt-1', imageSkipped: false
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/lists/household%2Funsafe/receipts')
    expect(options.headers).toEqual({
      'Content-Type': 'application/json', Authorization: 'Bearer firebase-token'
    })
    expect(JSON.parse(options.body)).toMatchObject({
      store_name: 'Store',
      image: { data: Buffer.from('image-bytes').toString('base64'), contentType: 'image/jpeg' }
    })
  })

  it('uses authenticated server endpoints for delete and image reads', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ dataUrl: 'data:image/jpeg;base64,aW1hZ2U=' }))
    const client = createReceiptApiClient({
      getIdToken: jest.fn().mockResolvedValue('firebase-token'), fetch: fetchMock
    })

    await client.delete('list-1', 'receipt-1')
    await expect(client.getImage('list-1', 'receipt-1')).resolves.toBe('data:image/jpeg;base64,aW1hZ2U=')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/lists/list-1/receipts/receipt-1')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/lists/list-1/receipts/receipt-1/image')
  })

  it('surfaces server upload limits and mapped errors', async () => {
    const client = createReceiptApiClient({
      getIdToken: jest.fn().mockResolvedValue('firebase-token'),
      fetch: jest.fn().mockResolvedValue(
        Response.json({ error: true, message: 'Invalid request' }, { status: 400 })
      )
    })

    await expect(client.save('list-1', {
      store_name: null, items: [], total: null, source_url: null
    }, new Blob(['too-large'], { type: 'image/jpeg' }))).rejects.toEqual(
      expect.objectContaining({ status: 400, message: 'Invalid request' })
    )
  })
})
