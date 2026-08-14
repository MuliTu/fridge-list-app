import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getKeepBoughtItemsInCategories,
  setKeepBoughtItemsInCategories
} from '../lib/firebase'

interface BoughtItemsPreferenceContextValue {
  keepBoughtItemsInCategories: boolean
  isResolved: boolean
  saveError: boolean
  toggleBoughtItemsPlacement: () => Promise<void>
}

const BoughtItemsPreferenceContext = createContext<BoughtItemsPreferenceContextValue | null>(null)

// Cross-device display preference stored at
// /users/{email}/config/keepBoughtItemsInCategories. An absent key preserves the
// established default: bought items move into their own completed section.
export function BoughtItemsPreferenceProvider({
  email,
  children
}: {
  email: string | null | undefined
  children: ReactNode
}) {
  const [keepBoughtItemsInCategories, setKeepBoughtItemsInCategoriesState] = useState(false)
  const [isResolved, setIsResolved] = useState(!email)
  const [saveError, setSaveError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setKeepBoughtItemsInCategoriesState(false)
    setSaveError(false)

    if (!email) {
      setIsResolved(true)
      return () => {
        cancelled = true
      }
    }

    setIsResolved(false)
    getKeepBoughtItemsInCategories(email)
      .then((enabled) => {
        if (!cancelled) setKeepBoughtItemsInCategoriesState(enabled)
      })
      .catch(() => {
        // Keep the backward-compatible completed-section default when the
        // preference cannot be read. The next mount will try again.
      })
      .finally(() => {
        if (!cancelled) setIsResolved(true)
      })

    return () => {
      cancelled = true
    }
  }, [email])

  const toggleBoughtItemsPlacement = async () => {
    if (!email || !isResolved) return
    const previous = keepBoughtItemsInCategories
    const next = !previous
    setKeepBoughtItemsInCategoriesState(next)
    setSaveError(false)

    try {
      await setKeepBoughtItemsInCategories(email, next)
    } catch {
      setKeepBoughtItemsInCategoriesState(previous)
      setSaveError(true)
      throw new Error('Failed to save bought-items placement preference')
    }
  }

  return (
    <BoughtItemsPreferenceContext.Provider
      value={{
        keepBoughtItemsInCategories,
        isResolved,
        saveError,
        toggleBoughtItemsPlacement
      }}
    >
      {children}
    </BoughtItemsPreferenceContext.Provider>
  )
}

export function useBoughtItemsPreference() {
  const context = useContext(BoughtItemsPreferenceContext)
  if (!context) {
    throw new Error('useBoughtItemsPreference must be used within BoughtItemsPreferenceProvider')
  }
  return context
}
