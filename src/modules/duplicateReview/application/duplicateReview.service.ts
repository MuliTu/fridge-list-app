import { ApplicationError, type RequestContext } from '../../shared'
import type { GroceryCommandService, ListAuthorizationRepository } from '../../groceries'

export type DuplicateReviewReason = 'alias' | 'exact' | 'substring' | 'token_overlap' | 'edit_distance'
export type DuplicateReviewStatus = 'open' | 'read'
export type DuplicateReviewFinding = { id: string; listId: string; listName: string; items: [{ id: string; name: string }, { id: string; name: string }]; reason: DuplicateReviewReason; score: number; createdAt: string; unread: boolean; status: DuplicateReviewStatus }
export type DuplicateReviewRepository = {
  list(listId: string, actorUid: string): Promise<DuplicateReviewFinding[]>
  markRead(listId: string, findingId: string, actorUid: string, nowIso: string): Promise<void>
  dismiss(listId: string, findingId: string, actorUid: string, nowIso: string): Promise<void>
  ignorePair(listId: string, findingId: string, actorUid: string, nowIso: string): Promise<void>
  claimDelete(listId: string, findingId: string, itemId: string, actorUid: string, nowIso: string): Promise<'claimed' | 'resolved'>
  completeDelete(listId: string, findingId: string, itemId: string, actorUid: string, nowIso: string): Promise<void>
}
export type DuplicateReviewAction = { action: 'read' | 'dismiss' | 'keep_both' } | { action: 'delete_one'; itemId: unknown }
const key = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value || value.length > 200 || value.trim() !== value || /[.#$/[\]\u0000-\u001f\u007f]/.test(value)) throw new ApplicationError('invalid_input', `${field} is invalid`)
  return value
}
export class DuplicateReviewService {
  constructor(private readonly repository: DuplicateReviewRepository, private readonly authorization: ListAuthorizationRepository, private readonly groceries: Pick<GroceryCommandService, 'delete'>) {}
  private actorUid(context: RequestContext): string {
    if (context.principal.kind !== 'user') throw new ApplicationError('forbidden', 'Only signed-in users can review duplicate findings')
    return key(context.principal.uid, 'actor')
  }
  async list(context: RequestContext, listId: string): Promise<{ findings: DuplicateReviewFinding[]; unreadCount: number }> {
    const normalizedListId = key(listId, 'listId')
    await this.authorization.assertAccessible(context.principal, normalizedListId, 'read')
    const findings = await this.repository.list(normalizedListId, this.actorUid(context))
    return { findings, unreadCount: findings.filter((finding) => finding.unread).length }
  }
  async act(context: RequestContext, listId: string, findingId: string, input: DuplicateReviewAction): Promise<void> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApplicationError('invalid_input', 'Duplicate review action must be an object')
    const normalizedListId = key(listId, 'listId'); const normalizedFindingId = key(findingId, 'findingId'); const actorUid = this.actorUid(context); const nowIso = context.now.toISOString()
    if (input.action === 'read' || input.action === 'dismiss') {
      await this.authorization.assertAccessible(context.principal, normalizedListId, 'read')
      await this.repository[input.action === 'read' ? 'markRead' : 'dismiss'](normalizedListId, normalizedFindingId, actorUid, nowIso)
      return
    }
    await this.authorization.assertAccessible(context.principal, normalizedListId, 'write')
    if (input.action === 'keep_both') { await this.repository.ignorePair(normalizedListId, normalizedFindingId, actorUid, nowIso); return }
    if (input.action !== 'delete_one') throw new ApplicationError('invalid_input', 'Unknown duplicate review action')
    const itemId = key(input.itemId, 'itemId')
    const claim = await this.repository.claimDelete(normalizedListId, normalizedFindingId, itemId, actorUid, nowIso)
    if (claim === 'resolved') return
    await this.groceries.delete(context, normalizedListId, itemId)
    await this.repository.completeDelete(normalizedListId, normalizedFindingId, itemId, actorUid, nowIso)
  }
}
