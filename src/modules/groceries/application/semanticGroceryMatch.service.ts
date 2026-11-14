import { ZodError } from 'zod'

import { ApplicationError, type RequestContext } from '../../shared'
import type { ListAuthorizationRepository } from './listAuthorizationRepository'
import {
  semanticGroceryMatchInputSchema,
  semanticGroceryProviderOutputSchema,
  type GuardianContext,
  type SemanticGroceryCandidate,
  type SemanticGroceryMatch,
  type SemanticGroceryMatchResult,
  type SemanticGroceryProviderOutput
} from '../domain/semanticGroceryMatch'
import {
  productIntegrityGuardianDecisionSchema,
  type GuardianChanges,
  type ProductIntegrityGuardianDecision
} from '../domain/productIntegrityGuardian'

const MAX_CANDIDATES = 100
const DEFAULT_PROVIDER_TIMEOUT_MS = 5_000

export type SemanticGroceryCandidateRepository = {
  listCandidates(listId: string, listName?: string | null): Promise<SemanticGroceryCandidate[]>
  listAllowedCategories?(listId: string): Promise<string[]>
}

export type SemanticGroceryMatchProvider = {
  evaluate(input: {
    query: string
    candidates: readonly SemanticGroceryCandidate[]
    guardian?: GuardianContext
    candidatesComplete?: boolean
    allowedCategories?: readonly string[]
    requestedFields?: GuardianChanges
  }): Promise<unknown>
}

export type SemanticGroceryMatchServiceOptions = {
  providerTimeoutMs?: number
}

const snapshotIdFor = async (
  candidates: readonly SemanticGroceryCandidate[],
  scope: readonly (string | null)[] = []
): Promise<string> => {
  const canonical = [...candidates]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, name, category, bought, hidden, collapsed, quantity, unit, notes }) => [
      id,
      name,
      category,
      bought,
      hidden,
      collapsed, quantity, unit, notes
    ])
  const bytes = new TextEncoder().encode(JSON.stringify([scope, canonical]))
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

const editFieldsFor = (
  guardian: GuardianContext,
  name: string,
  editedItem: SemanticGroceryCandidate
): GuardianChanges => {
  const fields: GuardianChanges = {}
  if (name !== editedItem.name) fields.name = name
  const details = guardian.details
  if (details?.category !== undefined && details.category !== editedItem.category) fields.category = details.category
  if (details?.quantity !== undefined && details.quantity !== (editedItem.quantity ?? null)) fields.quantity = details.quantity
  if (details?.unit !== undefined && details.unit !== (editedItem.unit ?? null)) fields.unit = details.unit
  if (details?.notes !== undefined && (details.notes || null) !== (editedItem.notes || null)) fields.notes = details.notes
  return fields
}

const validateGuardianDecision = (
  decision: ProductIntegrityGuardianDecision,
  candidates: readonly SemanticGroceryCandidate[],
  allowedCategories: readonly string[],
  candidatesComplete: boolean,
  guardian: GuardianContext | undefined,
  requestedFields: GuardianChanges
): boolean => {
  const { action, normalizedItem, match, clarification, proposedChanges } = decision
  const confirmed = match.matchType === 'exact_duplicate' || match.matchType === 'normalized_duplicate'
  const picksExisting = action === 'use_existing' || action === 'propose_update'
  if (normalizedItem.category !== null && !allowedCategories.includes(normalizedItem.category)) return false
  if (clarification.required !== (action === 'needs_clarification') ||
      (clarification.question !== null) !== clarification.required) return false
  if (picksExisting !== (match.existingItemId !== null)) return false
  if (picksExisting && (!confirmed || candidates.filter(({ id }) => id === match.existingItemId).length !== 1)) return false
  if (guardian?.operation === 'update' && picksExisting && match.existingItemId !== guardian.itemId) return false
  if (action === 'use_existing' && Object.keys(requestedFields).length) return false

  if (action === 'create') {
    return candidatesComplete && guardian?.operation !== 'update' && proposedChanges === null &&
      (match.matchType === 'none' || match.matchType === 'distinct_product' || match.matchType === 'related_variant')
  }
  if (action !== 'propose_update') return proposedChanges === null
  if (guardian?.operation !== 'update' || proposedChanges === null) return false

  const fields = Object.keys(proposedChanges) as Array<keyof GuardianChanges>
  return fields.length > 0 && fields.every((field) => {
    if (!Object.hasOwn(requestedFields, field)) return false
    if (field === 'name') return proposedChanges.name === normalizedItem.name
    if (field === 'category' && !allowedCategories.includes(proposedChanges.category ?? '')) return false
    return proposedChanges[field] === requestedFields[field]
  })
}

