import { z } from 'zod'
import { OTHER_CATEGORY_NAME } from '../../../lib/categories'
import { normalizeName } from '../../../lib/normalizeName'

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
  category?: string
}

export const backgroundReviewItems = (entries: readonly (Omit<BackgroundReviewItem, 'list_name'> & { list_name?: string | null })[]): BackgroundReviewItem[] =>
  entries
    .filter(({ key, item, list_name }) => !list_name && typeof key === 'string' && typeof item === 'string' && Boolean(item.trim()))
    .map(({ key, item, bought, category }) => ({
      key,
      item,
      bought: bought === true,
      list_name: null,
      ...(typeof category === 'string' && category ? { category } : {})
    }))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

// Whole-name equivalence keeps qualifiers such as שרי, קפוא, and רוטב intact.
const productNames: Record<string, readonly string[]> = {
  'עגבניות': ['עגבנייה', 'עגבניה'],
  'אפרסקים': ['אפרסק'],
  'מלפפונים': ['מלפפון'],
  'בננות': ['בננה'],
  'תפוחים': ['תפוח'],
  'תפוזים': ['תפוז'],
  'גזרים': ['גזר'],
  'בצלים': ['בצל'],
  'ביצים': ['ביצה'],
  'לחמניות': ['לחמנייה', 'לחמניה'],
  'פיתות': ['פיתה'],
  'מגבונים': ['מגבון'],
  'חיתולים': ['חיתול']
}

const productAliases = new Map(Object.entries(productNames)
  .flatMap(([canonical, aliases]) => aliases.map((alias) => [alias, canonical] as const)))

export const groceryReviewName = (name: string) => {
  const normalized = normalizeName(name).normalize('NFC').replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, '')
  return productAliases.get(normalized) ?? normalized
}

export const BACKGROUND_REVIEW_CATEGORY_LIMIT = 100
export const BACKGROUND_REVIEW_CATEGORY_CORRECTION_LIMIT = BACKGROUND_REVIEW_ITEM_LIMIT

export const isUncategorizedReviewItem = ({ category }: BackgroundReviewItem): boolean =>
  !category?.trim() || category.trim() === OTHER_CATEGORY_NAME || category.trim().toLowerCase() === 'other'

export const isReviewCategoryName = (name: string): boolean =>
  Boolean(name.trim()) && name !== OTHER_CATEGORY_NAME && name.toLowerCase() !== 'other' && !/[\u0000-\u001f\u007f]/.test(name)

const reviewKey = z.string().min(1).max(200).regex(/^[^.#$/\[\]\u0000-\u001f\u007f]+$/)

export const applyBackgroundReviewSchema = z.object({
  actorUid: z.string().min(1).max(128),
  operationId: z.string().uuid(),
  version: backgroundReviewRequestSchema.shape.version,
  removals: z.array(reviewKey).max(120),
  renames: z.array(z.object({ key: reviewKey, name: z.string().trim().min(1).max(200) }).strict()).max(15),
  categoryChanges: z.array(z.object({ key: reviewKey, category: z.string().trim().min(1).max(100), createCategory: z.boolean().optional() }).strict()).max(BACKGROUND_REVIEW_CATEGORY_CORRECTION_LIMIT).default([])
}).strict().refine(({ removals, renames, categoryChanges }) => {
  const nameKeys = [...removals, ...renames.map(({ key }) => key)]
  const categoryKeys = [...removals, ...categoryChanges.map(({ key }) => key)]
  return nameKeys.length + categoryChanges.length > 0 &&
    new Set(nameKeys).size === nameKeys.length && new Set(categoryKeys).size === categoryKeys.length
}, 'Select distinct items')
