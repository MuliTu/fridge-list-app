import type { FeedbackSubmission } from './feedbackProvider'

export type FeedbackTicket = { id: string; url: string; title: string } | null

export type StoredFeedback = {
  submissionId: string
  actorUserId: string
  status: 'processing' | 'ticket_created' | 'error'
  ticket: FeedbackTicket
}

export interface FeedbackRepository {
  createAndClaim(submission: FeedbackSubmission): Promise<{
    created: boolean
    record: StoredFeedback
  }>
  markTicketCreated(submissionId: string, ticket: FeedbackTicket): Promise<void>
  markError(submissionId: string, message: string): Promise<void>
}
