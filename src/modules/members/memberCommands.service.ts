import type { CatalogAuthorizationRepository } from '../catalog'
import { ApplicationError, type RequestContext } from '../shared'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emailKey = (email: string) => email.toLowerCase().replace(/[.#$[\]]/g, '_')

export interface MemberCommandRepository {
  invite(listId: string, inviteId: string, email: string, ownerEmail: string, invitedAt: string): Promise<void>
  remove(listId: string, inviteId: string): Promise<void>
}

export class MemberCommandService {
  constructor(
    private readonly repository: MemberCommandRepository,
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
    const inviteId = emailKey(normalized)
    await this.repository.invite(
      listId,
      inviteId,
      normalized,
      context.principal.kind === 'user' ? context.principal.email ?? '' : '',
      context.now.toISOString()
    )
  }

  async remove(context: RequestContext, listId: string, email: string): Promise<void> {
    await this.authorization.assertOwner(context.principal, listId)
    const normalized = email.trim().toLowerCase()
    if (!emailPattern.test(normalized)) throw new ApplicationError('invalid_input', 'A valid member email is required')
    const inviteId = emailKey(normalized)
    await this.repository.remove(listId, inviteId)
  }
}
