/** @jest-environment node */

import { ApplicationError, type RequestContext } from '../../shared'
import type { ListAuthorizationRepository } from './listAuthorizationRepository'
import {
  SemanticGroceryMatchService,
  type SemanticGroceryCandidateRepository,
  type SemanticGroceryMatchProvider
} from './semanticGroceryMatch.service'
import type { SemanticGroceryCandidate } from '../domain/semanticGroceryMatch'

const context: RequestContext = {
  principal: {
    kind: 'user',
    uid: 'member-1',
    email: 'member@example.test',
    emailVerified: true
  },
  requestId: 'request-1',
  now: new Date('2026-11-04T12:00:00.000Z')
}

const candidates: SemanticGroceryCandidate[] = [
  {
    id: 'active-milk',
    name: 'Milk',
    category: 'Dairy',
    bought: false,
    hidden: false,
    collapsed: false
  },
  {
    id: 'purchased-oat-milk',
    name: 'Oat milk',
    category: 'Dairy alternatives',
    bought: true,
    hidden: false,
    collapsed: true
  },
  {
    id: 'hidden-bread',
    name: 'Bread',
    category: 'Bakery',
    bought: false,
    hidden: true,
    collapsed: false
  }
]

const setup = (options: {
  snapshots?: SemanticGroceryCandidate[][]
  output?: unknown
  provider?: SemanticGroceryMatchProvider
  authorization?: ListAuthorizationRepository
  providerTimeoutMs?: number
} = {}) => {
  const snapshots = options.snapshots ?? [candidates]
  let readIndex = 0
  const repository: SemanticGroceryCandidateRepository = {
    listCandidates: jest.fn(async () => snapshots[Math.min(readIndex++, snapshots.length - 1)] ?? [])
  }
  const authorization = options.authorization ?? {
    assertAccessible: jest.fn().mockResolvedValue(undefined)
  }
  const provider = options.provider ?? {
    evaluate: jest.fn().mockResolvedValue(
      options.output ?? {
        distinct: false,
        selections: [
          { itemId: 'active-milk', matchType: 'exact' },
          { itemId: 'purchased-oat-milk', matchType: 'similar' },
          { itemId: 'hidden-bread', matchType: 'related' }
        ]
      }
    )
  }
  return {
    repository,
    authorization,
    provider,
    service: new SemanticGroceryMatchService(repository, authorization, provider, {
      providerTimeoutMs: options.providerTimeoutMs
    })
  }
}

