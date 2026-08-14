import type { GroceryItem } from '../types'

export const filterBoughtItemsByVisibility = (
  entries: GroceryItem[],
  showBoughtItems: boolean
): GroceryItem[] => (showBoughtItems ? entries : entries.filter((entry) => !entry.bought))

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
