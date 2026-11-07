/** @jest-environment node */

import {
  DUPLICATE_SCAN_ALGORITHM_VERSION,
  findDuplicateMatches,
  matchDuplicatePair,
  processDuplicateScanJobs,
  type DuplicateScanRepository
} from './duplicateScan.service'

const item = (id: string, name: string, bought = false) => ({ id, name, bought })

describe('lexical duplicate matching', () => {
  it.each([
    ['milk', 'MILK!', 'exact'],
    ['חלב', 'chalav', 'alias'],
    ['whole milk', 'milk', 'substring'],
    ['organic whole milk', 'whole milk organic', 'token_overlap'],
    ['tomato', 'tomto', 'edit_distance']
  ] as const)('matches %s and %s by %s', (left, right, reason) => {
    expect(matchDuplicatePair(item('b', left), item('a', right))).toMatchObject({
      itemIds: ['a', 'b'], reason, algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION
    })
  })

  it.each([
    ['tea', 'pea'],
    ['milk', 'silk'],
    ['red apple', 'green apple'],
    ['bread', 'cheese']
  ])('conservatively rejects %s and %s', (left, right) => {
    expect(matchDuplicatePair(item('a', left), item('b', right))).toBeNull()
  })

  it('uses a stable unordered pair identity and ignores purchased/self candidates', () => {
    const forward = matchDuplicatePair(item('left', 'milk'), item('right', 'MILK'))
    const reverse = matchDuplicatePair(item('right', 'MILK'), item('left', 'milk'))
    expect(forward?.findingId).toBe(reverse?.findingId)
    expect(matchDuplicatePair(item('left', 'milk'), item('left', 'milk'))).toBeNull()
    expect(findDuplicateMatches('left', [item('left', 'milk'), item('right', 'milk', true)])).toEqual([])
  })
})
describe('duplicate scan processing', () => {
  it('claims bounded jobs, completes findings, and records a redacted failure', async () => {
    const complete = jest.fn()
    const fail = jest.fn()
    const repository: DuplicateScanRepository = {
      findReadyJobs: jest.fn().mockResolvedValue([{ listId: 'one', itemId: 'milk' }, { listId: 'two', itemId: 'broken' }]),
      claim: jest.fn(async (job, workerId) => ({ ...job, workerId, attempts: 1 })),
      loadCandidates: jest.fn(async (listId) => {
        if (listId === 'two') throw new Error('product name must not escape')
        return [item('milk', 'milk'), item('milk-2', 'MILK')]
      }),
      complete,
      fail
    }

    await expect(processDuplicateScanJobs(repository, {
      now: new Date('2026-11-07T10:00:00.000Z'), workerId: 'worker', limit: 100
    })).resolves.toEqual({ claimed: 2, completed: 1, failed: 1 })
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ listId: 'one' }), [
      expect.objectContaining({ reason: 'exact' })
    ], '2026-11-07T10:00:00.000Z')
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ listId: 'two' }), 'scan_failed', '2026-11-07T10:00:00.000Z')
    expect(repository.findReadyJobs).toHaveBeenCalledWith('2026-11-07T10:00:00.000Z', 25)
  })
})
