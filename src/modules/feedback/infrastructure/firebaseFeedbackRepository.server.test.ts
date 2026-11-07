/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('../../../lib/logger', () => ({
  logger: { success: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))

import { FirebaseFeedbackRepository } from './firebaseFeedbackRepository.server'

const submission = {
  request: 'private feedback',
  actorUserId: 'verified-user',
  operationId: 'operation-1',
  submittedAt: '2026-08-02T10:00:00.000Z',
  language: 'en',
  source: 'fridge-list-app',
  route: '/stock',
  appVersion: '2.64.1'
}

describe('FirebaseFeedbackRepository', () => {
  const setup = (existing: unknown = null) => {
    const update = jest.fn().mockResolvedValue(undefined)
    const transaction = jest.fn(async (mutate: (current: unknown) => unknown) => {
      const value = mutate(existing)
      return {
        committed: true,
        snapshot: { exists: () => true, val: () => value }
      }
    })
    const child = jest.fn(() => ({ transaction, update }))
    const ref = jest.fn(() => ({ child }))
    const repository = new FirebaseFeedbackRepository(
      { ref } as any,
      () => 'claim-this-request'
    )
    return { repository, ref, child, transaction, update }
  }

  it('atomically creates and claims the authoritative record before dispatch', async () => {
    const { repository, transaction } = setup()

    await expect(repository.createAndClaim(submission)).resolves.toEqual({
      created: true,
      record: {
        submissionId: 'operation-1',
        actorUserId: 'verified-user',
        status: 'processing',
        ticket: null
      }
    })

    const mutate = transaction.mock.calls[0][0]
    expect(mutate(null)).toMatchObject({
      submissionId: 'operation-1',
      actorUserId: 'verified-user',
      userId: 'verified-user',
      message: 'private feedback',
      status: 'processing',
      attemptId: 'claim-this-request',
      retryCount: 0,
      language: 'en',
      source: 'fridge-list-app',
      route: '/stock',
      appVersion: '2.64.1'
    })
  })

  it('does not overwrite or claim an existing same-actor submission', async () => {
    const existing = {
      submissionId: 'operation-1',
      actorUserId: 'verified-user',
      status: 'ticket_created',
      attemptId: null,
      ticket: { id: 'card-1', url: 'https://trello.com/c/card-1', title: 'Feedback' }
    }
    const { repository, transaction } = setup(existing)

    await expect(repository.createAndClaim(submission)).resolves.toEqual({
      created: false,
      record: {
        submissionId: 'operation-1',
        actorUserId: 'verified-user',
        status: 'ticket_created',
        ticket: existing.ticket
      }
    })
    expect(transaction.mock.calls[0][0](existing)).toBe(existing)
  })

  it('does not claim creation when a transaction retry observes a concurrent winner', async () => {
    const winner = {
      submissionId: 'operation-1',
      actorUserId: 'verified-user',
      status: 'processing',
      attemptId: 'other-request-claim',
      ticket: null
    }
    const transaction = jest.fn(async (mutate: (current: unknown) => unknown) => {
      expect(mutate(null)).toMatchObject({ attemptId: 'claim-this-request' })
      expect(mutate(winner)).toBe(winner)
      return {
        committed: true,
        snapshot: { exists: () => true, val: () => winner }
      }
    })
    const child = jest.fn(() => ({ transaction, update: jest.fn() }))
    const repository = new FirebaseFeedbackRepository(
      { ref: jest.fn(() => ({ child })) } as any,
      () => 'claim-this-request'
    )

    await expect(repository.createAndClaim(submission)).resolves.toEqual({
      created: false,
      record: {
        submissionId: 'operation-1',
        actorUserId: 'verified-user',
        status: 'processing',
        ticket: null
      }
    })
  })

  it('rejects a same-operation collision from another actor without returning its metadata', async () => {
    const otherActor = {
      submissionId: 'operation-1',
      actorUserId: 'other-user',
      status: 'ticket_created',
      attemptId: null,
      ticket: { id: 'secret-card', url: 'https://example.test/secret', title: 'Secret' }
    }
    const { repository } = setup(otherActor)

    await expect(repository.createAndClaim(submission)).rejects.toThrow(
      'feedback submission identity conflict'
    )
  })

  it('records provider failure as retryable without raw feedback in the update path', async () => {
    const { repository, update } = setup()

    await repository.markError('operation-1', 'Feedback provider request failed')

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error: { message: 'Feedback provider request failed' },
        retryCount: 1,
        attemptId: null
      })
    )
    expect(JSON.stringify(update.mock.calls)).not.toContain('private feedback')
  })
})
