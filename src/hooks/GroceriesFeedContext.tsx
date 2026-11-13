import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { onValue } from '../lib/firebase'
import { useIsPrerendering } from './useIsPrerendering'
import { useActiveList } from './ListContext'
import type { GroceryItem } from '../types'

interface GroceriesFeedValue {
  entries: GroceryItem[]
  status: string
  toast: string | null
  isLoading: boolean
  hasError: boolean
  retry: () => void
  hasCurrentSnapshot?: boolean
}

export const GroceriesFeedContext = createContext<GroceriesFeedValue | null>(null)

// Single shared onValue subscription for the active list's /groceries, mounted once
// at the layout level so the "new item" toast and status line stay visible across
// every tab, not just the shopping list. Re-subscribes whenever the active list
// changes (switching households) — knownKeys/firstLoad reset too, so a fresh list's
// existing items never get mistaken for "newly added" and trigger a toast.
export function GroceriesFeedProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const [entries, setEntries] = useState<GroceryItem[]>([])
  const [status, setStatus] = useState(t('workspace.feedConnecting'))
  const [toast, setToast] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [retryGeneration, setRetryGeneration] = useState(0)
  const knownKeys = useRef(new Set<string>())
  const firstLoad = useRef(true)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPrerendering = useIsPrerendering()
  const { listApi } = useActiveList()
  const retry = useCallback(() => setRetryGeneration((generation) => generation + 1), [])
  const [loadedApi, setLoadedApi] = useState<typeof listApi>(null)

  useEffect(() => {
    if (isPrerendering) return
    knownKeys.current = new Set()
    firstLoad.current = true
    setEntries([])
    setIsLoading(true)
    setHasError(false)
    setStatus(t('workspace.feedConnecting'))
    setToast(null)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setLoadedApi(null)
    if (!listApi) return

    let active = true

    const unsubscribe = onValue(
      listApi.groceriesRef,
      (snapshot) => {
        if (!active) return
        const data = snapshot.val() || {}
        const newlyAdded: string[] = []

        const nextEntries: GroceryItem[] = Object.entries(data as Record<string, any>).map(
          ([key, entry]) => {
            const isFresh = !firstLoad.current && !knownKeys.current.has(key)
            if (isFresh) newlyAdded.push(entry.item)
            return { key, ...entry, isFresh }
          }
        )

        knownKeys.current = new Set(Object.keys(data))

        if (newlyAdded.length > 0 && !firstLoad.current) {
          const message = t('workspace.feedAdded', { items: newlyAdded.join(', ') })
          setToast(message)
          if (toastTimer.current) clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => setToast(null), 4500)
        }

        firstLoad.current = false
        setIsLoading(false)
        setHasError(false)
        setEntries(nextEntries)
        setLoadedApi(listApi)
        setStatus(
          t('workspace.feedUpdated', {
            time: new Date().toLocaleTimeString(i18n.language === 'he' ? 'he-IL' : 'en-GB', {
              hour: '2-digit',
              minute: '2-digit'
            })
          })
        )
      },
      (error) => {
        if (!active) return
        active = false
        setEntries([])
        setIsLoading(false)
        setHasError(true)
        setToast(null)
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setLoadedApi(null)
        setStatus(t('workspace.feedError', { message: error.message }))
      }
    )

    return () => {
      active = false
      unsubscribe()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [isPrerendering, listApi, t, i18n.language, retryGeneration])

  return (
    <GroceriesFeedContext.Provider value={{ entries, status, toast, isLoading, hasError, retry, hasCurrentSnapshot: Boolean(listApi && loadedApi === listApi) }}>
      {children}
    </GroceriesFeedContext.Provider>
  )
}

export function useGroceriesFeed() {
  const ctx = useContext(GroceriesFeedContext)
  if (!ctx) throw new Error('useGroceriesFeed must be used within GroceriesFeedProvider')
  return ctx
}
