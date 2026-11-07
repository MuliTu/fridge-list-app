/** @jest-environment node */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { AuthenticatedUserHandler } from '../../identity/server'
import { ListDeletionService, type ListDeletionRepository } from '../application/listDeletion.service'
import { createListDeleteHandler } from './listDeletionHttp.server'

const request = (authorization?: string) => new Request(
  'https://app.example/api/lists/house/shopping-lists/Camping',
  { method: 'DELETE', headers: authorization ? { authorization } : undefined }
)

const setup = (principal?: { uid: string; email: string }) => {
  const repository: jest.Mocked<ListDeletionRepository> = {
    deleteCustomList: jest.fn().mockResolvedValue({ deletedItems: 2 })
  }
  const authenticatedUserHandler = new AuthenticatedUserHandler({
    authenticationService: {
      execute: jest.fn(async () => {
        if (!principal) throw new (await import('../../shared')).ApplicationError('unauthenticated', 'Sign in required')
        return { kind: 'user' as const, ...principal, emailVerified: true }
      })
    },
    generateRequestId: () => 'request-1',
    now: () => new Date('2026-11-07T12:00:00Z')
  })
  return { repository, handler: createListDeleteHandler({ authenticatedUserHandler, service: new ListDeletionService(repository) }) }
}

it('rejects signed-out direct requests before persistence', async () => {
  const d = setup()
  const response = await d.handler({ request: request(), listId: 'house', listName: 'Camping' })
  expect(response.status).toBe(401)
  expect(d.repository.deleteCustomList).not.toHaveBeenCalled()
})

it('derives the actor from authentication and never from request parameters', async () => {
  const d = setup({ uid: 'trusted-owner', email: 'owner@example.com' })
  const response = await d.handler({ request: request('Bearer valid'), listId: 'house', listName: 'Camping' })
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ deletedItems: 2 })
  expect(d.repository.deleteCustomList).toHaveBeenCalledWith({
    listId: 'house', listName: 'Camping', actorUid: 'trusted-owner'
  })
})
