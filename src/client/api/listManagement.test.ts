/** @jest-environment node */

import { createListManagementApiClient, ListManagementApiError } from './listManagement'

describe('list management API client', () => {
  it('authenticates, encodes identifiers, and accepts the verified MYW-65 result', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ deletedItems: 3 }), { status: 200 }))
    const client = createListManagementApiClient({ getIdToken: async () => 'id-token', fetch: fetchMock })

    await expect(client.deleteCustomList('owner/list', 'Weekend trip')).resolves.toEqual({ deletedItems: 3 })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/lists/owner%2Flist/shopping-lists/Weekend%20trip',
      expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer id-token' }) })
    )
  })

  it.each([null, {}, { deletedItems: -1 }, { deletedItems: 1.5 }, { deletedItems: '3' }])(
    'rejects an unverified successful response without inferring deletion (%p)', async (body) => {
      const client = createListManagementApiClient({
        getIdToken: async () => 'id-token',
        fetch: jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
      })
      await expect(client.deleteCustomList('owner', 'Trip')).rejects.toEqual(
        new ListManagementApiError(200, 'INVALID_RESPONSE', 'List deletion response was invalid')
      )
    }
  )

  it('maps a denied response to a safe typed error', async () => {
    const client = createListManagementApiClient({
      getIdToken: async () => undefined,
      fetch: jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }), { status: 403 }))
    })
    await expect(client.deleteCustomList('owner', 'Trip')).rejects.toEqual(
      new ListManagementApiError(403, 'FORBIDDEN', 'Forbidden')
    )
  })
})
