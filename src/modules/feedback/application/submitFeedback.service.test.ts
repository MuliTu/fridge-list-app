import type { RequestContext } from '../../shared'
import type { FeedbackProvider } from './feedbackProvider'
import { MAX_FEEDBACK_TEXT_LENGTH, SubmitFeedbackService } from './submitFeedback.service'

const context: RequestContext = {
  principal: {
    kind: 'user', uid: 'verified-user', email: 'verified@example.com', emailVerified: true
  },
  requestId: 'operation-1',
  now: new Date('2026-08-02T10:00:00.000Z')
}

describe('SubmitFeedbackService', () => {
  it('uses authenticated context and request ID as the deduplication boundary', async () => {
    const provider: jest.Mocked<FeedbackProvider> = {
      submit: jest.fn().mockResolvedValue({ error: false, cardUrl: 'https://trello.com/c/abc' })
    }

    await expect(new SubmitFeedbackService(provider).execute(context, {
      request: '  Add dark mode  ',
      name: 'Attacker',
      email: 'attacker@example.com',
      submittedAt: 'attacker-time',
      language: 'en',
      source: 'fridge-list-app',
      route: '/stock',
      appVersion: '2.40.0'
    })).resolves.toEqual({ error: false, cardUrl: 'https://trello.com/c/abc' })

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
  })

  it.each([
    ['empty text', { request: '  ' }],
    ['missing text', {}],
    ['malformed input', ['feedback']],
    ['oversized text', { request: 'x'.repeat(MAX_FEEDBACK_TEXT_LENGTH + 1) }],
    ['oversized metadata', { request: 'valid', route: 'x'.repeat(201) }]
  ])('rejects %s without provider work', async (_case, input) => {
    const provider: jest.Mocked<FeedbackProvider> = { submit: jest.fn() }

    await expect(new SubmitFeedbackService(provider).execute(context, input)).rejects.toEqual(
      expect.objectContaining({ code: 'invalid_input' })
    )
    expect(provider.submit).not.toHaveBeenCalled()
  })
})