describe('SemanticGroceryMatchService', () => {
  it('authorizes before sending every selected-list state to the provider and returns validated stable IDs', async () => {
    const dependencies = setup()

    const result = await dependencies.service.execute(context, 'selected-list', { query: 'milk' })

    expect(result).toEqual(expect.objectContaining({
      status: 'ok',
      evaluatedName: 'milk',
      classification: 'exact',
      candidateCount: 3,
      snapshotId: expect.stringMatching(/^[a-f0-9]{64}$/)
    }))
    expect(result.matches.map(({ id, matchType }) => ({ id, matchType }))).toEqual([
      { id: 'active-milk', matchType: 'exact' },
      { id: 'purchased-oat-milk', matchType: 'similar' },
      { id: 'hidden-bread', matchType: 'related' }
    ])
    expect(dependencies.authorization.assertAccessible).toHaveBeenCalledWith(context.principal, 'selected-list')
    expect(dependencies.provider.evaluate).toHaveBeenCalledWith({ query: 'milk', candidates })
    expect((dependencies.authorization.assertAccessible as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan((dependencies.repository.listCandidates as jest.Mock).mock.invocationCallOrder[0])
    expect((dependencies.repository.listCandidates as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan((dependencies.provider.evaluate as jest.Mock).mock.invocationCallOrder[0])
  })

  it('returns distinct only when the provider returns no selections', async () => {
    const { service } = setup({ output: { distinct: true, selections: [] } })

    await expect(service.execute(context, 'selected-list', { query: 'dish soap' })).resolves.toEqual(
      expect.objectContaining({ status: 'ok', classification: 'distinct', matches: [] })
    )
  })

  it('rechecks a corrected name against a fresh snapshot and rejects stale request identity', async () => {
    const first = setup()
    const initial = await first.service.execute(context, 'selected-list', { query: 'mlik' })
    const changedCandidates = [...candidates, {
      id: 'new-milk',
      name: 'Whole milk',
      category: 'Dairy',
      bought: false,
      hidden: false,
      collapsed: false
    }]
    const corrected = setup({ snapshots: [changedCandidates] })

    const result = await corrected.service.execute(context, 'selected-list', {
      query: 'mlik',
      correctedName: 'milk',
      expectedSnapshotId: initial.snapshotId
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'stale_request',
      evaluatedName: 'milk',
      matches: [],
      candidateCount: 4
    }))
    expect(corrected.provider.evaluate).not.toHaveBeenCalled()
    expect(corrected.authorization.assertAccessible).toHaveBeenCalledTimes(1)
  })

  it('evaluates a corrected name when the current snapshot still matches', async () => {
    const dependencies = setup()
    const initial = await dependencies.service.execute(context, 'selected-list', { query: 'mlik' })
    const result = await dependencies.service.execute(context, 'selected-list', {
      query: 'mlik',
      correctedName: 'milk',
      expectedSnapshotId: initial.snapshotId
    })

    expect(result.status).toBe('ok')
    expect(dependencies.provider.evaluate).toHaveBeenLastCalledWith({ query: 'milk', candidates })
    expect(dependencies.authorization.assertAccessible).toHaveBeenCalledTimes(2)
    expect(dependencies.repository.listCandidates).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['unknown ID', { distinct: false, selections: [{ itemId: 'other-list-item', matchType: 'exact' }] }],
    ['duplicate ID', { distinct: false, selections: [
      { itemId: 'active-milk', matchType: 'exact' },
      { itemId: 'active-milk', matchType: 'similar' }
    ] }],
    ['invalid type', { distinct: false, selections: [{ itemId: 'active-milk', matchType: 'duplicate' }] }],
    ['inconsistent distinct flag', { distinct: true, selections: [{ itemId: 'active-milk', matchType: 'exact' }] }],
    ['excess output', { distinct: false, selections: Array.from({ length: 9 }, (_, index) => ({
      itemId: `item-${index}`,
      matchType: 'related'
    })) }]
  ])('maps malformed provider output (%s) to an explicit safe outcome', async (_label, output) => {
    const { service } = setup({ output })

    await expect(service.execute(context, 'selected-list', { query: 'milk' })).resolves.toEqual(
      expect.objectContaining({ status: 'provider_unavailable', classification: 'distinct', matches: [] })
    )
  })

  it('maps provider failure and timeout to an explicit safe outcome', async () => {
    const failed = setup({ provider: { evaluate: jest.fn().mockRejectedValue(new Error('secret provider detail')) } })
    const timedOut = setup({
      provider: { evaluate: jest.fn(() => new Promise(() => undefined)) },
      providerTimeoutMs: 5
    })

    await expect(failed.service.execute(context, 'selected-list', { query: 'milk' })).resolves.toEqual(
      expect.objectContaining({ status: 'provider_unavailable', matches: [] })
    )
    await expect(timedOut.service.execute(context, 'selected-list', { query: 'milk' })).resolves.toEqual(
      expect.objectContaining({ status: 'provider_unavailable', matches: [] })
    )
  })

  it('fails closed before candidate or provider access when authorization is revoked', async () => {
    const authorization = {
      assertAccessible: jest.fn().mockRejectedValue(new ApplicationError('forbidden', 'revoked'))
    }
    const dependencies = setup({ authorization })

    await expect(dependencies.service.execute(context, 'selected-list', { query: 'milk' }))
      .rejects.toMatchObject({ code: 'forbidden' })
    expect(dependencies.repository.listCandidates).not.toHaveBeenCalled()
    expect(dependencies.provider.evaluate).not.toHaveBeenCalled()
  })

  it('allows an authorized read-only member because the service exposes no write boundary', async () => {
    const dependencies = setup()

    await expect(dependencies.service.execute(context, 'shared-read-only-list', { query: 'milk' }))
      .resolves.toEqual(expect.objectContaining({ status: 'ok' }))
    expect(Object.keys(dependencies.repository).sort()).toEqual(['listCandidates'])
  })

  it('rejects invalid input and bounds oversized candidate context before provider access', async () => {
    const invalid = setup()
    await expect(invalid.service.execute(context, 'selected-list', { query: 'x'.repeat(121) }))
      .rejects.toMatchObject({ code: 'invalid_input' })
    expect(invalid.authorization.assertAccessible).not.toHaveBeenCalled()

    const tooMany = setup({
      snapshots: [Array.from({ length: 101 }, (_, index) => ({
        id: `item-${index}`,
        name: `Item ${index}`,
        category: 'Other',
        bought: false,
        hidden: false,
        collapsed: false
      }))]
    })
    await expect(tooMany.service.execute(context, 'selected-list', { query: 'milk' })).resolves.toEqual(
      expect.objectContaining({ status: 'candidate_limit_exceeded', candidateCount: 101, matches: [] })
    )
    expect(tooMany.provider.evaluate).not.toHaveBeenCalled()
  })
})

const guardianAdd = { operation: 'add', listName: 'Main', language: 'he' }
const decisionFor = (name: string, category: string | null = null) => ({
  action: 'create',
  normalizedItem: {
    name, category, quantity: null, unit: null, brand: null, variant: null, notes: null, intendedRecipient: null
  },
  match: { existingItemId: null, matchType: 'distinct_product', confidence: 0.99 },
  issues: [],
  clarification: { required: false, question: null },
  proposedChanges: null,
  reason: 'Synthetic decision'
})

const guardianSetup = (output: unknown, snapshots: SemanticGroceryCandidate[][]) => {
  const base = setup({ output, snapshots })
  const repository = {
    ...base.repository,
    listAllowedCategories: jest.fn().mockResolvedValue(['ירקות', 'פירות', 'מזווה', 'מוצרי חלב וביצים', 'קפואים', 'בשר', 'Dairy'])
  }
  return {
    ...base,
    repository,
    service: new SemanticGroceryMatchService(repository, base.authorization, base.provider)
  }
}

describe('Product Integrity Guardian decision boundary', () => {
  it.each([
    ['בצל לבו', 'בצל לבן', 'ירקות', null, null],
    ['אגס', 'אגסים', 'פירות', null, null],
    ['קישואים*3', 'קישואים', 'ירקות', 3, 'unit'],
    ['זיתים טבעות', 'טבעות זיתים', 'מזווה', null, null]
  ])('returns confirmed identity and distinct explicit attributes for %s', async (query, name, category, quantity, unit) => {
    const output = decisionFor(name, category)
    Object.assign(output, { action: 'use_existing', match: { existingItemId: 'item', matchType: 'normalized_duplicate', confidence: 0.97 } })
    Object.assign(output.normalizedItem, { quantity, unit })
    const dependencies = guardianSetup(output, [[{ ...candidates[0], id: 'item', name, category }]])

    await expect(dependencies.service.execute(context, 'selected-list', { query, guardian: guardianAdd }))
      .resolves.toMatchObject({ status: 'ok', decision: output, matches: [{ id: 'item' }] })
    expect(dependencies.repository.listCandidates).toHaveBeenCalledWith('selected-list', 'Main')
    expect(dependencies.provider.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      query, candidatesComplete: true
    }))
  })

  it.each([
    ['עגבניות שרי', 'עגבניות', 'ירקות', null],
    ['בצל סגול', 'בצל לבן', 'ירקות', null],
    ['גבינה צהובה עמק', 'גבינה צהובה נעם', 'מוצרי חלב וביצים', 'עמק'],
    ['מלח לימון', 'לימון', 'מזווה', null],
    ['שום קפוא', 'שום טרי', 'קפואים', null]
  ])('accepts a distinct product or variant decision for %s', async (name, existing, category, brand) => {
    const output = decisionFor(name, category)
    Object.assign(output.normalizedItem, { brand })
    const { service } = guardianSetup(output, [[{ ...candidates[0], name: existing }]])
    await expect(service.execute(context, 'selected-list', { query: name, guardian: guardianAdd }))
      .resolves.toMatchObject({ status: 'ok', decision: output, matches: [] })
  })

  it.each([
    ['סויה', 'האם התכוונת לרוטב סויה או לחלב סויה?', 'he', true],
    ['cream', 'Which kind of cream?', 'en', true],
    ['milk 5 L', 'Keep 1 L or change the quantity to 5 L?', 'en', true],
    ['בשר טחון 2 קילו מחולק לחצאים', 'האם בשר טחון כבר מופיע ברשימה?', 'he', false]
  ])('passes through one clarification for %s', async (query, question, language, complete) => {
    const output = {
      ...decisionFor(query),
      action: 'needs_clarification',
      match: { existingItemId: null, matchType: 'uncertain', confidence: 0.2 },
      clarification: { required: true, question }
    }
    const snapshot = complete ? candidates : Array.from({ length: 101 }, (_, index) => ({ ...candidates[0], id: String(index) }))
    const { service, provider } = guardianSetup(output, [snapshot])
    await expect(service.execute(context, 'selected-list', { query, guardian: { ...guardianAdd, language } }))
      .resolves.toMatchObject({ status: 'ok', decision: output, candidatesComplete: complete })
    expect(provider.evaluate).toHaveBeenCalledWith(expect.objectContaining({ candidatesComplete: complete }))
  })

  it('rejects create when the context is partial', async () => {
    const oversized = Array.from({ length: 101 }, (_, index) => ({ ...candidates[0], id: String(index) }))
    const { service } = guardianSetup(decisionFor('Soap'), [oversized])
    await expect(service.execute(context, 'selected-list', { query: 'Soap', guardian: guardianAdd }))
      .resolves.toMatchObject({ status: 'provider_unavailable', matches: [] })
  })

  it.each([
    ['outside-scope identity', { action: 'use_existing', match: { existingItemId: 'elsewhere', matchType: 'exact_duplicate', confidence: 1 } }],
    ['ambiguous identity', { action: 'use_existing', match: { existingItemId: 'active-milk', matchType: 'probable_duplicate', confidence: 1 } }],
    ['invalid category', { normalizedItem: decisionFor('Milk', 'Other').normalizedItem }],
    ['invalid shape', { additionalProperty: 'invalid' }]
  ])('rejects %s without rewriting the answer', async (_description, overrides) => {
    const output = { ...decisionFor('Milk'), ...overrides }
    const { service } = guardianSetup(output, [candidates])
    await expect(service.execute(context, 'selected-list', { query: 'Milk', guardian: guardianAdd }))
      .resolves.toMatchObject({ status: 'provider_unavailable', matches: [] })
  })

  it('checks the candidate snapshot again before returning an existing ID', async () => {
    const output = {
      ...decisionFor('Milk'),
      action: 'use_existing',
      match: { existingItemId: 'active-milk', matchType: 'exact_duplicate', confidence: 1 }
    }
    const { service } = guardianSetup(output, [candidates, candidates.slice(1)])
    await expect(service.execute(context, 'selected-list', { query: 'Milk', guardian: guardianAdd }))
      .resolves.toMatchObject({ status: 'stale_request', matches: [] })
  })

  it('accepts only explicitly requested changes to the edit target', async () => {
    const output = {
      ...decisionFor('Milk', 'Dairy'),
      action: 'propose_update',
      match: { existingItemId: 'active-milk', matchType: 'exact_duplicate', confidence: 1 },
      proposedChanges: { notes: 'For tomorrow' }
    }
    const request = {
      query: 'Milk',
      guardian: {
        operation: 'update', itemId: 'active-milk', listName: 'Main', language: 'en',
        details: { notes: 'For tomorrow' }
      }
    }
    const allowed = guardianSetup(output, [candidates])
    await expect(allowed.service.execute(context, 'selected-list', request))
      .resolves.toMatchObject({ status: 'ok', decision: output })
    const unsafe = guardianSetup({ ...output, proposedChanges: { quantity: 3 } }, [candidates])
    await expect(unsafe.service.execute(context, 'selected-list', request))
      .resolves.toMatchObject({ status: 'provider_unavailable' })
    await expect(allowed.service.execute(context, 'selected-list', {
      ...request, guardian: { ...request.guardian, itemId: 'different-list' }
    })).resolves.toMatchObject({ status: 'stale_request' })
  })
})
