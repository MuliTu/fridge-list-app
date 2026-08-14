import {
  filterBoughtItemsByVisibility,
  partitionGroceryItemsByPlacement
} from './boughtItemsPlacement'
import type { GroceryItem } from '../types'

const entries = [
  { key: 'milk', item: 'Milk', category: 'Dairy', bought: false },
  { key: 'apples', item: 'Apples', category: 'Fruit', bought: true }
] as GroceryItem[]

describe('partitionGroceryItemsByPlacement', () => {
  it('uses the separate completed section by default', () => {
    const result = partitionGroceryItemsByPlacement(entries, false)

    expect(result.categoryEntries.map((entry) => entry.key)).toEqual(['milk'])
    expect(result.completedEntries.map((entry) => entry.key)).toEqual(['apples'])
  })

  it('keeps bought items in their original category when selected', () => {
    const result = partitionGroceryItemsByPlacement(entries, true)

    expect(result.categoryEntries.map((entry) => entry.key)).toEqual(['milk', 'apples'])
    expect(result.completedEntries).toEqual([])
  })
})

describe('filterBoughtItemsByVisibility', () => {
  it('hides bought cards without removing unbought cards', () => {
    expect(filterBoughtItemsByVisibility(entries, false)).toEqual([entries[0]])
  })

  it('keeps every card when bought items are shown', () => {
    expect(filterBoughtItemsByVisibility(entries, true)).toEqual(entries)
  })
})
