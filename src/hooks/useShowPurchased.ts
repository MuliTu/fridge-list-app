import { useEffect, useState } from 'react'

const STORAGE_KEY = 'showPurchasedByList'

const readStored = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// Per-list preference for whether purchased (bought) items are shown in the shopping
// list. Default is hidden (false) so the list stays focused on what's still left to
// buy. Persisted per list name in localStorage — a client-only UI preference, never
// written to Firebase, so toggling it on the tablet doesn't affect anyone's phone
// (same philosophy as useCollapsedSections).
export function useShowPurchased(listKey: string) {
  const [map, setMap] = useState<Record<string, boolean>>(readStored)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  }, [map])

  const showPurchased = !!map[listKey]

  const toggle = () => {
    setMap((prev) => ({ ...prev, [listKey]: !prev[listKey] }))
  }

  return { showPurchased, toggle }
}
