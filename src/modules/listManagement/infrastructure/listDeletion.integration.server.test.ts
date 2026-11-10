/** @jest-environment node */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { AuthenticatedUserHandler } from '../../identity/server'
import { ApplicationError } from '../../shared'
import { ListDeletionService } from '../application/listDeletion.service'
import { FirebaseAdminListDeletionRepository } from './firebaseAdminListDeletionRepository.server'
import { createListDeleteHandler } from './listDeletionHttp.server'

type Household = {
  ownerUid: string
  stock: Record<string, { name: string }>
  groceries: Record<string, { item: string; list_name?: string | null }>
}

const originalHouseholds = (): Record<string, Household> => ({
  owner_house: {
    ownerUid: 'owner-a',
    stock: { pantry: { name: 'Rice' } },
    groceries: {
      tripMilk: { item: 'Milk', list_name: 'Weekend trip' },
      tripBread: { item: 'Bread', list_name: 'Weekend trip' },
      other: { item: 'Eggs', list_name: 'Other' },
      permanent: { item: 'Apples' }
    }
  },
  outsider_house: {
    ownerUid: 'outsider-c',
    stock: {},
    groceries: { private: { item: 'Tea', list_name: 'Weekend trip' } }
  }
})

const principals: Record<string, { uid: string; email: string }> = {
  owner: { uid: 'owner-a', email: 'owner@example.com' },
  recipient: { uid: 'recipient-b', email: 'recipient@example.com' },
  outsider: { uid: 'outsider-c', email: 'outsider@example.com' }
}

const setup = () => {
  const households = originalHouseholds()
  const transactions: string[] = []
  let retryWith: Household | null = null
  let transactionFailure = false

  const database = {
    ref: jest.fn((path: string) => ({
      transaction: async (update: (current: Household | null) => Household | undefined) => {
        transactions.push(path)
        if (transactionFailure) throw new Error('database unavailable')
        const key = path.replace(/^users\//, '')
        const current = households[key] ?? null
        let proposed = update(current ? structuredClone(current) : null)
        if (retryWith) {
          proposed = update(structuredClone(retryWith))
          retryWith = null
        }
        if (proposed === undefined) return { committed: false }
        households[key] = proposed
        return { committed: true }
      }
    }))
  }
  const authenticatedUserHandler = new AuthenticatedUserHandler({
    authenticationService: {
      execute: async (authorization: string | null) => {
        const principal = authorization?.startsWith('Bearer ')
          ? principals[authorization.slice('Bearer '.length)]
          : undefined
        if (!principal) throw new ApplicationError('unauthenticated', 'Sign in required')
        return { kind: 'user' as const, ...principal, emailVerified: true }
      }
    },
    generateRequestId: () => 'myw64-integration',
    now: () => new Date('2026-11-10T12:00:00Z')
  })
  const handler = createListDeleteHandler({
    authenticatedUserHandler,
    service: new ListDeletionService(new FirebaseAdminListDeletionRepository(database as never))
  })
  const request = (actor: string | null, body?: unknown) => new Request(
    'https://app.example/api/lists/owner_house/shopping-lists/Weekend%20trip',
    {
      method: 'DELETE',
      headers: {
        ...(actor ? { authorization: `Bearer ${actor}` } : {}),
        'content-type': 'application/json',
        'x-actor-uid': 'owner-a'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    }
  )
  return {
    households,
    transactions,
    database,
    handler,
    request,
    retryWith: (value: Household) => { retryWith = value },
    failTransaction: (value: boolean) => { transactionFailure = value }
  }
}

describe('FR-13 integrated deletion route and transaction', () => {
  it('derives owner from authentication and atomically deletes only the selected list', async () => {
    const fixture = setup()
    const beforeOutsider = structuredClone(fixture.households.outsider_house)
    const response = await fixture.handler({
      request: fixture.request('owner', { actorUid: 'outsider-c' }),
      listId: 'owner_house', listName: 'Weekend%20trip'
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ deletedItems: 2 })
    expect(fixture.database.ref).toHaveBeenCalledWith('users/owner_house')
    expect(fixture.transactions).toEqual(['users/owner_house'])
    expect(fixture.households.owner_house).toEqual({
      ownerUid: 'owner-a',
      stock: { pantry: { name: 'Rice' } },
      groceries: {
        other: { item: 'Eggs', list_name: 'Other' },
        permanent: { item: 'Apples' }
      }
    })
    expect(fixture.households.outsider_house).toEqual(beforeOutsider)
  })

  it.each([
    ['recipient', 'recipient', 'owner_house', 403],
    ['unrelated user', 'outsider', 'owner_house', 403],
    ['forged household', 'owner', 'outsider_house', 403],
    ['signed-out user', null, 'owner_house', 401]
  ])('denies %s without changing either household', async (_label, actor, listId, status) => {
    const fixture = setup()
    const before = structuredClone(fixture.households)
    const response = await fixture.handler({
      request: fixture.request(actor, { actorUid: 'owner-a', ownerUid: 'owner-a' }),
      listId, listName: 'Weekend%20trip'
    })
    expect(response.status).toBe(status)
    expect(fixture.households).toEqual(before)
    expect(fixture.transactions).toHaveLength(actor ? 1 : 0)
  })

  it.each([
    ['permanent list', '', 400],
    ['nonexistent custom list', 'Missing', 404]
  ])('protects the %s without writing', async (_label, listName, status) => {
    const fixture = setup()
    const before = structuredClone(fixture.households)
    const response = await fixture.handler({ request: fixture.request('owner'), listId: 'owner_house', listName })
    expect(response.status).toBe(status)
    expect(fixture.households).toEqual(before)
  })

  it('can delete the last custom list while the implicit permanent list remains selectable', async () => {
    const fixture = setup()
    fixture.households.owner_house.groceries = {
      tripMilk: { item: 'Milk', list_name: 'Weekend trip' }
    }
    const response = await fixture.handler({
      request: fixture.request('owner'), listId: 'owner_house', listName: 'Weekend%20trip'
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deletedItems: 1 })
    expect(fixture.households.owner_house.groceries).toEqual({})
    expect(fixture.households.owner_house.ownerUid).toBe('owner-a')
  })

  it('rechecks ownership on the final transaction attempt after a concurrent change', async () => {
    const fixture = setup()
    const before = structuredClone(fixture.households)
    fixture.retryWith({ ...before.owner_house, ownerUid: 'replacement-owner' })
    const response = await fixture.handler({
      request: fixture.request('owner'), listId: 'owner_house', listName: 'Weekend%20trip'
    })
    expect(response.status).toBe(403)
    expect(fixture.households).toEqual(before)
  })

  it('reports a storage failure without a partial write and allows a later retry', async () => {
    const fixture = setup()
    const before = structuredClone(fixture.households)
    fixture.failTransaction(true)
    const input = { request: fixture.request('owner'), listId: 'owner_house', listName: 'Weekend%20trip' }
    expect((await fixture.handler(input)).status).toBe(502)
    expect(fixture.households).toEqual(before)
    fixture.failTransaction(false)
    expect((await fixture.handler({ ...input, request: fixture.request('owner') })).status).toBe(200)
    expect(Object.keys(fixture.households.owner_house.groceries)).toEqual(['other', 'permanent'])
  })
})
