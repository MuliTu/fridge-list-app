/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { PrismaListAuthorizationRepository } from './prismaListAuthorizationRepository.server'
import type { AuthenticatedPrincipal } from '../../shared'

const userPrincipal: AuthenticatedPrincipal = {
  kind: 'user',
  uid: 'user-1',
  email: 'user@example.test',
  emailVerified: true
}

const servicePrincipal: AuthenticatedPrincipal = {
  kind: 'service',
  service: 'n8n',
  scopes: ['groceries:write']
}

const createRepository = (record: { id: string } | null) => {
  const findFirst = jest.fn().mockResolvedValue(record)
  const repository = new PrismaListAuthorizationRepository({
    householdList: { findFirst }
  })
  return { repository, findFirst }
}

describe('PrismaListAuthorizationRepository', () => {
  it('allows owners or approved members to read a list', async () => {
    const { repository, findFirst } = createRepository({ id: 'list-1' })

    await expect(
      repository.assertListReadable(userPrincipal, 'list-1')
    ).resolves.toBeUndefined()

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'list-1',
        OR: [
          { ownerUid: 'user-1' },
          {
            members: {
              some: {
                uid: 'user-1',
                status: 'Approved'
              }
            }
          }
        ]
      },
      select: { id: true }
    })
  })

  it('allows owners or approved members to write list data', async () => {
    const { repository } = createRepository({ id: 'list-1' })

    await expect(
      repository.assertListWritable(userPrincipal, 'list-1')
    ).resolves.toBeUndefined()
  })

  it('denies unknown, pending, or otherwise unauthorized list access', async () => {
    const { repository } = createRepository(null)

    await expect(
      repository.assertListReadable(userPrincipal, 'list-1')
    ).rejects.toEqual(expect.objectContaining({ code: 'forbidden' }))
  })

  it('allows the list owner through owner-only checks', async () => {
    const { repository, findFirst } = createRepository({ id: 'list-1' })

    await expect(
      repository.assertListOwner(userPrincipal, 'list-1')
    ).resolves.toBeUndefined()

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'list-1',
        ownerUid: 'user-1'
      },
      select: { id: true }
    })
  })

  it('denies owner-only checks when the owner row is not found', async () => {
    const { repository } = createRepository(null)

    await expect(
      repository.assertListOwner(userPrincipal, 'list-1')
    ).rejects.toEqual(expect.objectContaining({ code: 'forbidden' }))
  })

  it('denies service principals for browser-user list authorization', async () => {
    const { repository, findFirst } = createRepository({ id: 'list-1' })

    await expect(
      repository.assertListWritable(servicePrincipal, 'list-1')
    ).rejects.toEqual(expect.objectContaining({ code: 'forbidden' }))
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('allows a user to access their own identity', async () => {
    const { repository, findFirst } = createRepository(null)

    await expect(
      repository.assertOwnIdentity(userPrincipal, 'user-1')
    ).resolves.toBeUndefined()
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('denies access to another identity', async () => {
    const { repository } = createRepository(null)

    await expect(
      repository.assertOwnIdentity(userPrincipal, 'user-2')
    ).rejects.toEqual(expect.objectContaining({ code: 'forbidden' }))
  })

  it('rejects invalid identifiers before querying', async () => {
    const { repository, findFirst } = createRepository({ id: 'list-1' })

    await expect(
      repository.assertListReadable(userPrincipal, ' ')
    ).rejects.toEqual(expect.objectContaining({ code: 'invalid_input' }))
    expect(findFirst).not.toHaveBeenCalled()
  })
})
