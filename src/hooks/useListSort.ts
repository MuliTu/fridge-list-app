import { useEffect, useState } from 'react'
import type { SortOption } from '../lib/sortGroceryItems'

const STORAGE_KEY = 'listSortByUserList'

const readStored = (): Record<string, SortOption> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// Per-user, per-list sort preference (FR-7), keyed by `${userEmail}:${listKey}` so a
// shared device with more than one signed-in user keeps each person's own choice
// distinct. Client-only localStorage, never written to Firebase — sorting is a personal
// view preference, not shared list data, matching Scenario 6 (User B's view must not
// change when User A re-sorts) and the same "per device" philosophy already used by
// useShowPurchased/useCollapsedSections.
export function useListSort(listKey: string, userEmail: string | null | undefined) {
  const [map, setMap] = useState<Record<string, SortOption>>(readStored)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  }, [map])

  const storageKey = `${userEmail || 'anon'}:${listKey}`
  const sortOption = map[storageKey] || 'default'

  const setSortOption = (option: SortOption) => {
    setMap((prev) => ({ ...prev, [storageKey]: option }))
  }

  return { sortOption, setSortOption }
}
