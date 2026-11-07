/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { FirebaseDuplicateReviewRepository } from './firebaseDuplicateReviewRepository.server'

const fakeDatabase = (
  initial: Record<string, any>,
  injectConflict?: (path: string, current: unknown, write: (path: string, value: unknown) => void) => boolean
) => {
  const state = JSON.parse(JSON.stringify(initial))
  const parts = (path: string) => path.split('/').filter(Boolean)
  const read = (path: string) => parts(path).reduce((value, key) => value?.[key], state)
  const write = (path: string, value: unknown) => {
    const pathParts = parts(path)
    const key = pathParts.pop()!
    const parent = pathParts.reduce((value, part) => (value[part] ??= {}), state)
    parent[key] = value
  }
  return {
    database: {
      ref: jest.fn((path: string) => ({
        get: async () => ({ val: () => read(path) }),
        transaction: async (update: (current: any) => any) => {
          let next = update(read(path) ?? null)
          if (injectConflict?.(path, read(path), write)) next = update(read(path) ?? null)
          if (next === undefined) return { committed: false, snapshot: { val: () => read(path) } }
          write(path, next)
          return { committed: true, snapshot: { val: () => next } }
        }
      }))
    },
    state
  }
}

const openFinding = {
  state: 'open', itemIds: ['a', 'b'], reason: 'exact', score: 1,
  createdAt: '2026-11-07T10:00:00.000Z', algorithmVersion: 'lexical-v1'
}

it('returns actor-scoped open/read status and hides missing grocery rows', async () => {
  const fake = fakeDatabase({ users: { list: {
    name: 'Home',
    groceries: { a: { item: 'Milk' }, b: { item: 'milk' } },
    duplicate_findings: { unread: openFinding, read: { ...openFinding, itemIds: ['a', 'b'] }, stale: { ...openFinding, itemIds: ['a', 'missing'] } },
    duplicate_finding_views: { actor: { read: { readAt: '2026-11-07T11:00:00.000Z' } } }
  } } })
  const repository = new FirebaseDuplicateReviewRepository(fake.database as any)

  await expect(repository.list('list', 'actor')).resolves.toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'unread', status: 'open', unread: true }),
    expect.objectContaining({ id: 'read', status: 'read', unread: false })
  ]))
  await expect(repository.list('list', 'actor')).resolves.not.toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'stale' })
  ]))
})

it('claims deletion before destructive work and rejects a concurrent keep-both transition', async () => {
  const fake = fakeDatabase({ users: { list: {
    groceries: { a: { item: 'Milk' }, b: { item: 'milk' } },
    duplicate_findings: { pair: openFinding }
  } } })
  const repository = new FirebaseDuplicateReviewRepository(fake.database as any)

  await expect(repository.claimDelete('list', 'pair', 'b', 'actor', '2026-11-07T12:00:00.000Z')).resolves.toBe('claimed')
  await expect(repository.ignorePair('list', 'pair', 'other', '2026-11-07T12:00:01.000Z')).rejects.toMatchObject({ code: 'not_found' })
  expect(fake.state.users.list.duplicate_findings.pair).toMatchObject({ state: 'deleting', deletingItemId: 'b' })

  await repository.completeDelete('list', 'pair', 'b', 'actor', '2026-11-07T12:00:02.000Z')
  expect(fake.state.users.list.duplicate_findings.pair).toMatchObject({ state: 'resolved', deletedItemId: 'b' })
})

it('retries a conflicted claim against current state and loses safely to keep-both', async () => {
  let injected = false
  const fake = fakeDatabase({ users: { list: { duplicate_findings: { pair: openFinding } } } }, (path, current, write) => {
    if (injected || !path.endsWith('/duplicate_findings/pair')) return false
    injected = true
    write(path, { ...current as Record<string, unknown>, state: 'ignored' })
    return true
  })
  const repository = new FirebaseDuplicateReviewRepository(fake.database as any)

  await expect(repository.claimDelete('list', 'pair', 'b', 'actor', '2026-11-07T12:00:00.000Z')).rejects.toMatchObject({ code: 'not_found' })
  expect(fake.state.users.list.duplicate_findings.pair.state).toBe('ignored')
})

it('makes repeated claims and completion idempotent without reopening resolved findings', async () => {
  const fake = fakeDatabase({ users: { list: {
    groceries: { a: { item: 'Milk' }, b: { item: 'milk' } },
    duplicate_findings: { pair: openFinding }
  } } })
  const repository = new FirebaseDuplicateReviewRepository(fake.database as any)

  await expect(Promise.all([
    repository.claimDelete('list', 'pair', 'b', 'actor', '2026-11-07T12:00:00.000Z'),
    repository.claimDelete('list', 'pair', 'b', 'actor', '2026-11-07T12:00:00.000Z')
  ])).resolves.toEqual(['claimed', 'claimed'])
  await repository.completeDelete('list', 'pair', 'b', 'actor', '2026-11-07T12:00:01.000Z')
  await repository.completeDelete('list', 'pair', 'b', 'actor', '2026-11-07T12:00:02.000Z')
  await expect(repository.claimDelete('list', 'pair', 'b', 'actor', '2026-11-07T12:00:03.000Z')).resolves.toBe('resolved')
  await expect(repository.claimDelete('list', 'pair', 'a', 'actor', '2026-11-07T12:00:03.000Z')).rejects.toMatchObject({ code: 'not_found' })
})

it('rejects a forged item before creating a destructive claim', async () => {
  const fake = fakeDatabase({ users: { list: { duplicate_findings: { pair: openFinding } } } })
  const repository = new FirebaseDuplicateReviewRepository(fake.database as any)

  await expect(repository.claimDelete('list', 'pair', 'x', 'actor', '2026-11-07T12:00:00.000Z')).rejects.toMatchObject({ code: 'not_found' })
  expect(fake.state.users.list.duplicate_findings.pair.state).toBe('open')
})
