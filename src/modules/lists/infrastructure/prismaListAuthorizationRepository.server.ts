import '@tanstack/react-start/server-only'

import { MemberStatus } from '../../../generated/prisma/enums'
import { ApplicationError, type AuthenticatedPrincipal } from '../../shared'
import type { ListAuthorizationRepository } from '../application/listAuthorizationRepository'

type FindFirstArgs = {
  where: Record<string, unknown>
  select: { id: true }
}

type ListAuthorizationPrismaClient = {
  householdList: {
    findFirst(args: FindFirstArgs): Promise<{ id: string } | null>
  }
}

const id = (value: string, field: string): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    throw new ApplicationError('invalid_input', `${field} is invalid`)
  }
  return value.trim()
}

const userUid = (principal: AuthenticatedPrincipal): string => {
  if (principal.kind !== 'user') {
    throw new ApplicationError('forbidden', 'List access requires a user principal')
  }
  return id(principal.uid, 'uid')
}

const denied = () => new ApplicationError('forbidden', 'List access denied')

export class PrismaListAuthorizationRepository implements ListAuthorizationRepository {
  constructor(private readonly prisma: ListAuthorizationPrismaClient) {}

  async assertListReadable(principal: AuthenticatedPrincipal, listId: string): Promise<void> {
    await this.assertMemberOrOwner(principal, listId)
  }

  async assertListWritable(principal: AuthenticatedPrincipal, listId: string): Promise<void> {
    await this.assertMemberOrOwner(principal, listId)
  }

  async assertListOwner(principal: AuthenticatedPrincipal, listId: string): Promise<void> {
    const uid = userUid(principal)
    const normalizedListId = id(listId, 'listId')
    const record = await this.prisma.householdList.findFirst({
      where: {
        id: normalizedListId,
        ownerUid: uid
      },
      select: { id: true }
    })
    if (!record) throw denied()
  }

  async assertOwnIdentity(principal: AuthenticatedPrincipal, uid: string): Promise<void> {
    const principalUid = userUid(principal)
    if (principalUid !== id(uid, 'uid')) throw denied()
  }

  private async assertMemberOrOwner(
    principal: AuthenticatedPrincipal,
    listId: string
  ): Promise<void> {
    const uid = userUid(principal)
    const normalizedListId = id(listId, 'listId')
    const record = await this.prisma.householdList.findFirst({
      where: {
        id: normalizedListId,
        OR: [
          { ownerUid: uid },
          {
            members: {
              some: {
                uid,
                status: MemberStatus.Approved
              }
            }
          }
        ]
      },
      select: { id: true }
    })
    if (!record) throw denied()
  }
}
