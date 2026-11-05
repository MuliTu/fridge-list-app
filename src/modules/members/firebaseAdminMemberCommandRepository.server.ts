import '@tanstack/react-start/server-only'

import type { App } from 'firebase-admin/app'
import { getDatabaseWithUrl } from 'firebase-admin/database'

import type { MemberCommandRepository } from './memberCommands.service'

export class FirebaseAdminMemberCommandRepository implements MemberCommandRepository {
  constructor(
    private readonly app: App,
    private readonly databaseUrl: string
  ) {}

  async invite(
    listId: string,
    inviteId: string,
    email: string,
    ownerEmail: string,
    invitedAt: string
  ): Promise<void> {
    await getDatabaseWithUrl(this.databaseUrl, this.app).ref().update({
      [`users/${listId}/invites/${inviteId}`]: { email, status: 'pending', invited_at: invitedAt },
      [`users/${inviteId}/memberOf/${listId}`]: { ownerEmail, status: 'pending' }
    })
  }

  async remove(listId: string, inviteId: string): Promise<void> {
    await getDatabaseWithUrl(this.databaseUrl, this.app).ref().update({
      [`users/${listId}/invites/${inviteId}`]: null,
      [`users/${inviteId}/memberOf/${listId}`]: null
    })
  }
}
