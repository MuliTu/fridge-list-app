import '@tanstack/react-start/server-only'

import { deriveTicketFromN8nResponse } from '../../../lib/deriveTicket'
import { ApplicationError } from '../../shared'
import type { FeedbackProvider, FeedbackResult, FeedbackSubmission } from '../application/feedbackProvider'

type Fetch = typeof fetch

export class N8nFeedbackProvider implements FeedbackProvider {
  constructor(private readonly webhookUrl: string, private readonly fetchImpl: Fetch = fetch) {}

  async submit(submission: FeedbackSubmission): Promise<FeedbackResult> {
    let response: Response
    try {
      response = await this.fetchImpl(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': submission.operationId
        },
        body: JSON.stringify(submission)
      })
    } catch (error) {
      throw new ApplicationError('upstream_failed', 'Feedback provider request failed', error)
    }

    let data: unknown
    try {
      data = await response.json()
    } catch (error) {
      throw new ApplicationError('upstream_failed', 'Feedback provider response was invalid', error)
    }
    if (!response.ok || !data || typeof data !== 'object' || (data as Record<string, unknown>).error) {
      throw new ApplicationError('upstream_failed', `Feedback provider returned HTTP ${response.status}`)
    }

    const result = data as Record<string, unknown>
    const cardUrl = result.cardUrl
    return {
      error: false,
      ...(typeof cardUrl === 'string' ? { cardUrl } : {}),
      ticket: deriveTicketFromN8nResponse(result, submission.request)
    }
  }
}
