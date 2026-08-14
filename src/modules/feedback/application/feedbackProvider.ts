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

export type FeedbackResult = {
  error: false
  cardUrl?: string
  ticket?: { id: string; url: string; title: string } | null
}

export interface FeedbackProvider {
  submit(submission: FeedbackSubmission): Promise<FeedbackResult>
}
