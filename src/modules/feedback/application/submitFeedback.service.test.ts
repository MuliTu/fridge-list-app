import type { RequestContext } from '../../shared'
import type { FeedbackProvider } from './feedbackProvider'
import type { FeedbackRepository } from './feedbackRepository'
import { MAX_FEEDBACK_TEXT_LENGTH, SubmitFeedbackService } from './submitFeedback.service'

const context: RequestContext = {
  principal: {
    kind: 'user', uid: 'verified-user', email: 'verified@example.com', emailVerified: true
  },
  requestId: 'operation-1',
  now: new Date('2026-08-02T10:00:00.000Z')
}

describe('SubmitFeedbackService', () => {
  const repository = (): jest.Mocked<FeedbackRepository> => ({
    createAndClaim: jest.fn().mockResolvedValue({
      created: true,
      record: {
        submissionId: 'operation-1',
        actorUserId: 'verified-user',
        status: 'processing',
        ticket: null
      }
    }),
    markTicketCreated: jest.fn().mockResolvedValue(undefined),
    markError: jest.fn().mockResolvedValue(undefined)
  })

  it('uses authenticated context and request ID as the deduplication boundary', async () => {
    const provider: jest.Mocked<FeedbackProvider> = {
      submit: jest.fn().mockResolvedValue({ error: false, cardUrl: 'https://trello.com/c/abc' })
    }
    const feedbackRepository = repository()

    await expect(new SubmitFeedbackService(provider, feedbackRepository).execute(context, {
      request: '  Add dark mode  ',
      name: 'Attacker',
      email: 'attacker@example.com',
      submittedAt: 'attacker-time',
      language: 'en',
      source: 'fridge-list-app',
      route: '/stock',
      appVersion: '2.40.0'
    })).resolves.toEqual({
      error: false,
      cardUrl: 'https://trello.com/c/abc',
      submissionId: 'operation-1',
      status: 'ticket_created'
    })

    expect(provider.submit).toHaveBeenCalledWith({
      request: 'Add dark mode',
      actorUserId: 'verified-user',
      operationId: 'operation-1',
      submittedAt: '2026-08-02T10:00:00.000Z',
      language: 'en',
      source: 'fridge-list-app',
      route: '/stock',
      appVersion: '2.40.0'
    })
    expect(JSON.stringify(provider.submit.mock.calls)).not.toContain('attacker@example.com')
    expect(feedbackRepository.createAndClaim).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'verified-user', operationId: 'operation-1' })
    )
    expect(feedbackRepository.createAndClaim.mock.invocationCallOrder[0]).toBeLessThan(
      provider.submit.mock.invocationCallOrder[0]
    )
    expect(feedbackRepository.markTicketCreated).toHaveBeenCalledWith('operation-1', null)
  })

  it('stops before dispatch when durable persistence fails', async () => {
    const provider: jest.Mocked<FeedbackProvider> = { submit: jest.fn() }
    const feedbackRepository = repository()
    feedbackRepository.createAndClaim.mockRejectedValue(new Error('permission denied'))

    await expect(
      new SubmitFeedbackService(provider, feedbackRepository).execute(context, {
        request: 'private feedback'
      })
    ).rejects.toEqual(
      expect.objectContaining({ code: 'upstream_failed', message: 'Feedback could not be saved' })
    )
    expect(provider.submit).not.toHaveBeenCalled()
  })

  it('fails closed when the same operation ID belongs to another actor', async () => {
    const provider: jest.Mocked<FeedbackProvider> = { submit: jest.fn() }
    const feedbackRepository = repository()
    feedbackRepository.createAndClaim.mockRejectedValue(
      new Error('feedback submission identity conflict: secret-card')
    )

    await expect(
      new SubmitFeedbackService(provider, feedbackRepository).execute(context, {
        request: 'private feedback'
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'upstream_failed',
        message: 'Feedback could not be saved'
      })
    )
    expect(provider.submit).not.toHaveBeenCalled()
  })

  it('keeps provider failures durable and returns a saved pending receipt', async () => {
    const provider: jest.Mocked<FeedbackProvider> = {
      submit: jest.fn().mockRejectedValue(new Error('n8n unavailable'))
    }
    const feedbackRepository = repository()

    await expect(
      new SubmitFeedbackService(provider, feedbackRepository).execute(context, {
        request: 'private feedback'
      })
    ).resolves.toEqual({
      error: false,
      submissionId: 'operation-1',
      status: 'pending'
    })
    expect(feedbackRepository.markError).toHaveBeenCalledWith(
      'operation-1',
      'Feedback provider request failed'
    )
  })

  it('reuses an existing same-actor receipt without dispatching twice', async () => {
    const provider: jest.Mocked<FeedbackProvider> = { submit: jest.fn() }
    const feedbackRepository = repository()
    feedbackRepository.createAndClaim.mockResolvedValue({
      created: false,
      record: {
        submissionId: 'operation-1',
        actorUserId: 'verified-user',
        status: 'ticket_created',
        ticket: { id: 'card-1', url: 'https://trello.com/c/card-1', title: 'Feedback' }
      }
    })

    await expect(
      new SubmitFeedbackService(provider, feedbackRepository).execute(context, {
        request: 'private feedback'
      })
    ).resolves.toEqual({
      error: false,
      submissionId: 'operation-1',
      status: 'ticket_created',
      ticket: { id: 'card-1', url: 'https://trello.com/c/card-1', title: 'Feedback' }
    })
    expect(provider.submit).not.toHaveBeenCalled()
  })

  it.each([
    ['empty text', { request: '  ' }],
    ['missing text', {}],
    ['malformed input', ['feedback']],
    ['oversized text', { request: 'x'.repeat(MAX_FEEDBACK_TEXT_LENGTH + 1) }],
    ['oversized metadata', { request: 'valid', route: 'x'.repeat(201) }]
  ])('rejects %s without provider work', async (_case, input) => {
    const provider: jest.Mocked<FeedbackProvider> = { submit: jest.fn() }

    await expect(
      new SubmitFeedbackService(provider, repository()).execute(context, input)
    ).rejects.toEqual(
      expect.objectContaining({ code: 'invalid_input' })
    )
    expect(provider.submit).not.toHaveBeenCalled()
  })
})
