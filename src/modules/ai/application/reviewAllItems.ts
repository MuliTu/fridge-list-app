import { z } from 'zod'
import { aiListReviewResultSchema, type AiListReviewResult } from '../domain/aiSchemas'
import type { RetrievedAiContext } from './aiRetrieval'

export const REVIEW_BATCH_SIZE = 25
const batchResultSchema = aiListReviewResultSchema.extend({
  reviewedKeys: z.array(z.string())
})

/** Every batch sees the entire list so duplicates across batch boundaries remain visible. */
export async function reviewAllItems(
  context: RetrievedAiContext,
  review: (keys: string[], signal: AbortSignal) => Promise<unknown>,
  signal?: AbortSignal
): Promise<AiListReviewResult> {
  const batches: string[][] = []
  for (let i = 0; i < context.items.length; i += REVIEW_BATCH_SIZE) {
    batches.push(context.items.slice(i, i + REVIEW_BATCH_SIZE).map((item) => item.key))
  }
  const results: AiListReviewResult[] = new Array(batches.length)
  const controller = new AbortController()
  const batchSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  let cursor = 0
  try {
    await Promise.all(Array.from({ length: Math.min(3, batches.length) }, async () => {
      while (cursor < batches.length) {
        batchSignal.throwIfAborted()
        const index = cursor++
        const keys = batches[index]
        for (let attempt = 0; attempt < 2; attempt++) {
          batchSignal.throwIfAborted()
          const parsed = batchResultSchema.safeParse(await review(keys, batchSignal))
          if (parsed.success) {
            const result = parsed.data
            const reviewed = new Set(result.reviewedKeys)
            const targets = new Set(keys)
            if (reviewed.size === targets.size && keys.every((key) => reviewed.has(key)) &&
              result.renames.every((rename) => targets.has(rename.key)) &&
              result.duplicates.every((group) => group.removeKeys.every((key) => targets.has(key)))) {
              results[index] = result
              break
            }
          }
          if (attempt === 1) throw new Error('AI list review did not cover every requested item')
        }
      }
    }))
  } catch (error) {
    controller.abort(error)
    throw error
  }

  // Merge overlapping duplicate groups into disjoint groups with a stable keeper.
  const byKey = new Map(context.items.map((item) => [item.key, item]))
  const parent = new Map(context.items.map((item) => [item.key, item.key]))
  const root = (key: string): string => {
    const next = parent.get(key)!
    if (next === key) return key
    const found = root(next)
    parent.set(key, found)
    return found
  }
  const reasons = new Map<string, string>()
  for (const result of results) {
    for (const group of result.duplicates) {
      const keep = byKey.get(group.keepKey)
      if (!keep) continue
      for (const key of group.removeKeys) {
        const item = byKey.get(key)
        if (!item || item.listName !== keep.listName || key === keep.key) continue
        parent.set(root(key), root(keep.key))
        reasons.set(key, group.reason)
        reasons.set(keep.key, group.reason)
      }
    }
  }
  const groups = new Map<string, string[]>()
  for (const item of context.items) {
    const key = root(item.key)
    groups.set(key, [...(groups.get(key) ?? []), item.key])
  }
  const duplicates = [...groups.values()].filter((keys) => keys.length > 1).map(([keepKey, ...removeKeys]) => ({
    keepKey, removeKeys, reason: reasons.get(keepKey)!
  }))
  const removed = new Set(duplicates.flatMap((group) => group.removeKeys))
  const renames = [...new Map(results.flatMap((result) => result.renames)
    .filter((rename) => byKey.has(rename.key) && !removed.has(rename.key))
    .map((rename) => [rename.key, rename])).values()]
  return aiListReviewResultSchema.parse({ mode: 'list_review', duplicates, renames })
}
