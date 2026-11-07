/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

const update = jest.fn()
const get = jest.fn()
const reference = jest.fn((path = '') => ({
  get,
  update,
  path
}))
jest.mock('firebase-admin/database', () => ({
  getDatabaseWithUrl: () => ({ ref: reference })
}))

import { FirebaseAdminMemberCommandRepository } from './firebaseAdminMemberCommandRepository.server'

describe('FirebaseAdminMemberCommandRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('writes the released string memberOf shape for new invitations', async () => {
    const repository = new FirebaseAdminMemberCommandRepository({} as any, 'https://example.test')
    await repository.invite(
      'owner_name@example_com',
      'member_name@example_com',
      'member_name@example.com',
      'owner_name@example.com',
      '2026-11-07T00:00:00.000Z',
      'en'
    )

    expect(update).toHaveBeenCalledWith({
      'users/owner_name@example_com/invites/member_name@example_com': {
        email: 'member_name@example.com',
        status: 'pending',
        invited_at: '2026-11-07T00:00:00.000Z',
        notificationLanguage: 'en'
      },
      'users/member_name@example_com/memberOf/owner_name@example_com': 'pending'
    })
  })

  it('removes only the exact mirrored grant pair', async () => {
    const repository = new FirebaseAdminMemberCommandRepository({} as any, 'https://example.test')
    await repository.remove('owner@example_com', 'member@example_com')

    expect(update).toHaveBeenCalledWith({
      'users/owner@example_com/invites/member@example_com': null,
      'users/member@example_com/memberOf/owner@example_com': null
    })
  })
})
