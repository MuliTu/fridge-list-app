export type FeedbackSubmission = {
  request: string
  actorUserId: string
  operationId: string
  submittedAt: string
  language?: string
  source?: string
  route?: string
  appVersion?: string
}

export type FeedbackProviderResult = {
  error: false
  cardUrl?: string
  ticket?: { id: string; url: string; title: string } | null
}

export type FeedbackResult = FeedbackProviderResult & {
  submissionId: string
  status: 'pending' | 'ticket_created'
}

export interface FeedbackProvider {
  submit(submission: FeedbackSubmission): Promise<FeedbackProviderResult>
}