const guardianMatch = (
  decision: ProductIntegrityGuardianDecision,
  candidates: readonly SemanticGroceryCandidate[]
): Pick<SemanticGroceryMatchResult, 'classification' | 'matches'> => {
  const candidate = candidates.find(({ id }) => id === decision.match.existingItemId)
  if (!candidate) return { classification: 'distinct', matches: [] }
  const matchType = decision.match.matchType === 'exact_duplicate' ? 'exact' : 'similar'
  const { id, name, category, bought, hidden, collapsed } = candidate
  return { classification: matchType, matches: [{ id, name, category, bought, hidden, collapsed, matchType }] }
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
    const guardian = parsed.guardian
    const scope = [listId, guardian?.listName ?? null]
    const candidates = await this.repository.listCandidates(listId, guardian?.listName)
    const snapshotId = await snapshotIdFor(candidates, scope)
    const evaluatedName = parsed.correctedName ?? parsed.query
    const editedItem = guardian?.operation === 'update'
      ? candidates.find(({ id }) => id === guardian.itemId)
      : undefined

    if ((parsed.expectedSnapshotId && parsed.expectedSnapshotId !== snapshotId) ||
        (guardian?.operation === 'update' && !editedItem)) {
      return {
        status: 'stale_request',
        evaluatedName,
        snapshotId,
        classification: 'distinct',
        matches: [],
        candidateCount: candidates.length
      }
    }

    if (!guardian && candidates.length > MAX_CANDIDATES) {
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
      const candidatesComplete = candidates.length <= MAX_CANDIDATES
      const suppliedCandidates = candidates.slice(0, MAX_CANDIDATES)
      if (editedItem && !suppliedCandidates.includes(editedItem)) {
        suppliedCandidates[suppliedCandidates.length - 1] = editedItem
      }
      const allowedCategories = await this.repository.listAllowedCategories?.(listId) ?? []
      const requestedFields = guardian && editedItem ? editFieldsFor(guardian, evaluatedName, editedItem) : {}
      const rawOutput = await waitForProvider(
        this.provider.evaluate({
          query: evaluatedName,
          candidates: suppliedCandidates,
          ...(guardian && { guardian, candidatesComplete, allowedCategories, requestedFields })
        }),
        this.providerTimeoutMs
      )
      const decision = productIntegrityGuardianDecisionSchema.safeParse(rawOutput)
      if (decision.success && validateGuardianDecision(
        decision.data, suppliedCandidates, allowedCategories, candidatesComplete, guardian, requestedFields
      )) {
        if (guardian) {
          await this.authorization.assertAccessible(context.principal, listId)
          const currentCandidates = await this.repository.listCandidates(listId, guardian.listName)
          const currentSnapshotId = await snapshotIdFor(currentCandidates, scope)
          if (snapshotId !== currentSnapshotId) {
            return {
              ...unavailableResult(evaluatedName, currentSnapshotId, currentCandidates.length),
              status: 'stale_request'
            }
          }
        }
        return {
          status: 'ok',
          evaluatedName,
          snapshotId,
          ...guardianMatch(decision.data, suppliedCandidates),
          candidateCount: candidates.length,
          candidatesComplete,
          decision: decision.data
        }
      }
      if (guardian) return unavailableResult(evaluatedName, snapshotId, candidates.length)

      // Keep the original advisory search response available to legacy callers.
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
