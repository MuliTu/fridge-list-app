/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('../../modules/composition.server', () => ({
  getAuthenticatedUserHandler: jest.fn(),
  getReleasesService: jest.fn()
}))

import { AuthenticatedUserHandler } from '../../modules/identity/server'
import type { GetReleasesService } from '../../modules/releases'
import { ApplicationError } from '../../modules/shared'
import { createGetReleasesHandler } from './releases'

const request = (authorization?: string) =>
  new Request('http://localhost/api/releases', {
    headers: authorization ? { authorization } : undefined
  })

describe('GET /api/releases', () => {
  const releases = {
    execute: jest.fn()
  } as unknown as jest.Mocked<GetReleasesService>

  beforeEach(() => jest.clearAllMocks())

  it('authenticates before making its one service call', async () => {
    const authenticatedUserHandler = new AuthenticatedUserHandler({
      authenticationService: {
        execute: jest.fn().mockResolvedValue({
          kind: 'user',
          uid: 'user-1',
          email: 'user@example.com',
          emailVerified: true
        })
      },
      generateRequestId: () => 'request-1'
    })
    releases.execute.mockResolvedValue([
      { tag_name: 'v1', name: 'One', published_at: '2026-08-01T00:00:00Z', body: '' }
    ])

    const response = await createGetReleasesHandler({ authenticatedUserHandler, releases })({
      request: request('Bearer token')
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      releases: [{ tag_name: 'v1', name: 'One', published_at: '2026-08-01T00:00:00Z', body: '' }]
    })
    expect(releases.execute).toHaveBeenCalledTimes(1)
  })

  it('returns 401 without provider work when authentication fails', async () => {
    const authenticatedUserHandler = new AuthenticatedUserHandler({
      authenticationService: {
        execute: jest.fn().mockRejectedValue(new ApplicationError('unauthenticated', 'Missing bearer token'))
      }
    })

    const response = await createGetReleasesHandler({ authenticatedUserHandler, releases })({
      request: request()
    })

    expect(response.status).toBe(401)
    expect(releases.execute).not.toHaveBeenCalled()
  })
})
