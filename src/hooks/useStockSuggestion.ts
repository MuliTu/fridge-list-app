import { useEffect, useState } from 'react'

const STORAGE_KEY = 'stockSuggestionEnabled'

// Whether the "add this to your home inventory?" prompt is offered after marking a
// shopping-list item as bought. Default is ON (an absent key reads as enabled) so the
// feature works out of the box; users who find the prompt noisy can turn it off from the
// settings menu. A client-only UI preference persisted in localStorage — never written
// to Firebase, matching the per-device behavior of useCollapsedSections.
const readStored = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

// Read the current value directly, outside React state — used at the moment an item is
// marked bought (in an event handler in a different component than the settings toggle),
// so the gate always reflects the latest choice without needing cross-component state sync.
export function isStockSuggestionEnabled(): boolean {
  return readStored()
}

export function useStockSuggestion() {
  const [enabled, setEnabled] = useState<boolean>(readStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled))
    } catch {
      // ignore write failures (private mode, etc.) — the in-memory value still applies
    }
  }, [enabled])

  const toggle = () => setEnabled((prev) => !prev)

  return { enabled, toggle }
}
