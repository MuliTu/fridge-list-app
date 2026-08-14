/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import type { FeedbackSubmission } from '../application/feedbackProvider'
import { N8nFeedbackProvider, SUBMIT_FEEDBACK_WEBHOOK_URL } from './n8nFeedbackProvider.server'

const submission: FeedbackSubmission = {
  request: 'Add dark mode',
  actorUserId: 'user-1',
  operationId: 'operation-1',
  submittedAt: '2026-08-02T10:00:00.000Z',
  language: 'en'
}

describe('N8nFeedbackProvider', () => {
  it('preserves UI output while carrying the deduplication key to n8n', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      Response.json({ cardUrl: 'https://trello.com/c/abc', providerSecret: 'drop-me' })
    )

    await expect(new N8nFeedbackProvider(fetchMock).submit(submission)).resolves.toEqual({
      error: false,
      cardUrl: 'https://trello.com/c/abc',
      ticket: {
        id: '',
        url: 'https://trello.com/c/abc',
        title: 'Add dark mode'
      }
    })
    expect(fetchMock).toHaveBeenCalledWith(SUBMIT_FEEDBACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'operation-1' },
      body: JSON.stringify(submission)
    })
  })

  it.each([
    jest.fn().mockRejectedValue(new Error('network provider secret')),
    jest.fn().mockResolvedValue(new Response('not-json', { status: 502 })),
    jest.fn().mockResolvedValue(Response.json({ error: true, message: 'provider secret' }))
  ])('maps provider failures to safe typed errors', async (fetchMock) => {
    await expect(new N8nFeedbackProvider(fetchMock).submit(submission)).rejects.toEqual(
      expect.objectContaining({ code: 'upstream_failed' })
    )
  })
})
