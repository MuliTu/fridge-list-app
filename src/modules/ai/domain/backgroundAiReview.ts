import { z } from 'zod'

export const BACKGROUND_REVIEW_ITEM_LIMIT = 300

export const backgroundReviewRequestSchema = z.object({
  version: z.string().regex(/^[a-f0-9]{64}$/),
  language: z.enum(['en', 'he'])
}).strict()

export type BackgroundReviewItem = {
  key: string
  item: string
  bought: boolean
  list_name: string | null
}

export const backgroundReviewItems = (entries: readonly (Omit<BackgroundReviewItem, 'list_name'> & { list_name?: string | null })[]): BackgroundReviewItem[] =>
  entries
    .filter(({ key, item, list_name }) => !list_name && typeof key === 'string' && typeof item === 'string' && Boolean(item.trim()))
    .map(({ key, item, bought }) => ({
      key,
      item,
      bought: bought === true,
      list_name: null
    }))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

const reviewKey = z.string().min(1).max(200).regex(/^[^.#$/\[\]\u0000-\u001f\u007f]+$/)

export const applyBackgroundReviewSchema = z.object({
  actorUid: z.string().min(1).max(128),
  operationId: z.string().uuid(),
  version: backgroundReviewRequestSchema.shape.version,
  removals: z.array(reviewKey).max(120),
  renames: z.array(z.object({ key: reviewKey, name: z.string().trim().min(1).max(200) }).strict()).max(15)
}).strict().refine(({ removals, renames }) => {
  const keys = [...removals, ...renames.map(({ key }) => key)]
  return keys.length > 0 && new Set(keys).size === keys.length
}, 'Select distinct items')
