import { ApplicationError, type RequestContext } from '../../shared'
import type {
  FeedbackProvider,
  FeedbackProviderResult,
  FeedbackResult,
  FeedbackSubmission
} from './feedbackProvider'
import type { FeedbackRepository } from './feedbackRepository'

export const MAX_FEEDBACK_TEXT_LENGTH = 4_000

const optionalBoundedString = (
  input: Record<string, unknown>,
  key: string,
  maxLength: number
): string | undefined => {
  const value = input[key]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new ApplicationError('invalid_input', `${key} is invalid`)
  }
  return value
}

export class SubmitFeedbackService {
  constructor(
    private readonly provider: FeedbackProvider,
    private readonly repository: FeedbackRepository
  ) {}

  async execute(context: RequestContext, input: unknown): Promise<FeedbackResult> {
    if (context.principal.kind !== 'user') {
      throw new ApplicationError('forbidden', 'Feedback requires a user principal')
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new ApplicationError('invalid_input', 'Feedback input must be an object')
    }
    const body = input as Record<string, unknown>
    const request = typeof body.request === 'string' ? body.request.trim() : ''
    if (!request || request.length > MAX_FEEDBACK_TEXT_LENGTH) {
      throw new ApplicationError('invalid_input', 'Feedback request is empty or too long')
    }

    const submission: FeedbackSubmission = {
      request,
      actorUserId: context.principal.uid,
      operationId: context.requestId,
      submittedAt: context.now.toISOString(),
      language: optionalBoundedString(body, 'language', 16),
      source: optionalBoundedString(body, 'source', 64),
      route: optionalBoundedString(body, 'route', 200),
      appVersion: optionalBoundedString(body, 'appVersion', 32)
    }
    let stored
    try {
      stored = await this.repository.createAndClaim(submission)
    } catch (error) {
      throw new ApplicationError('upstream_failed', 'Feedback could not be saved', error)
    }

    if (!stored.created) {
      return {
        error: false,
        submissionId: submission.operationId,
        status: stored.record.status === 'ticket_created' ? 'ticket_created' : 'pending',
        ticket: stored.record.ticket
      }
    }

    let result: FeedbackProviderResult
    try {
      result = await this.provider.submit(submission)
    } catch {
      try {
        await this.repository.markError(
          submission.operationId,
          'Feedback provider request failed'
        )
      } catch (persistenceError) {
        throw new ApplicationError(
          'upstream_failed',
          'Feedback outcome could not be saved',
          persistenceError
        )
      }
      return {
        error: false,
        submissionId: submission.operationId,
        status: 'pending'
      }
    }

    try {
      await this.repository.markTicketCreated(submission.operationId, result.ticket ?? null)
    } catch (error) {
      throw new ApplicationError('upstream_failed', 'Feedback outcome could not be saved', error)
    }

    return {
      ...result,
      submissionId: submission.operationId,
      status: 'ticket_created'
    }
  }
}
