import { useState } from 'react'

const STORAGE_KEY = 'onboardingDismissed'

const readStored = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

// Client-only UI preference, same localStorage-only philosophy as
// useCollapsedSections/useStockSuggestion — never written to Firebase, so dismissing
// the tutorial on the tablet has no effect on anyone's phone. Defaults to open (not
// dismissed) so a brand-new device always sees it once.
export function useOnboarding() {
  const [isOpen, setIsOpen] = useState<boolean>(() => !readStored())

  const close = (dontShowAgain: boolean) => {
    setIsOpen(false)
    if (dontShowAgain) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true')
      } catch {
        // best-effort persistence only
      }
    }
  }

  const replay = () => setIsOpen(true)

  return { isOpen, close, replay }
}
