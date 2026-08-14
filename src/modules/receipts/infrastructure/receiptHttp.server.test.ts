/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { AuthenticatedUserHandler } from '../../identity/server'
import type { ReceiptCommandService } from '../application/receiptCommands.service'
import {
  createReceiptDeleteHandler,
  createReceiptImageGetHandler,
  createReceiptSaveHandler
} from './receiptHttp.server'

const authenticatedUserHandler = () => new AuthenticatedUserHandler({
  authenticationService: { execute: jest.fn().mockResolvedValue({
    kind: 'user', uid: 'user-1', email: 'user@example.com', emailVerified: true
  }) },
  generateRequestId: () => 'request-1'
})

const request = (method: string, body?: unknown) => new Request('http://localhost/api/receipt', {
  method,
  headers: { authorization: 'Bearer token', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
})

describe('receipt HTTP handlers', () => {
  const service = {
    save: jest.fn(), delete: jest.fn(), getImage: jest.fn()
  } as unknown as jest.Mocked<ReceiptCommandService>

  beforeEach(() => jest.clearAllMocks())

  it('delegates an authenticated receipt/image save exactly once', async () => {
    service.save.mockResolvedValue({ key: 'receipt-1', imageSkipped: false })
    const input = { items: [], image: { data: 'aW1hZ2U=', contentType: 'image/jpeg' } }

    const response = await createReceiptSaveHandler({
      authenticatedUserHandler: authenticatedUserHandler(), service
    })({ request: request('POST', input), listId: 'list-1' })

    expect(response.status).toBe(200)
    expect(service.save).toHaveBeenCalledWith(
      expect.objectContaining({ principal: expect.objectContaining({ uid: 'user-1' }) }),
      'list-1',
      input
    )
  })

  it('server-mediates delete and image retrieval through the stored receipt ID', async () => {
    service.getImage.mockResolvedValue({ dataUrl: 'data:image/png;base64,aW1hZ2U=' })

    const deleted = await createReceiptDeleteHandler({
      authenticatedUserHandler: authenticatedUserHandler(), service
    })({ request: request('DELETE'), listId: 'list-1', receiptId: 'receipt-1' })
    const image = await createReceiptImageGetHandler({
      authenticatedUserHandler: authenticatedUserHandler(), service
    })({ request: request('GET'), listId: 'list-1', receiptId: 'receipt-1' })

    expect(deleted.status).toBe(204)
    expect(service.delete).toHaveBeenCalledTimes(1)
    await expect(image.json()).resolves.toEqual({ dataUrl: 'data:image/png;base64,aW1hZ2U=' })
    expect(service.getImage).toHaveBeenCalledTimes(1)
  })
})
