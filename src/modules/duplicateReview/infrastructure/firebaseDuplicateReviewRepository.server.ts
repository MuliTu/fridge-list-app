import '@tanstack/react-start/server-only'
import type { App } from 'firebase-admin/app'
import { getDatabaseWithUrl, type Database } from 'firebase-admin/database'
import { ApplicationError } from '../../shared'
import type { DuplicateReviewFinding, DuplicateReviewReason, DuplicateReviewRepository } from '../application/duplicateReview.service'
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
const segment = (value: string, field: string): string => { if (!value || value.length > 200 || value.trim() !== value || /[.#$/[\]\u0000-\u001f\u007f]/.test(value)) throw new ApplicationError('invalid_input', `${field} is invalid`); return value }
const reason = (value: unknown): DuplicateReviewReason | null => value === 'alias' || value === 'exact' || value === 'substring' || value === 'token_overlap' || value === 'edit_distance' ? value : null
const fail = (message: string, error: unknown): never => { if (error instanceof ApplicationError) throw error; throw new ApplicationError('upstream_failed', message, error) }
export class FirebaseDuplicateReviewRepository implements DuplicateReviewRepository {
  constructor(private readonly database: Database) {}
  async list(listId: string, actorUid: string): Promise<DuplicateReviewFinding[]> {
    try {
      const household = object((await this.database.ref(`users/${segment(listId, 'listId')}`).get()).val()); const findings = object(household.duplicate_findings); const groceries = object(household.groceries); const views = object(object(household.duplicate_finding_views)[segment(actorUid, 'actor')]); const listName = typeof household.name === 'string' ? household.name : listId
      return Object.entries(findings).flatMap(([id, raw]) => {
        const finding = object(raw); const view = object(views[id]); const ids = Array.isArray(finding.itemIds) ? finding.itemIds : []; const findingReason = reason(finding.reason); const left = typeof ids[0] === 'string' ? object(groceries[ids[0]]) : {}; const right = typeof ids[1] === 'string' ? object(groceries[ids[1]]) : {}
        if ((finding.state !== 'open' && finding.state !== 'read') || view.dismissedAt || ids.length !== 2 || !findingReason || typeof finding.score !== 'number' || typeof finding.createdAt !== 'string' || typeof left.item !== 'string' || typeof right.item !== 'string') return []
        const unread = !view.readAt
        return [{ id, listId, listName, items: [{ id: ids[0], name: left.item }, { id: ids[1], name: right.item }], reason: findingReason, score: finding.score, createdAt: finding.createdAt, unread, status: unread ? 'open' : 'read' } satisfies DuplicateReviewFinding]
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    } catch (error) { return fail('Firebase duplicate review read failed', error) }
  }
  private async updateView(listId: string, findingId: string, actorUid: string, patch: Record<string, string>): Promise<void> {
    try { const value = object((await this.database.ref(`users/${segment(listId, 'listId')}/duplicate_findings/${segment(findingId, 'findingId')}`).get()).val()); if ((value.state !== 'open' && value.state !== 'read') || !Array.isArray(value.itemIds)) throw new ApplicationError('not_found', 'Duplicate finding is no longer actionable'); await this.database.ref(`users/${listId}/duplicate_finding_views/${segment(actorUid, 'actor')}/${findingId}`).transaction((current) => ({ ...object(current), ...patch })) } catch (error) { fail('Firebase duplicate review state update failed', error) }
  }
  markRead(listId: string, findingId: string, actorUid: string, nowIso: string) { return this.updateView(listId, findingId, actorUid, { readAt: nowIso }) }
  dismiss(listId: string, findingId: string, actorUid: string, nowIso: string) { return this.updateView(listId, findingId, actorUid, { readAt: nowIso, dismissedAt: nowIso }) }
  async ignorePair(listId: string, findingId: string, actorUid: string, nowIso: string) { await this.transition(listId, findingId, actorUid, nowIso, 'ignored') }
  async claimDelete(listId: string, findingId: string, itemId: string, actorUid: string, nowIso: string): Promise<'claimed' | 'resolved'> {
    try {
      const normalizedFindingId = segment(findingId, 'findingId')
      const normalizedItemId = segment(itemId, 'itemId')
      const result = await this.database.ref(`users/${segment(listId, 'listId')}/duplicate_findings/${normalizedFindingId}`).transaction((current) => {
        const finding = object(current)
        if (finding.state === 'resolved' && finding.deletedItemId === normalizedItemId) return finding
        if (finding.state === 'deleting' && finding.deletingItemId === normalizedItemId) return finding
        if ((finding.state !== 'open' && finding.state !== 'read') || !Array.isArray(finding.itemIds) || finding.itemIds.length !== 2 || !finding.itemIds.includes(normalizedItemId)) return undefined
        return { ...finding, state: 'deleting', deletingItemId: normalizedItemId, deletingBy: actorUid, updatedAt: nowIso }
      })
      if (!result.committed) throw new ApplicationError('not_found', 'Duplicate finding is no longer actionable')
      const claimed = object(result.snapshot.val())
      if (claimed.state === 'resolved' && claimed.deletedItemId === normalizedItemId) return 'resolved'
      if (claimed.state === 'deleting' && claimed.deletingItemId === normalizedItemId) return 'claimed'
      throw new ApplicationError('not_found', 'Duplicate finding is no longer actionable')
    } catch (error) { return fail('Firebase duplicate delete claim failed', error) }
  }
  async completeDelete(listId: string, findingId: string, itemId: string, actorUid: string, nowIso: string) {
    try {
      const normalizedFindingId = segment(findingId, 'findingId')
      const normalizedItemId = segment(itemId, 'itemId')
      const result = await this.database.ref(`users/${segment(listId, 'listId')}`).transaction((current) => {
        const household = object(current); const findings = object(household.duplicate_findings); const finding = object(findings[normalizedFindingId])
        if (finding.state === 'resolved' && finding.deletedItemId === normalizedItemId) return household
        if (finding.state !== 'deleting' || finding.deletingItemId !== normalizedItemId) return undefined
        findings[normalizedFindingId] = { ...finding, state: 'resolved', updatedAt: nowIso, resolvedBy: actorUid, deletedItemId: normalizedItemId, deletingItemId: null, deletingBy: null }
        const allViews = object(household.duplicate_finding_views); const actorViews = object(allViews[actorUid]); actorViews[normalizedFindingId] = { ...object(actorViews[normalizedFindingId]), readAt: nowIso, resolvedAt: nowIso }; allViews[actorUid] = actorViews
        return { ...household, duplicate_findings: findings, duplicate_finding_views: allViews }
      })
      if (!result.committed) throw new ApplicationError('not_found', 'Duplicate finding is no longer actionable')
    } catch (error) { fail('Firebase duplicate delete completion failed', error) }
  }
  private async transition(listId: string, findingId: string, actorUid: string, nowIso: string, state: 'ignored' | 'resolved', deletedItemId?: string) {
    try { let stale = false; const result = await this.database.ref(`users/${segment(listId, 'listId')}`).transaction((current) => { const household = object(current); const findings = object(household.duplicate_findings); const finding = object(findings[segment(findingId, 'findingId')]); if (finding.state === state) return household; if ((finding.state !== 'open' && finding.state !== 'read') || !Array.isArray(finding.itemIds) || (deletedItemId && !finding.itemIds.includes(segment(deletedItemId, 'itemId')))) { stale = true; return undefined } findings[findingId] = { ...finding, state, updatedAt: nowIso, resolvedBy: actorUid, ...(deletedItemId ? { deletedItemId } : {}) }; const allViews = object(household.duplicate_finding_views); const actorViews = object(allViews[actorUid]); actorViews[findingId] = { ...object(actorViews[findingId]), readAt: nowIso, resolvedAt: nowIso }; allViews[actorUid] = actorViews; return { ...household, duplicate_findings: findings, duplicate_finding_views: allViews } }); if (!result.committed || stale) throw new ApplicationError('not_found', 'Duplicate finding is no longer actionable') } catch (error) { fail('Firebase duplicate finding transition failed', error) }
  }
}
export const createFirebaseDuplicateReviewRepository = (app: App, databaseUrl: string) => new FirebaseDuplicateReviewRepository(getDatabaseWithUrl(databaseUrl, app))
