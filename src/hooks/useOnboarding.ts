import { useEffect, useState } from 'react'
import { getOnboardingDismissed, setOnboardingDismissed } from '../lib/firebase'

// Cross-device preference now (was localStorage-only) — lives at
// /users/{email}/config/onboardingDismissed (see configRef in lib/firebase.ts), the
// first of what's meant to become a general home for per-user configurable settings.
// isOpen starts false and stays false until the Firebase read resolves with
// dismissed=false, so a returning user on a fresh device never flashes the tutorial
// before their real preference loads; replay() can still force it open at any time
// regardless of that read's timing.
export const useOnboarding = (email: string | null | undefined) => {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!email) return
    let cancelled = false
    getOnboardingDismissed(email).then((dismissed) => {
      if (!cancelled && !dismissed) setIsOpen(true)
    })
    return () => {
      cancelled = true
    }
  }, [email])

  const close = (dontShowAgain: boolean) => {
    setIsOpen(false)
    if (dontShowAgain && email) {
      setOnboardingDismissed(email).catch(() => {
        // best-effort persistence only
      })
    }
  }

  const replay = () => setIsOpen(true)

  return { isOpen, close, replay }
}
