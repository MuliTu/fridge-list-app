import { ZodError } from 'zod'

import { ApplicationError, type RequestContext } from '../../shared'
import type { ListAuthorizationRepository } from './listAuthorizationRepository'
import {
  semanticGroceryMatchInputSchema,
  semanticGroceryProviderOutputSchema,
  type SemanticGroceryCandidate,
  type SemanticGroceryMatch,
  type SemanticGroceryMatchResult,
  type SemanticGroceryProviderOutput
} from '../domain/semanticGroceryMatch'

const MAX_CANDIDATES = 100
const DEFAULT_PROVIDER_TIMEOUT_MS = 5_000

export type SemanticGroceryCandidateRepository = {
  listCandidates(listId: string): Promise<SemanticGroceryCandidate[]>
}

export type SemanticGroceryMatchProvider = {
  evaluate(input: {
    query: string
    candidates: readonly SemanticGroceryCandidate[]
  }): Promise<unknown>
}

export type SemanticGroceryMatchServiceOptions = {
  providerTimeoutMs?: number
}

const snapshotIdFor = async (candidates: readonly SemanticGroceryCandidate[]): Promise<string> => {
  const canonical = [...candidates]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, name, category, bought, hidden, collapsed }) => [
      id,
      name,
      category,
      bought,
      hidden,
      collapsed
    ])
  const bytes = new TextEncoder().encode(JSON.stringify(canonical))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const unavailableResult = (
  evaluatedName: string,
  snapshotId: string,
  candidateCount: number
): SemanticGroceryMatchResult => ({
  status: 'provider_unavailable',
  evaluatedName,
  snapshotId,
  classification: 'distinct',
  matches: [],
  candidateCount
})

const validateProviderResult = (
  output: SemanticGroceryProviderOutput,
  candidates: readonly SemanticGroceryCandidate[]
): { classification: SemanticGroceryMatchResult['classification']; matches: SemanticGroceryMatch[] } | null => {
  if (output.distinct !== (output.selections.length === 0)) return null

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const selectedIds = new Set<string>()
  const matches: SemanticGroceryMatch[] = []
  for (const selection of output.selections) {
    if (selectedIds.has(selection.itemId)) return null
    const candidate = byId.get(selection.itemId)
    if (!candidate) return null
    selectedIds.add(selection.itemId)
    matches.push({ ...candidate, matchType: selection.matchType })
  }

  return {
    classification: matches[0]?.matchType ?? 'distinct',
    matches
  }
}

const waitForProvider = async (
  operation: Promise<unknown>,
  timeoutMs: number
): Promise<unknown> => {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('semantic provider timed out')), timeoutMs)
      })
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export class SemanticGroceryMatchService {
  private readonly providerTimeoutMs: number

  constructor(
    private readonly repository: SemanticGroceryCandidateRepository,
    private readonly authorization: ListAuthorizationRepository,
    private readonly provider: SemanticGroceryMatchProvider,
    options: SemanticGroceryMatchServiceOptions = {}
  ) {
    this.providerTimeoutMs = options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS
  }

  async execute(
    context: RequestContext,
    listId: string,
    input: unknown
  ): Promise<SemanticGroceryMatchResult> {
    let parsed
    try {
      parsed = semanticGroceryMatchInputSchema.parse(input)
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ApplicationError('invalid_input', 'Semantic grocery match request is invalid', error)
      }
      throw error
    }

    await this.authorization.assertAccessible(context.principal, listId)
    const candidates = await this.repository.listCandidates(listId)
    const snapshotId = await snapshotIdFor(candidates)
    const evaluatedName = parsed.correctedName ?? parsed.query

    if (parsed.correctedName && parsed.expectedSnapshotId !== snapshotId) {
      return {
        status: 'stale_request',
        evaluatedName,
        snapshotId,
        classification: 'distinct',
        matches: [],
        candidateCount: candidates.length
      }
    }

    if (candidates.length > MAX_CANDIDATES) {
      return {
        status: 'candidate_limit_exceeded',
        evaluatedName,
        snapshotId,
        classification: 'distinct',
        matches: [],
        candidateCount: candidates.length
      }
    }

    try {
      const rawOutput = await waitForProvider(
        this.provider.evaluate({ query: evaluatedName, candidates }),
        this.providerTimeoutMs
      )
      const parsedOutput = semanticGroceryProviderOutputSchema.safeParse(rawOutput)
      if (!parsedOutput.success) {
        return unavailableResult(evaluatedName, snapshotId, candidates.length)
      }
      const validated = validateProviderResult(parsedOutput.data, candidates)
      if (!validated) {
        return unavailableResult(evaluatedName, snapshotId, candidates.length)
      }
      return {
        status: 'ok',
        evaluatedName,
        snapshotId,
        classification: validated.classification,
        matches: validated.matches,
        candidateCount: candidates.length
      }
    } catch {
      return unavailableResult(evaluatedName, snapshotId, candidates.length)
    }
  }
}
