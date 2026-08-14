import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getKeepBoughtItemsInCategories,
  getShowBoughtItems,
  setKeepBoughtItemsInCategories,
  setShowBoughtItems
} from '../lib/firebase'

interface BoughtItemsPreferenceContextValue {
  keepBoughtItemsInCategories: boolean
  showBoughtItems: boolean
  isResolved: boolean
  saveError: boolean
  toggleBoughtItemsPlacement: () => Promise<void>
  toggleBoughtItemsVisibility: () => Promise<void>
}

const BoughtItemsPreferenceContext = createContext<BoughtItemsPreferenceContextValue | null>(null)

// Cross-device display preference stored at
// /users/{email}/config. Absent keys preserve the established defaults: bought
// items move into their own completed section and their cards start hidden.
export function BoughtItemsPreferenceProvider({
  email,
  children
}: {
  email: string | null | undefined
  children: ReactNode
}) {
  const [keepBoughtItemsInCategories, setKeepBoughtItemsInCategoriesState] = useState(false)
  const [showBoughtItems, setShowBoughtItemsState] = useState(false)
  const [isResolved, setIsResolved] = useState(!email)
  const [saveError, setSaveError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setKeepBoughtItemsInCategoriesState(false)
    setShowBoughtItemsState(false)
    setSaveError(false)

    if (!email) {
      setIsResolved(true)
      return () => {
        cancelled = true
      }
    }

    setIsResolved(false)
    Promise.allSettled([
      getKeepBoughtItemsInCategories(email),
      getShowBoughtItems(email)
    ])
      .then(([placement, visibility]) => {
        if (cancelled) return
        if (placement.status === 'fulfilled') {
          setKeepBoughtItemsInCategoriesState(placement.value)
        }
        if (visibility.status === 'fulfilled') {
          setShowBoughtItemsState(visibility.value)
        }
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

  const toggleBoughtItemsVisibility = async () => {
    if (!email || !isResolved) return
    const previous = showBoughtItems
    const next = !previous
    setShowBoughtItemsState(next)
    setSaveError(false)

    try {
      await setShowBoughtItems(email, next)
    } catch {
      setShowBoughtItemsState(previous)
      setSaveError(true)
      throw new Error('Failed to save bought-items visibility preference')
    }
  }

  return (
    <BoughtItemsPreferenceContext.Provider
      value={{
        keepBoughtItemsInCategories,
        showBoughtItems,
        isResolved,
        saveError,
        toggleBoughtItemsPlacement,
        toggleBoughtItemsVisibility
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
