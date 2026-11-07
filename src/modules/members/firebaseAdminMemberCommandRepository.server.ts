import '@tanstack/react-start/server-only'

import type { App } from 'firebase-admin/app'
import { getDatabaseWithUrl } from 'firebase-admin/database'

import type { MemberCommandRepository } from './memberCommands.service'

export class FirebaseAdminMemberCommandRepository implements MemberCommandRepository {
  constructor(
    private readonly app: App,
    private readonly databaseUrl: string
  ) {}

  private get database() {
    return getDatabaseWithUrl(this.databaseUrl, this.app)
  }

  async getList(listId: string) {
    const snapshot = await this.database.ref(`users/${listId}`).get()
    return snapshot.exists() ? snapshot.val() : null
  }

  async getMembership(memberId: string, listId: string): Promise<unknown> {
    return (await this.database.ref(`users/${memberId}/memberOf/${listId}`).get()).val()
  }

  async invite(
    listId: string,
    inviteId: string,
    email: string,
    ownerEmail: string,
    invitedAt: string,
    notificationLanguage: 'he' | 'en'
  ): Promise<void> {
    await this.database.ref().update({
      [`users/${listId}/invites/${inviteId}`]: {
        email,
        status: 'pending',
        invited_at: invitedAt,
        notificationLanguage
      },
      // Keep the released reverse-index shape. Readers also accept historical
      // object records, but new writes remain compatible without a migration.
      [`users/${inviteId}/memberOf/${listId}`]: 'pending'
    })
  }

  async remove(listId: string, inviteId: string): Promise<void> {
    await this.database.ref().update({
      [`users/${listId}/invites/${inviteId}`]: null,
      [`users/${inviteId}/memberOf/${listId}`]: null
    })
  }

  async updateNotificationLanguage(
    listId: string,
    inviteId: string,
    notificationLanguage: 'he' | 'en'
  ): Promise<boolean> {
    const reference = this.database.ref(`users/${listId}/invites/${inviteId}`)
    if (!(await reference.get()).exists()) return false
    await reference.update({ notificationLanguage })
    return true
  }
}
