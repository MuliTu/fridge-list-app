import { ApplicationError, type RequestContext } from '../../shared'
import type { FeedbackProvider, FeedbackResult, FeedbackSubmission } from './feedbackProvider'

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
  constructor(private readonly provider: FeedbackProvider) {}

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
    return this.provider.submit(submission)
  }
}
