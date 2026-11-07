import '@tanstack/react-start/server-only'

import { randomUUID } from 'node:crypto'
import type { App } from 'firebase-admin/app'
import { getDatabaseWithUrl, type Database } from 'firebase-admin/database'

import { logger } from '../../../lib/logger'
import type { FeedbackRecord } from '../../../types'
import type {
  FeedbackRepository,
  FeedbackTicket,
  StoredFeedback
} from '../application/feedbackRepository'
import type { FeedbackSubmission } from '../application/feedbackProvider'

type DurableFeedbackRecord = FeedbackRecord & {
  submissionId: string
  actorUserId: string
  language?: string
  source?: string
  route?: string
  appVersion?: string
}

const toStoredFeedback = (record: DurableFeedbackRecord): StoredFeedback => ({
  submissionId: record.submissionId,
  actorUserId: record.actorUserId,
  status:
    record.status === 'ticket_created'
      ? 'ticket_created'
      : record.status === 'error'
        ? 'error'
        : 'processing',
  ticket: record.ticket
})

export class FirebaseFeedbackRepository implements FeedbackRepository {
  constructor(
    private readonly database: Database,
    private readonly createClaimId: () => string = randomUUID
  ) {}

  async createAndClaim(submission: FeedbackSubmission) {
    const recordRef = this.database.ref('feedbacks').child(submission.operationId)
    const claimId = this.createClaimId()
    const record: DurableFeedbackRecord = {
      submissionId: submission.operationId,
      actorUserId: submission.actorUserId,
      createdAt: submission.submittedAt,
      updatedAt: submission.submittedAt,
      userId: submission.actorUserId,
      username: submission.actorUserId,
      message: submission.request,
      status: 'processing',
      error: null,
      retryCount: 0,
      lastAttemptAt: submission.submittedAt,
      ticket: null,
      attemptId: claimId,
      ...(submission.language ? { language: submission.language } : {}),
      ...(submission.source ? { source: submission.source } : {}),
      ...(submission.route ? { route: submission.route } : {}),
      ...(submission.appVersion ? { appVersion: submission.appVersion } : {})
    }

    try {
      const result = await recordRef.transaction((current: DurableFeedbackRecord | null) =>
        current ?? record
      )
      const persisted = result.snapshot.val() as DurableFeedbackRecord | null
      if (
        !result.committed ||
        !result.snapshot.exists() ||
        !persisted ||
        persisted.submissionId !== submission.operationId
      ) {
        throw new Error('feedback persistence read-back mismatch')
      }
      if (persisted.actorUserId !== submission.actorUserId) {
        throw new Error('feedback submission identity conflict')
      }

      const created = persisted.attemptId === claimId
      logger.success(
        `[feedback] persisted submission=${submission.operationId} created=${created}`
      )
      return { created, record: toStoredFeedback(persisted) }
    } catch (error) {
      logger.error(`[feedback] persistence failed submission=${submission.operationId}`)
      throw error
    }
  }

  async markTicketCreated(submissionId: string, ticket: FeedbackTicket): Promise<void> {
    try {
      await this.database.ref('feedbacks').child(submissionId).update({
        status: 'ticket_created',
        error: null,
        ticket,
        attemptId: null,
        updatedAt: new Date().toISOString()
      })
      logger.success(`[feedback] completed submission=${submissionId}`)
    } catch (error) {
      logger.error(`[feedback] completion persistence failed submission=${submissionId}`)
      throw error
    }
  }

  async markError(submissionId: string, message: string): Promise<void> {
    try {
      await this.database.ref('feedbacks').child(submissionId).update({
        status: 'error',
        error: { message },
        retryCount: 1,
        attemptId: null,
        updatedAt: new Date().toISOString()
      })
      logger.warn(`[feedback] pending retry submission=${submissionId}`)
    } catch (error) {
      logger.error(`[feedback] failure persistence failed submission=${submissionId}`)
      throw error
    }
  }
}

export const createFirebaseFeedbackRepository = (app: App, databaseUrl: string) =>
  new FirebaseFeedbackRepository(getDatabaseWithUrl(databaseUrl, app))
