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
}

export interface FeedbackProvider {
  submit(submission: FeedbackSubmission): Promise<FeedbackResult>
}
