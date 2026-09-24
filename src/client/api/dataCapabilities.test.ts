/** @jest-environment node */

import {
  createDataCapabilitiesClient,
  DataCapabilitiesApiError
} from './dataCapabilities'

describe('data capabilities API client', () => {
  it('reads authenticated client-safe capabilities', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ groceries: { reads: 'rds', writes: 'firebase' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const client = createDataCapabilitiesClient({
      getIdToken: async () => 'id-token',
      fetch: fetchMock
    })

    await expect(client.get()).resolves.toEqual({
      groceries: { reads: 'rds', writes: 'firebase' }
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/data-capabilities',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer id-token' }
      })
    )
  })

  it('returns a typed failure without leaking response bodies', async () => {
    const client = createDataCapabilitiesClient({
      getIdToken: async () => undefined,
      fetch: jest.fn().mockResolvedValue(new Response('secret', { status: 500 }))
    })

    await expect(client.get()).rejects.toEqual(
      new DataCapabilitiesApiError(500)
    )
  })
})
