import { normalizeName } from '../../../lib/normalizeName'
import type {
  AiAssistantRequest,
  AiAssistantResult,
  AiInsightsResult,
  AiListChange,
  AiListReviewResult
} from '../domain/aiSchemas'

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * 60 * 1000
const CHANGE_WINDOW_MS = 30 * DAY_MS
const PURCHASE_WINDOW_MS = 90 * DAY_MS

export interface RetrievedAiContext extends AiAssistantRequest {
  ignoredCorrectionCount: number
}

// Removes only a provable correction pair: the same Firebase item key was added
// and then removed within sixty seconds. Similar names are intentionally not enough
// evidence, because two household members may add separate legitimate items.
export const filterTransientCorrections = (
  changes: AiListChange[],
  maxDurationMs = MINUTE_MS
): { changes: AiListChange[]; ignoredCorrectionCount: number } => {
  const ordered = changes
    .map((event, index) => ({ event, index, time: Date.parse(event.changedAt) }))
    .filter((entry) => !Number.isNaN(entry.time))
    .sort((a, b) => a.time - b.time)
  const ignored = new Set<number>()

  for (let i = 0; i < ordered.length; i += 1) {
    const added = ordered[i]
    if (added.event.type !== 'added' || ignored.has(added.index)) continue
    const removed = ordered.find(
      (candidate, candidateIndex) =>
        candidateIndex > i &&
        !ignored.has(candidate.index) &&
        candidate.event.type === 'removed' &&
        candidate.event.itemKey === added.event.itemKey &&
        candidate.time >= added.time &&
        candidate.time - added.time <= maxDurationMs
    )
    if (!removed) continue
    ignored.add(added.index)
    ignored.add(removed.index)
  }

  return {
    changes: changes.filter((_, index) => !ignored.has(index)),
    ignoredCorrectionCount: ignored.size / 2
  }
}

export const retrieveAiContext = (
  request: AiAssistantRequest,
  now = new Date()
): RetrievedAiContext => {
  // Current records can safely reconstruct additions from before the audit log was
  // introduced (including Siri/n8n additions). Deletions still require the explicit
  // append-only log because deleted records no longer exist in the live projection.
  const loggedAdds = new Set(
    request.changes.filter((event) => event.type === 'added').map((event) => event.itemKey)
  )
  const derivedAdds: AiListChange[] = request.items.flatMap((item) =>
    loggedAdds.has(item.key)
      ? []
      : [{
          type: 'added' as const,
          itemKey: item.key,
          itemName: item.name,
          previousName: null,
          listName: item.listName,
          changedAt: item.addedAt
        }]
  )
  const correctionFiltered = filterTransientCorrections([...request.changes, ...derivedAdds])
  const recentChanges = correctionFiltered.changes
    .filter((event) => {
      const time = Date.parse(event.changedAt)
      return !Number.isNaN(time) && time <= now.getTime() && time > now.getTime() - CHANGE_WINDOW_MS
    })
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, 120)
  const recentPurchases = request.purchases
    .filter((event) => {
      const time = Date.parse(event.purchasedAt)
      return !Number.isNaN(time) && time <= now.getTime() && time > now.getTime() - PURCHASE_WINDOW_MS
    })
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))
    .slice(0, 250)

  return {
    ...request,
    items: request.items.slice(0, 250),
    changes: recentChanges,
    purchases: recentPurchases,
    categories: [...new Set(request.categories)].slice(0, 60),
    ignoredCorrectionCount: correctionFiltered.ignoredCorrectionCount
  }
}

const safeCategory = (category: string, categories: string[]): string => {
  if (categories.includes(category)) return category
  if (categories.includes('אחר')) return 'אחר'
  return categories[0] ?? category
}

const knownProductAlias = (name: string): string | null => {
  const normalized = normalizeName(name)
    .replace(/[׳']/g, '')
    .replace(/\s+/g, ' ')
  if (normalized === 'קוטג' || normalized === 'גבינת קוטג') return 'cottage-cheese'
  return null
}

const knownAliasDuplicateGroups = (
  context: RetrievedAiContext,
  reservedKeys: Set<string>
) => {
  const groups = new Map<string, typeof context.items>()
  for (const item of context.items) {
    if (reservedKeys.has(item.key)) continue
    const alias = knownProductAlias(item.name)
    if (!alias) continue
    const groupKey = `${item.listName ?? ''}\u0000${alias}`
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), item])
  }
  const reason = context.language === 'he'
    ? 'אותו מוצר בשם שונה'
    : 'Same product under different names'
  return [...groups.values()].flatMap((items) => {
    if (items.length < 2) return []
    const [keep, ...remove] = items
    return [{ keepKey: keep.key, removeKeys: remove.map((item) => item.key), reason }]
  })
}

export const groundAiResult = (
  result: AiAssistantResult,
  context: RetrievedAiContext
): AiAssistantResult => {
  if (result.mode === 'insights') {
    const seen = new Set<string>()
    const activeNames = new Set(
      context.items
        .filter((item) => !item.bought)
        .map((item) => normalizeName(item.name))
        .filter(Boolean)
    )
    const proposedList = result.proposedList
      ? {
          ...result.proposedList,
          items: result.proposedList.items
            .filter((item) => {
              const normalized = normalizeName(item.name)
              if (!normalized || seen.has(normalized) || activeNames.has(normalized)) return false
              seen.add(normalized)
              return true
            })
            .map((item) => ({
              ...item,
              category: safeCategory(item.category, context.categories)
            }))
            .slice(0, 20)
        }
      : null
    return { ...result, proposedList } satisfies AiInsightsResult
  }

  const byKey = new Map(context.items.map((item) => [item.key, item]))
  const removed = new Set<string>()
  const duplicates = result.duplicates.flatMap((group) => {
    const keep = byKey.get(group.keepKey)
    if (!keep) return []
    const removeKeys = [...new Set(group.removeKeys)].filter((key) => {
      const candidate = byKey.get(key)
      if (!candidate || key === keep.key || removed.has(key)) return false
      // A product repeated in two separate custom lists is not a duplicate.
      if (candidate.listName !== keep.listName) return false
      removed.add(key)
      return true
    })
    return removeKeys.length > 0 ? [{ ...group, removeKeys }] : []
  })
  const renamed = new Set<string>()
  const renames = result.renames.flatMap((rename) => {
    const item = byKey.get(rename.key)
    if (!item || removed.has(rename.key) || renamed.has(rename.key)) return []
    if (normalizeName(item.name) === normalizeName(rename.suggestedName)) return []
    renamed.add(rename.key)
    return [{ ...rename, currentName: item.name }]
  })

  const reservedKeys = new Set(
    duplicates.flatMap((group) => [group.keepKey, ...group.removeKeys])
  )
  const knownAliasDuplicates = knownAliasDuplicateGroups(context, reservedKeys)
    .slice(0, Math.max(0, 30 - duplicates.length))

  return {
    mode: 'list_review',
    duplicates: [...duplicates, ...knownAliasDuplicates],
    renames
  } satisfies AiListReviewResult
}
