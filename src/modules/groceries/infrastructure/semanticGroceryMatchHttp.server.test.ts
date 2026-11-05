/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { AuthenticatedUserHandler } from '../../identity/server'
import { ApplicationError } from '../../shared'
import type { SemanticGroceryMatchService } from '../application/semanticGroceryMatch.service'
import { createSemanticGroceryMatchPostHandler } from './semanticGroceryMatchHttp.server'

const principal = {
  kind: 'user' as const,
  uid: 'member-1',
  email: 'member@example.test',
  emailVerified: true
}

const request = (body: unknown, authorization = 'Bearer token') =>
  new Request('http://localhost/api/lists/selected-list/groceries/matches', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

describe('semantic grocery match HTTP adapter', () => {
  it('passes authenticated context, selected list identity, and input to the service', async () => {
    const service = {
      execute: jest.fn().mockResolvedValue({
        status: 'ok',
        evaluatedName: 'milk',
        snapshotId: 'a'.repeat(64),
        classification: 'distinct',
        matches: [],
        candidateCount: 0
      })
    } as unknown as jest.Mocked<SemanticGroceryMatchService>
    const authenticatedUserHandler = new AuthenticatedUserHandler({
      authenticationService: { execute: jest.fn().mockResolvedValue(principal) },
      generateRequestId: () => 'request-1',
      now: () => new Date('2026-11-04T12:00:00.000Z')
    })

    const response = await createSemanticGroceryMatchPostHandler({
      authenticatedUserHandler,
      service
    })({ request: request({ query: 'milk' }), listId: 'selected-list' })

    expect(response.status).toBe(200)
    expect(service.execute).toHaveBeenCalledWith(
      expect.objectContaining({ principal, requestId: 'request-1' }),
      'selected-list',
      { query: 'milk' }
    )
  })

  it('rejects unauthenticated requests before the service runs', async () => {
    const service = { execute: jest.fn() } as unknown as jest.Mocked<SemanticGroceryMatchService>
    const authenticatedUserHandler = new AuthenticatedUserHandler({
      authenticationService: {
        execute: jest.fn().mockRejectedValue(new ApplicationError('unauthenticated', 'Unauthorized'))
      }
    })

    const response = await createSemanticGroceryMatchPostHandler({
      authenticatedUserHandler,
      service
    })({ request: request({ query: 'milk' }, ''), listId: 'selected-list' })

    expect(response.status).toBe(401)
    expect(service.execute).not.toHaveBeenCalled()
  })
})
