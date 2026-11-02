import type { App } from 'firebase-admin/app'
import { getDatabaseWithUrl } from 'firebase-admin/database'

import type { CatalogAuthorizationRepository } from '../catalog'
import { ApplicationError, type RequestContext } from '../shared'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emailKey = (email: string) => email.toLowerCase().replace(/[.#$[\]]/g, '_')

export class MemberCommandService {
  constructor(
    private readonly app: App,
    private readonly databaseUrl: string,
    private readonly authorization: CatalogAuthorizationRepository
  ) {}

  async invite(context: RequestContext, listId: string, input: unknown): Promise<void> {
    await this.authorization.assertOwner(context.principal, listId)
    const email = input && typeof input === 'object' ? (input as { email?: unknown }).email : undefined
    if (typeof email !== 'string' || !emailPattern.test(email.trim()) || email.length > 254) {
      throw new ApplicationError('invalid_input', 'A valid member email is required')
    }
    const normalized = email.trim().toLowerCase()
    if (context.principal.kind === 'user' && context.principal.email && normalized === context.principal.email.toLowerCase()) {
      throw new ApplicationError('conflict', 'The list owner is already a member')
    }
    const database = getDatabaseWithUrl(this.databaseUrl, this.app)
    const inviteId = emailKey(normalized)
    await database.ref().update({
      [`users/${listId}/invites/${inviteId}`]: { email: normalized, status: 'pending', invited_at: context.now.toISOString() },
      [`users/${inviteId}/memberOf/${listId}`]: { ownerEmail: context.principal.kind === 'user' ? context.principal.email ?? '' : '', status: 'pending' }
    })
  }

  async remove(context: RequestContext, listId: string, email: string): Promise<void> {
    await this.authorization.assertOwner(context.principal, listId)
    const normalized = email.trim().toLowerCase()
    if (!emailPattern.test(normalized)) throw new ApplicationError('invalid_input', 'A valid member email is required')
    const database = getDatabaseWithUrl(this.databaseUrl, this.app)
    const inviteId = emailKey(normalized)
    await database.ref().update({
      [`users/${listId}/invites/${inviteId}`]: null,
      [`users/${inviteId}/memberOf/${listId}`]: null
    })
  }
}
