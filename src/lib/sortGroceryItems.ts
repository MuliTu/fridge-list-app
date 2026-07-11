import type { GroceryItem } from '../types'

export type SortOption = 'default' | 'name-asc' | 'name-desc' | 'updated-desc' | 'updated-asc'

export const SORT_OPTIONS: SortOption[] = ['default', 'name-asc', 'name-desc', 'updated-desc', 'updated-asc']

// "Last updated" per this app's actual data model: `modified_at` is stamped on every
// web-app write (bought/note/image — see Data Model in CLAUDE.md), so it does reflect a
// bought/unbought toggle, not just content edits. Falls back to `added_at` for an item
// that's never been touched since creation.
const lastUpdated = (entry: GroceryItem) => entry.modified_at || entry.added_at || ''

// Locale-aware comparator (FR-2/3, i18n requirement) — Intl.Collator handles diacritics
// and per-locale collation correctly, unlike a plain string compare.
const collatorCompare = (locale: string) => {
  const collator = new Intl.Collator(locale, { sensitivity: 'base' })
  return (a: string, b: string) => collator.compare(a, b)
}

// Applies the chosen sort to one category's items. 'default' preserves this app's
// pre-existing behavior (unbought first, then bought, each in add order). Every other
// option sorts the FULL set together per FR-9 ("all items ... regardless of checked/
// unchecked status"), superseding the bought-sinks-to-bottom default — Array.prototype
// .sort is stable in all supported engines, satisfying FR-8.
export function sortGroceryItems(entries: GroceryItem[], sortOption: SortOption, locale: string): GroceryItem[] {
  const sorted = [...entries]
  const compareNames = collatorCompare(locale)

  switch (sortOption) {
    case 'name-asc':
      return sorted.sort((a, b) => compareNames(a.item || '', b.item || ''))
    case 'name-desc':
      return sorted.sort((a, b) => compareNames(b.item || '', a.item || ''))
    case 'updated-desc':
      return sorted.sort((a, b) => lastUpdated(b).localeCompare(lastUpdated(a)))
    case 'updated-asc':
      return sorted.sort((a, b) => lastUpdated(a).localeCompare(lastUpdated(b)))
    default:
      return sorted.sort((a, b) => {
        if (!!a.bought !== !!b.bought) return a.bought ? 1 : -1
        return (a.added_at || '').localeCompare(b.added_at || '')
      })
  }
}
