import type { CatalogAuthorizationRepository } from '../catalog'
import { ApplicationError, type RequestContext } from '../shared'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emailKey = (email: string) => email.toLowerCase().replace(/[.#$[\]]/g, '_')

export interface MemberCommandRepository {
  getList(listId: string): Promise<{
    name?: unknown
    normalizedOwnerEmail?: unknown
    ownerUid?: unknown
    invites?: Record<string, unknown>
  } | null>
  getMembership(memberId: string, listId: string): Promise<unknown>
  invite(
    listId: string,
    inviteId: string,
    email: string,
    ownerEmail: string,
    invitedAt: string,
    notificationLanguage: 'he' | 'en'
  ): Promise<void>
  remove(listId: string, inviteId: string): Promise<void>
  updateNotificationLanguage(
    listId: string,
    inviteId: string,
    notificationLanguage: 'he' | 'en'
  ): Promise<boolean>
}

export type ListMemberSummary = {
  email: string
  status: 'pending' | 'approved'
  notificationLanguage: 'he' | 'en'
}

export type ListMembershipSummary = {
  listId: string
  name: string
  ownerEmail: string
  isOwner: boolean
  members: ListMemberSummary[]
}

const invitationLanguage = (value: unknown): 'he' | 'en' => value === 'en' ? 'en' : 'he'

const invitationRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : { status: value }

const approvedMembership = (value: unknown, ownerEmail: string | null): boolean => {
  if (value === 'approved') return true
  if (!value || typeof value !== 'object') return false
  const record = value as { status?: unknown; ownerEmail?: unknown }
  return record.status === 'approved' &&
    ownerEmail !== null &&
    typeof record.ownerEmail === 'string' &&
    record.ownerEmail.trim().toLowerCase() === ownerEmail
}

const approvedInvitation = (value: unknown, memberEmail: string): boolean => {
  if (!value || typeof value !== 'object') return false
  const record = value as { status?: unknown; email?: unknown }
  return record.status === 'approved' &&
    typeof record.email === 'string' &&
    record.email.trim().toLowerCase() === memberEmail
}

export class MemberCommandService {
  constructor(
    private readonly repository: MemberCommandRepository,
    private readonly authorization: CatalogAuthorizationRepository
  ) {}

  private async authorizedList(context: RequestContext, listId: string) {
    if (
      context.principal.kind !== 'user' ||
      !context.principal.emailVerified ||
      !context.principal.email
    ) {
      throw new ApplicationError('forbidden', 'A verified email is required to inspect list members')
    }

    const list = await this.repository.getList(listId)
    if (!list) {
      throw new ApplicationError('forbidden', 'User cannot manage this list membership')
    }
    const normalizedEmail = context.principal.email.trim().toLowerCase()
    const memberId = emailKey(normalizedEmail)
    const normalizedOwnerEmail = typeof list.normalizedOwnerEmail === 'string' &&
      emailPattern.test(list.normalizedOwnerEmail)
      ? list.normalizedOwnerEmail.trim().toLowerCase()
      : null
    const isOwner = list.ownerUid === context.principal.uid ||
      (!list.ownerUid && normalizedOwnerEmail === normalizedEmail)
    if (isOwner) return { list, isOwner, memberId, membership: null }

    const membership = await this.repository.getMembership(memberId, listId)
    if (
      !approvedMembership(membership, normalizedOwnerEmail) ||
      !approvedInvitation(list.invites?.[memberId], normalizedEmail)
    ) {
      throw new ApplicationError('forbidden', 'User cannot manage this list membership')
    }
    return { list, isOwner, memberId, membership }
  }

  async getSummary(context: RequestContext, listId: string): Promise<ListMembershipSummary> {
    const { list, isOwner, membership } = await this.authorizedList(context, listId)
    const membershipOwnerEmail = membership && typeof membership === 'object'
      ? (membership as { ownerEmail?: unknown }).ownerEmail
      : undefined
    const ownerEmail = isOwner
      ? typeof list.normalizedOwnerEmail === 'string' && emailPattern.test(list.normalizedOwnerEmail)
        ? list.normalizedOwnerEmail.trim().toLowerCase()
        : context.principal.kind === 'user' ? context.principal.email?.trim().toLowerCase() ?? listId : listId
      : typeof list.normalizedOwnerEmail === 'string' && emailPattern.test(list.normalizedOwnerEmail)
        ? list.normalizedOwnerEmail
        : typeof membershipOwnerEmail === 'string' && emailPattern.test(membershipOwnerEmail)
          ? membershipOwnerEmail
          : listId

    const members = isOwner
      ? Object.entries(list.invites ?? {}).map(([key, value]) => {
          const record = invitationRecord(value)
          return {
            email: typeof record.email === 'string' ? record.email : key,
            status: record.status === 'approved' ? 'approved' : 'pending',
            notificationLanguage: invitationLanguage(record.notificationLanguage)
          } satisfies ListMemberSummary
        })
      : []

    return {
      listId,
      name: typeof list.name === 'string' && list.name.trim() ? list.name : listId,
      ownerEmail,
      isOwner,
      members
    }
  }

  async invite(context: RequestContext, listId: string, input: unknown): Promise<void> {
    await this.authorization.assertOwner(context.principal, listId)
    const email = input && typeof input === 'object' ? (input as { email?: unknown }).email : undefined
    if (typeof email !== 'string' || !emailPattern.test(email.trim()) || email.length > 254) {
      throw new ApplicationError('invalid_input', 'A valid member email is required')
    }
    const normalized = email.trim().toLowerCase()
    const notificationLanguage = input && typeof input === 'object'
      ? invitationLanguage((input as { notificationLanguage?: unknown }).notificationLanguage)
      : 'he'
    if (context.principal.kind === 'user' && context.principal.email && normalized === context.principal.email.toLowerCase()) {
      throw new ApplicationError('conflict', 'The list owner is already a member')
    }
    const inviteId = emailKey(normalized)
    await this.repository.invite(
      listId,
      inviteId,
      normalized,
      context.principal.kind === 'user' ? context.principal.email ?? '' : '',
      context.now.toISOString(),
      notificationLanguage
    )
  }

  async remove(context: RequestContext, listId: string, email: string): Promise<void> {
    await this.authorization.assertOwner(context.principal, listId)
    const normalized = email.trim().toLowerCase()
    if (!emailPattern.test(normalized)) throw new ApplicationError('invalid_input', 'A valid member email is required')
    const inviteId = emailKey(normalized)
    await this.repository.remove(listId, inviteId)
  }

  async updateNotificationLanguage(
    context: RequestContext,
    listId: string,
    email: string,
    input: unknown
  ): Promise<void> {
    await this.authorization.assertOwner(context.principal, listId)
    const normalized = email.trim().toLowerCase()
    if (!emailPattern.test(normalized)) {
      throw new ApplicationError('invalid_input', 'A valid member email is required')
    }
    const requested = input && typeof input === 'object'
      ? (input as { notificationLanguage?: unknown }).notificationLanguage
      : undefined
    if (requested !== 'he' && requested !== 'en') {
      throw new ApplicationError('invalid_input', 'notificationLanguage must be he or en')
    }
    const updated = await this.repository.updateNotificationLanguage(
      listId,
      emailKey(normalized),
      requested
    )
    if (!updated) throw new ApplicationError('not_found', 'Member invitation does not exist')
  }

  async leave(context: RequestContext, listId: string): Promise<void> {
    const { isOwner, memberId } = await this.authorizedList(context, listId)
    if (isOwner) {
      throw new ApplicationError('conflict', 'The owner cannot leave their own list')
    }
    await this.repository.remove(listId, memberId)
  }
}
