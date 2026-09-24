/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

const authenticateMock = jest.fn()
const authenticateRequestMock = jest.fn()
const executeMock = jest.fn()
const getN8nGroceryWriteDependenciesMock = jest.fn(() => ({
  authenticateRequest: authenticateRequestMock,
  service: { execute: executeMock }
}))

jest.mock('../../../src/modules/composition.server', () => ({
  getN8nGroceryWriteDependencies: () => getN8nGroceryWriteDependenciesMock()
}))

import { ApplicationError } from '../../../src/modules/shared'
import { Route } from '../../../src/routes/api/n8n-write-groceries'

const postHandler = (Route.options.server as any).handlers.POST

const callPost = (body: unknown, headers: Record<string, string> = {}) =>
  postHandler({
    request: new Request('http://localhost/api/n8n-write-groceries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  })

describe('POST /api/n8n-write-groceries', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authenticateMock.mockReturnValue({
      kind: 'service',
      service: 'n8n',
      scopes: ['groceries:write'],
      allowedListIds: new Set(['allowed-list'])
    })
    authenticateRequestMock.mockImplementation((headers: Headers) => ({
      principal: authenticateMock(headers),
      requestId: 'request-123',
      now: new Date('2026-08-02T08:00:00.000Z')
    }))
  })

  it('authenticates before parsing the request body', async () => {
    authenticateRequestMock.mockImplementation(() => {
      throw new ApplicationError('unauthenticated', 'Invalid machine credentials')
    })

    const response = await callPost('{not-json', { 'x-n8n-secret': 'wrong' })

    expect(response.status).toBe(401)
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('fails closed when server authentication or Admin persistence is not configured', async () => {
    getN8nGroceryWriteDependenciesMock.mockImplementationOnce(() => {
      throw new ApplicationError('not_configured', 'Missing configuration')
    })

    const response = await callPost({ action: 'insert' }, { 'x-n8n-secret': 'secret' })

    expect(response.status).toBe(500)
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON after successful authentication', async () => {
    const response = await callPost('{not-json', { 'x-n8n-secret': 'secret' })

    expect(response.status).toBe(400)
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('rejects unsupported actions before persistence', async () => {
    const response = await callPost({ action: 'delete' }, { 'x-n8n-secret': 'secret' })

    expect(response.status).toBe(400)
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('persists an insert through the allowed-list service boundary', async () => {
    executeMock.mockResolvedValue({ action: 'insert', key: 'new-key-123' })
    const body = {
      action: 'insert',
      key: null,
      item: 'חלב',
      category: 'מוצרי חלב',
      added_at: '2026-08-02T10:30:00.000Z',
      raw_text: 'נוסף מידנית',
      created_by: null,
      attackerControlledField: 'drop-me'
    }

    const response = await callPost(body, { 'x-n8n-secret': 'secret' })

    expect(executeMock).toHaveBeenCalledWith('allowed-list', {
      action: 'insert',
      item: body.item,
      category: body.category,
      added_at: body.added_at,
      raw_text: body.raw_text,
      created_by: null
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, action: 'insert', key: 'new-key-123' })
  })

  it('forwards an integration idempotency key for retry-safe inserts', async () => {
    executeMock.mockResolvedValue({ action: 'insert', key: 'integration-key' })

    const response = await callPost(
      { action: 'insert', item: 'Milk', category: 'Dairy', added_at: '2026-08-02T10:30:00.000Z' },
      { 'x-n8n-secret': 'secret', 'x-idempotency-key': 'workflow-run-42' }
    )

    expect(response.status).toBe(200)
    expect(executeMock).toHaveBeenCalledWith('allowed-list', {
      action: 'insert',
      item: 'Milk',
      category: 'Dairy',
      added_at: '2026-08-02T10:30:00.000Z',
      raw_text: undefined,
      created_by: undefined,
      idempotency_key: 'workflow-run-42'
    })
  })

  it('persists only the key and timestamp for reactivation', async () => {
    executeMock.mockResolvedValue({ action: 'update', key: 'existing-key' })

    const response = await callPost(
      {
        action: 'update',
        key: 'existing-key',
        item: 'ignored',
        category: 'ignored',
        added_at: '2026-08-02T10:30:00.000Z'
      },
      { 'x-n8n-secret': 'secret' }
    )

    expect(executeMock).toHaveBeenCalledWith('allowed-list', {
      action: 'update',
      key: 'existing-key',
      added_at: '2026-08-02T10:30:00.000Z'
    })
    expect(response.status).toBe(200)
  })

  it('rejects a principal without the required scope', async () => {
    authenticateRequestMock.mockReturnValue({
      principal: {
        kind: 'service',
        service: 'n8n',
        scopes: [],
        allowedListIds: new Set(['allowed-list'])
      },
      requestId: 'request-123',
      now: new Date('2026-08-02T08:00:00.000Z')
    })

    const response = await callPost({ action: 'insert' }, { 'x-n8n-secret': 'secret' })

    expect(response.status).toBe(403)
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('maps persistence validation errors without leaking internal failures', async () => {
    executeMock.mockRejectedValue(new ApplicationError('invalid_input', 'item must contain 1-200 characters'))

    const response = await callPost(
      { action: 'insert', item: '', category: 'Dairy', added_at: '2026-08-02T10:30:00Z' },
      { 'x-n8n-secret': 'secret' }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: true,
      message: 'Invalid request'
    })
  })
})
