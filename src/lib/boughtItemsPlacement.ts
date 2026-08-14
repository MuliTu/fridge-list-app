import type { GroceryItem } from '../types'

export function partitionGroceryItemsByPlacement(
  entries: GroceryItem[],
  keepBoughtItemsInCategories: boolean
) {
  if (keepBoughtItemsInCategories) {
    return { categoryEntries: entries, completedEntries: [] }
  }

  return {
    categoryEntries: entries.filter((entry) => !entry.bought),
    completedEntries: entries.filter((entry) => entry.bought)
  }
}
