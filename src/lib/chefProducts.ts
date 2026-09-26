import { normalizeName } from './normalizeName'
import type { GroceryItem } from '../types'

const NON_FOOD_CATEGORY_NAMES = new Set([
  'מוצרי תינוקות',
  'מזון לחיות מחמד',
  'טיפוח אישי',
  'ניקיון וכביסה',
  'נייר ומוצרי היגיינה',
  'חד פעמי ואחסון',
  'baby products',
  'pet food',
  'pets',
  'personal care',
  'cleaning',
  'laundry',
  'paper',
  'hygiene',
  'disposable',
  'storage',
  'household'
].map(normalizeName))

const NON_FOOD_CATEGORY_TERMS = [
  'ניקיון',
  'כביסה',
  'טיפוח',
  'היגיינה',
  'נייר',
  'חד פעמי',
  'אחסון',
  'חיות מחמד',
  'תינוקות',
  'clean',
  'laundry',
  'personal care',
  'hygiene',
  'paper',
  'disposable',
  'storage',
  'household',
  'pet',
  'baby'
].map(normalizeName)

export const isChefFoodProduct = (entry: GroceryItem) => {
  const category = normalizeName(entry.category || '')
  if (!category) return true
  if (NON_FOOD_CATEGORY_NAMES.has(category)) return false
  return !NON_FOOD_CATEGORY_TERMS.some((term) => category.includes(term))
}
