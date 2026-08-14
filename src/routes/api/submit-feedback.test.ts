/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('../../modules/composition.server', () => ({
  getAuthenticatedUserHandler: jest.fn(),
  getSubmitFeedbackService: jest.fn()
}))

import type { SubmitFeedbackService } from '../../modules/feedback'
import { AuthenticatedUserHandler } from '../../modules/identity/server'
import { ApplicationError } from '../../modules/shared'
import { createSubmitFeedbackHandler } from './submit-feedback'

const request = (body: string, authorization?: string) =>
  new Request('http://localhost/api/submit-feedback', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {})
    },
    body
  })

const authenticatedHandler = () =>
  new AuthenticatedUserHandler({
    authenticationService: {
      execute: jest.fn().mockResolvedValue({
        kind: 'user', uid: 'user-1', email: 'user@example.com', emailVerified: true
      })
    },
    generateRequestId: () => 'operation-1'
  })

describe('POST /api/submit-feedback', () => {
  const submitFeedback = { execute: jest.fn() } as unknown as jest.Mocked<SubmitFeedbackService>

  beforeEach(() => jest.clearAllMocks())

  it('returns 401 and never delegates anonymous feedback', async () => {
    const authenticatedUserHandler = new AuthenticatedUserHandler({
      authenticationService: {
        execute: jest.fn().mockRejectedValue(new ApplicationError('unauthenticated', 'Missing bearer token'))
      }
    })

    const response = await createSubmitFeedbackHandler({ authenticatedUserHandler, submitFeedback })({
      request: request(JSON.stringify({ request: 'private feedback' }))
    })

    expect(response.status).toBe(401)
    expect(submitFeedback.execute).not.toHaveBeenCalled()
  })

  it('delegates exactly once and preserves the UI success response', async () => {
    submitFeedback.execute.mockResolvedValue({ error: false, cardUrl: 'https://trello.com/c/abc' })

    const response = await createSubmitFeedbackHandler({
      authenticatedUserHandler: authenticatedHandler(), submitFeedback
    })({
      request: request(JSON.stringify({ request: 'Add dark mode' }), 'Bearer token')
    })

    expect(submitFeedback.execute).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      error: false,
      cardUrl: 'https://trello.com/c/abc'
    })
  })
})
